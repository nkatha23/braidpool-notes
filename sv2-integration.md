# Braidpool SV2 Integration — Updated Implementation Document v2

## Reference Links

- **reference branch**: https://github.com/braidpool/braidpool/tree/sv2-integration-braidpool
- **SV2 apps fork**: https://github.com/braidpool/sv2-apps

---

## 1. Problem and Motivation

Bitcoin mining is 80%+ centralized. Braidpool solves this with a DAG-based weak block protocol where every valid share becomes a bead in a directed acyclic graph, consensus is established by graph structure, and payouts are enforced on-chain with no trusted operator.

The current stratum layer is hand-rolled SV1 TCP in `node/src/stratum.rs`. Three production blockers:
- No authentication between pool components — MITM can inject fake jobs
- No Future Job mechanism — template propagation latency is high
- No native path for SV2 hardware (Bitshoka, future ASICs)

---

## 2. What SV2 Gives Braidpool

**Used:**
- Noise NX-handshake encrypted channel between pool and translator proxy — pool authenticates with static authority keypair, prevents job injection
- Extended Channel for pool↔tproxy job distribution — one channel, tproxy subdivides extranonce space downstream
- Future Job — pool pre-sends `NewExtendedMiningJob` with `min_ntime` unset, activates instantly via `SetNewPrevHash`, cuts template propagation latency dramatically
- Native SV2 miner support (future path for Bitshoka)

**Explicitly NOT used:**
- Job Declaration Protocol (JDP) — miners don't select transactions in Braidpool
- Template Distribution Protocol (TDP) — replaced by Braidpool's own IPC pipeline
- `roles_logic_sv2` — bundles JDP/TDP assumptions
- `bitcoin-core-sv2` — replaced by `braidpool-template-provider`

---

## 3. Repository Architecture Decision

```
braidpool/sv2-apps   ← SV2 protocol layer (pool, translator, template provider)
braidpool/braidpool  ← Node wiring, bead bridge, main.rs changes
```

`braidpool-common` is the shared type boundary between the two repos. It currently exports `PoolNetwork` and `Cpunet`. It needs to also export or re-export the types that sv2-apps needs from the node — specifically anything the template provider consumes.

**pros: Why split repos:**
- SRI upstream changes can be absorbed in sv2-apps without touching braidpool node
- SV2 protocol reviewers can review sv2-apps independently
- Braidpool node PRs stay small — only wiring, not SV2 implementation

**cons:** When `braidpool-common` types change, sv2-apps dependency must be updated. When `NotifyCmd` or `BlockTemplate` fields change in node, sv2-apps pool crate may need updating.

---

## 4. Key Finding from sv2-integration-braidpool

 `sv2-integration-braidpool` branch contains the reference implementation. His architecture reveals three critical design decisions that supersede our earlier analysis:

### 4.1 Coinbase source — `processed_block_hex`, not separator scan

Our earlier doc said to scan for `EXTRANONCE_SEPARATOR = [1u8; 16]`. Sansh's approach is better:

`template_creator.rs` already builds the complete Braidpool coinbase (with OP_RETURN commitment) and stores it in `block_template.processed_block_hex` as a serialized `bitcoin::Block`. The template provider deserializes this block, extracts the coinbase transaction, and passes it to `build_new_template`.

```rust
// braidpool-template-provider/src/sv2_messages.rs
let coinbase_tx: Transaction = if let Some(processed_hex) = &block_template.processed_block_hex {
    if !processed_hex.is_empty() {
        let block: bitcoin::Block = deserialize(processed_hex)?;
        block.txdata[0].clone()  // coinbase is always first transaction
    } else {
        // fallback to components.coinbase_transaction
        deserialize(&components.coinbase_transaction)?
    }
} else {
    deserialize(&components.coinbase_transaction)?
};
```

`processed_block_hex` lives in `node/src/ipc.rs` at line 473. It is set by `template_creator.rs` during block template processing. It is NOT in `braidpool-common` — this is a dependency to resolve (see section 7).

### 4.2 Coinbase split in braidpool mode

In `build_new_template`, when `braidpool_mode = true`, ALL outputs are included:

```rust
// sv2_messages.rs — build_new_template
let outputs_to_include: Vec<_> = if braidpool_mode {
    // Include ALL: reward[0] + segwit[1] + OP_RETURN[2]
    coinbase_tx.output.iter().cloned().collect()
} else {
    // Standard SRI: only reward output
    vec![coinbase_tx.output[0].clone()]
};
```

The pool's `factory.rs` then uses these outputs directly as `coinbase_tx_prefix` for downstream miners. This means the OP_RETURN commitment travels in the coinbase outputs, which are part of `coinbase_tx_suffix` in the serialized transaction (outputs come after inputs). The `NewTemplate` message carries `coinbase_tx_outputs` separately as a field — this is TDP-specific and not the same as the Extended Channel's `coinbase_tx_prefix`/`coinbase_tx_suffix` split. The factory handles the reassembly.

#### ⚠️ Coinbase value/outputs DOUBLING bug 
 review of sv2-apps #1 found a real protocol-correctness bug, confirmed in code:

- **TP side** (`sv2_messages.rs::build_new_template`): sets
  `coinbase_tx_value_remaining = sum(all outputs)` (the full reward) **and** ships
  all of those same outputs in `coinbase_tx_outputs`.
- **Pool side** (`channel_manager/template_distribution_message_handler.rs:50,60`):
  `coinbase_output[0].value = msg.coinbase_tx_value_remaining` and builds the pool's
  **own** payout output from it (`PayoutMode::coinbase_outputs(value_remaining, reward_script)`),
  while the job *also* carries the template's `coinbase_tx_outputs`.
- **Result:** the reward is counted twice — a pool payout output worth the full
  reward **plus** the node's full coinbase outputs. Invalid coinbase.

This is the **same root cause** as mstrr's "single-output assumption" point: the
pool's model (one output valued at `value_remaining` via a single
`coinbase_reward_script`) can't express EDCA's multi-output payout. braidpool_mode's
"ship all outputs" is the intended multi-output path, but it collides with the
pool synthesizing its own output.

**Fix — a Braidpool payout mode. ✅ IMPLEMENTED in #2, commit `722518a8` (3 files):**
1. **`stratum-apps/src/payout.rs`:** `PayoutMode::Braidpool` whose `coinbase_outputs()`
   returns **`vec![]`** — the pool adds no output of its own; the node's
   `coinbase_tx_outputs` are the complete set. Pool-selected only (deliberately **not**
   parseable from a miner's `user_identity`).
2. **Pool activation (`channel_manager`):** a `braidpool_mode` flag set from
   `TemplateProviderType::BraidpoolIpc`; a `resolve_payout_mode()` helper returns
   `Braidpool` for every downstream when in braidpool mode, ignoring identity.
3. **No handler rewrite needed:** the template handler already builds the coinbase via
   `payout_mode.coinbase_outputs()`, so once the mode is `Braidpool` (empty) the pool
   contributes nothing → no doubling. `coinbase_tx_value_remaining` becomes dead for
   braidpool downstreams.

**#3 was folded into #2** (one PR), not a separate PR — the activation needs #2's
`BraidpoolIpc` signal, so they belong together.

**Still a #1 follow-up:** the TP should set `coinbase_tx_value_remaining = 0` in
braidpool_mode (cleanliness — the field should honestly read 0). It couldn't land in
#1 alone: with the old pool behavior `value_remaining = 0` would leave a **0-value pool
output**. Now that the pool-side fix is in, flipping it is safe anytime. → EDCA
multi-output payouts (`edca-payouts.md` §3 `build_payout_distribution`) depend on this
path being correct.

**Also fixed in #1 from the same review (quick, landed):**
- `changed()` now handles the `Err` case (watch sender dropped) — graceful shutdown
  with a warning instead of silently stalling the consumer.
- `Cargo.lock` regenerated to include `braidpool-common` + `braidpool-template-provider`
  (the PR added workspace members without updating the lockfile → `--locked` CI fail).

#### Worked example (why it's critical, not cosmetic)

3.125 BTC subsidy + 0.1 BTC fees = 3.225 BTC available.
- Template outputs pay **3.225 BTC** to miners via EDCA.
- `value_remaining` also says **3.225 BTC**.
- Pool handler adds its own output of **3.225 BTC**.
- Coinbase pays **6.45 BTC** > allowed → **block rejected as invalid**.

Miners can still submit shares, so nothing looks wrong until a real block is found
and rejected. Same issue Copilot flagged in Sept 2025 as "coinbase value/outputs
semantics" — **marked resolved without being fixed**.

#### Remaining follow-ups (after the pool-side fix)

1. **TP `coinbase_tx_value_remaining = 0`** in braidpool_mode (#1) — small and safe now
   that the pool adds nothing; remove the `196e38b` TODO in the same commit.
2. **Regtest test: Bitcoin Core accepts a braidpool-mode block.** This is the real proof
   the doubling is gone. It's also the **only** enforcement that outputs stay within
   subsidy + fees — ⚠️ *correction to the earlier "add a trust check" idea:* the pool
   **can't** do a `sum ≤ subsidy+fees` assertion, because it only gets the outputs +
   merkle path, not the fee breakdown, so it can't recompute fees. Core validating the
   real block is the check.
3. **Witness commitment output** — preserved automatically (the pool passes through the
   node's full outputs, which include it); the regtest test confirms it.
4. **Coinbase size.** EDCA → potentially hundreds of outputs → larger coinbase and every
   job. Check the ~500-output bitcoind limit via IPC and how output count interacts with
   job size / extranonce (§7). **Reconcile with EDCA's node-side `MAX_PAYOUT_OUTPUTS = 64`**
   (`edca-payouts.md` §3) — is 64 deliberate or a placeholder vs the ~500 limit?
5. **Recompute per template.** Fees change each template, so the node must recompute
   payouts on **every template change**, not only on new beads. Confirm the coinbase
   sent always matches the template's current fees.

### 4.3 BeadContext and Schnorr keys in SwarmHandler

`SwarmHandler::new()` now takes `auth_key_secret: Secp256k1SecretKey` and `auth_key_public: Secp256k1PublicKey`. This fixes audit finding 10 — the hardcoded placeholder key. The authority keypair from the Noise handshake flows into bead commitment signing.

```rust
// pool/src/lib/braidpool/mod.rs
let (swarm_handler, swarm_command_receiver) = SwarmHandler::new(
    Arc::clone(&self.braid),
    db_tx.clone(),
    auth_key_secret,
    auth_key_public,
);
```

`BraidpoolP2P::spawn()` now returns `Arc<tokio::sync::Mutex<SwarmHandler>>` as an additional return value so the pool can call `propagate_valid_bead` through it.

---

## 5. Key Files to Read

**In `braidpool/braidpool` (upstream/dev):**

| File | What to understand |
|------|-------------------|
| `node/src/ipc.rs:473` | `processed_block_hex` field — where the complete Braidpool coinbase lives |
| `node/src/template_creator.rs` | How `processed_block_hex` is populated — the coinbase with OP_RETURN |
| `node/src/lib.rs` | `ipc_template_consumer`, `EXTRANONCE_SEPARATOR`, `EXTRANONCE1_SIZE=8`, `EXTRANONCE2_SIZE=8` |
| `node/src/stratum.rs` | `handle_submit`, `GlobalJobStore`, `construct_job_notification`, `NotifyCmd` |
| `node/src/main.rs` | `notification_tx = mpsc::channel` — single consumer, needs broadcast fanout |
| `braidpool-common/src/lib.rs` | Currently exports only cpunet and error — shared type boundary |
| `node/src/config.rs` | `bitcoin::Network` with CPUNet variant — no `PoolNetwork` enum |

**In `sv2-integration-braidpool` branc:**

| File | What to understand |
|------|-------------------|
| `braidpool-template-provider/src/lib.rs` | `sv2_template_consumer` — sibling to `ipc_template_consumer`, waits for `CoinbaseOutputConstraints` |
| `braidpool-template-provider/src/sv2_messages.rs` | `build_new_template`, `build_new_template_from_block_template`, `build_block_submission_request` |
| `pool/src/lib/braidpool/mod.rs` | `BeadContext`, `BraidpoolP2P::spawn` with auth keys, `SwarmHandler` returned |
| `pool/src/lib/channel_manager/mining_message_handler.rs` | `SubmitShareExtended` handling, bead creation path |
| `sv2/channels-sv2/src/server/jobs/factory.rs` | How `NewExtendedMiningJob` is built from `NewTemplate` in braidpool mode |

**In `braidpool/sv2-apps` fork (upstream synced):**

| Path | What to understand |
|------|-------------------|
| `pool-apps/pool/src/` | SRI's pool — what we're adapting, not replacing |
| `miner-apps/translator/src/` | SRI's translator — extranonce subdivision, SV1↔SV2 translation |
| `stratum-apps/src/` | Noise helpers, key management — use as-is |

---

## 6. The Dependency Problem — `processed_block_hex`

`block_template.processed_block_hex` is defined in `node/src/ipc.rs`. The sv2-apps pool crate cannot import from `node` directly without creating a circular dependency (`node` → `sv2-apps pool` → `node`).

Three options:

- **Option A** — move `BlockTemplate` to `braidpool-common`. The template type becomes a shared type, both node and sv2-apps import it from there. Clean but requires a prerequisite PR.
- **Option B** — sv2-apps takes node as a git dependency. Sansh's branch already does this (`use node::ipc::BlockTemplate`). Creates tight coupling and a messy dependency graph — not recommended.
- **Option C** — define a minimal `BraidpoolTemplate` struct in `braidpool-common` that carries only what sv2-apps needs: `coinbase_tx_prefix`, `coinbase_tx_suffix`, `merkle_path`, `prev_hash`, `nbits`, `version`, `height`. Node converts `BlockTemplate → BraidpoolTemplate` before sending over the channel.

**Priority: Options A and C.** Both keep the dependency boundary clean. Option C is the current PR 0 approach and unblocks everything. Option A is a longer-term cleanup. Option B (git dependency) should not be pursued.

---

## 7. Extranonce Layout

The translator proxy opens an Extended Channel against Braidpool's pool. The pool assigns a 4-byte prefix to that channel and tells the translator how many bytes it may use for its own extranonce (`extranonce_size`). The translator subdivides that budget across all downstream miners. Two operating modes:

### Normal Mode

Commitment bytes are not embedded in the extranonce — used when downstream miners don't need on-chain auditability.

```
extranonce_size requested by tproxy = 12
─────────────────────────────────────────
Pool prefix:   4B  pool-assigned, same for all miners on this channel
Miner slot:    2B  tproxy-assigned, unique per miner (up to 65,536 miners)
Miner rolls:  10B  ~281 trillion combinations per nonce roll
─────────────────────────────────────────
ext1 to miner = pool_prefix[4] + slot[2] = 6B
ext2 to miner =                            10B
Total         = 4 + 2 + 10              = 16B
```

### Audit Mode

The 5-byte Braidpool commitment is embedded in the extranonce. Every share is auditable against the commitment without additional messaging.

```
extranonce_size requested by tproxy = 8
─────────────────────────────────────────
Pool prefix:          4B  pool-assigned
Miner slot:           2B  tproxy-assigned, unique per miner
Braidpool commitment: 5B  metadata hash, fixed per slot
Miner rolls:          1B  256 combinations — all auditable
─────────────────────────────────────────
ext1 to miner = pool_prefix[4] + slot[2] + commitment[5] = 11B
ext2 to miner =                                             1B
Total         = 4 + 2 + 5 + 1                            = 12B
```

The 1-byte miner roll (256 nonces per slot) is sufficient because Braidpool's weak-block target is set high enough that miners find a qualifying share well within 256 rolls.

### Reconstruction before upstream submit

The pool originally agreed to `extranonce_prefix=4B, extranonce_size=8B`. When forwarding a share upstream, the translator strips the commitment back out:

```
reconstructed ext1 = pool_prefix[4]
reconstructed ext2 = slot[2] + commitment[5] + rolling[1] = 8B  ✓
```

The upstream pool sees exactly the 4+8 format it negotiated — it never sees the internal slot/commitment breakdown.

### Constants (from `node/src/lib.rs`)

```rust
pub const EXTRANONCE1_SIZE: usize = 8;      // half of separator
pub const EXTRANONCE2_SIZE: usize = 8;      // miner-controlled
pub const EXTRANONCE_SEPARATOR: [u8; 16] = [1u8; 16];
```

---

## 8. The PRs — Current State

### sv2-apps PR #4 — Fix `bitcoin-core-sv2` field renames (compile blocker)

**GitHub:** `braidpool/sv2-apps#4`  **Branch:** `fix/bitcoin-core-sv2-field-renames`  **Status:** CLOSED — resolved upstream  

The field renames were fixed in `stratum-mining/sv2-apps` (commit `14841ab7`: "refactor!: adapt to the ntime_start, ntime and nonce field renames") and pulled into `braidpool/sv2-apps:sv2-integration-braidpool` via upstream sync. PR #4 was redundant and has been closed. Issue `braidpool/sv2-apps#3` is resolved.

---

### sv2-apps PR #1 — `braidpool-common` + `braidpool-template-provider` (combines original PR 0 + PR 1)

**GitHub:** `braidpool/sv2-apps#1`  **Branch:** `braidpool/template-provider`  **Status:** Open  
**Depends on:** sv2-apps PR #4 merged

`braidpool-common` and `braidpool-template-provider` were merged into a single PR since both are prerequisites with no reviewable split. `braidpool-common` defines `BraidpoolTemplate` (the shared type boundary); `braidpool-template-provider` consumes it and produces SV2 `TemplateDistribution` messages.

Key types in `pool-apps/braidpool-common/src/template.rs`:
```rust
pub struct BraidpoolTemplate {
    pub coinbase_tx: Vec<u8>,        // full serialized coinbase from template_creator
    pub merkle_path: Vec<[u8; 32]>,
    pub prev_hash: [u8; 32],
    pub nbits: u32,
    pub version: i32,
    pub height: u32,
    pub template_id: u64,
    pub header_timestamp: u32,
}
```

Key function in `pool-apps/braidpool-template-provider/src/sv2_messages.rs`:
```rust
pub fn build_new_template(
    template: &BraidpoolTemplate,
    future_template: bool,
) -> Result<NewTemplateOwned, TemplateDataError>
// braidpool_mode=true: ALL outputs included (reward + segwit + OP_RETURN)
```

Copilot findings (all fixed in commits `9f564f7`, `c5b29a6`):
- `header_timestamp=0` → added `header_timestamp` field to `BraidpoolTemplate`
- empty coinbase inputs guard added
- closed channel handled in `select!` loops
- unit tests added for `build_new_template` and `build_set_new_prev_hash`

---

### sv2-apps PR #2 — Share bridge + `ValidatedShare` + `BraidpoolIpc` wiring

**GitHub:** `braidpool/sv2-apps#2`  **Branch:** `braidpool/noise-channel-manager`  **Status:** Open  
**Depends on:** sv2-apps PR #1 (must merge first — provides `braidpool-common` and `braidpool-template-provider`)

This PR has 4 commits:
1. `fe0bfdf1` — feat(pool): bridge validated shares from SV2 pool to Braidpool node
2. `0ba82cd9` — fix(pool): populate template_id from active job in Valid share arm
3. `e302ff22` — feat(pool): add channel_id to ValidatedShare
4. `67b91dba` — feat(pool): wire BraidpoolIpc template provider and expose ShareBridgeReceiver ← **our addition**

**Why it can't compile standalone:** commit 4 imports `braidpool_common::template::BraidpoolTemplate` and `braidpool_template_provider::sv2_template_consumer`, which only exist after PR #1 merges. This is expected for a stacked PR — the branch is correct, it just won't build without its prerequisite.

**After PR #1 merges into `sv2-integration-braidpool`:**
```bash
git fetch upstream
git rebase upstream/sv2-integration-braidpool
git push --force-with-lease origin braidpool/noise-channel-manager
```
The duplicate cherry-picked commits will drop automatically; only the 4 commits above remain.

---

#### Original share bridge additions (commits 1–3)

New module `pool-apps/pool/src/lib/braidpool/mod.rs`:
```rust
pub struct ValidatedShare {
    pub template_id: Option<u64>,  // None only for custom-job shares
    pub channel_id: u32,
    pub extranonce1: Vec<u8>,
    pub extranonce2: Vec<u8>,
    pub version: u32,
    pub ntime: u32,
    pub nonce: u32,
}

pub struct BeadContext { ... }          // deferred to node PR 5 wiring
pub enum ExtraNonceConfig { ... }       // Normal / Audit mode extranonce sizing
pub type ShareBridgeSender = mpsc::UnboundedSender<ValidatedShare>;
pub type ShareBridgeReceiver = mpsc::UnboundedReceiver<ValidatedShare>;
pub fn create_share_bridge() -> (ShareBridgeSender, ShareBridgeReceiver)
```

Key decisions:
- `template_id` for `Valid` shares: read from `extended_channel.get_active_job()` → `JobOrigin::NewTemplate(t)` → `t.template_id`. **Not** from braidpool's `GlobalJobStore` — that lives in `stratum.rs` and is unrelated to sv2-apps.
- `ShareBridgeReceiver` kept alive in `PoolRuntime` until node PR 5 wires it to `propagate_valid_bead`.
- `UnboundedSender::send()` is non-async — safe to call inside SRI's sync closures without blocking.

---

#### BraidpoolIpc wiring (commit 4)

**Files changed:**
- `stratum-apps/src/tp_type.rs` — new `BraidpoolIpc` variant (no config fields; channel wired at runtime)
- `pool-apps/pool/src/lib/mod.rs` — `PoolSv2` additions
- `pool-apps/pool/src/lib/pool_runtime.rs` — `PoolRuntime` threading + `bootstrap_template_provider` handler
- `pool-apps/pool/src/main.rs` — update standalone binary call to `pool.start(None)`
- `pool-apps/pool/Cargo.toml` — add `braidpool-common` and `braidpool-template-provider` deps

**`PoolSv2` new API:**
```rust
// Builder — call before start() when template_provider_type = BraidpoolIpc
pub fn with_braidpool_template_watch(
    self,
    rx: tokio::sync::watch::Receiver<Option<BraidpoolTemplate>>,
) -> Self

// Updated start() — delivers ShareBridgeReceiver to caller before blocking on shutdown
pub async fn start(
    &self,
    share_rx_notify: Option<tokio::sync::oneshot::Sender<ShareBridgeReceiver>>,
) -> Result<(), PoolErrorKind>
```

`braidpool_template_rx` is stored as `Arc<std::sync::Mutex<Option<watch::Receiver<Option<BraidpoolTemplate>>>>>` on `PoolSv2` so the struct stays `Clone`. It is taken out once during `PoolRuntime::new()` and consumed in `bootstrap_template_provider`.

`BraidpoolIpc` in `bootstrap_template_provider` spawns `sv2_template_consumer` as a managed task. It errors with `PoolErrorKind::Configuration` if `with_braidpool_template_watch()` was not called before `start()`. `BraidpoolIpc` is also blocked from using JDS (same as `Sv2Tp` — requires `BitcoinCoreIpc`).

TOML config for `BraidpoolIpc`:
```toml
template_provider_type = "BraidpoolIpc"
# No address or keys needed — channel is injected by the node at runtime
```

---

### braidpool PR #561 — Wire node to produce BraidpoolTemplate + real PoolSv2 consumer (combines original PR 4 + PR 5)

**GitHub:** `braidpool/braidpool#561`  **Branch:** `feat/sv2-pool-wiring`  **Status:** Open  
**Note:** PR #595 (`feat/sv2-pool-consumer`) was closed; its work was folded into #561 directly.  
**Depends on:** sv2-apps PRs #4, #1, #2 all merged

This PR does two things in one branch:
1. Produces `BraidpoolTemplate` from `ipc_template_consumer` and wires the SV2 template channel in `main.rs`
2. Replaces the drain task placeholder with the real `PoolSv2` consumer and `ShareBridgeReceiver` logging

Key CLI args added:
```
--sv2-pool-port <PORT>         SV2 pool listen port — enables SV2 mode when set
--sv2-authority-pubkey <HEX>   Pool authority public key (Noise NX)
--sv2-authority-seckey <HEX>   Pool authority secret key
```

**`node/Cargo.toml`** additions (added when #595 was folded in):
```toml
pool_sv2 = { git = "https://github.com/braidpool/sv2-apps", branch = "sv2-integration-braidpool" }

[patch."https://github.com/braidpool/sv2-apps"]
braidpool-common = { path = "./braidpool-common" }
```

**`node/src/main.rs`** — real pool consumer wiring (uses `watch` channel):
```rust
let sv2_template_tx = args.sv2_pool_port.map(|port| {
    let (tx, rx) = watch::channel::<Option<BraidpoolTemplate>>(None);
    let pool_config = build_sv2_pool_config(&args, port);
    let pool = PoolSv2::new(pool_config).with_braidpool_template_watch(rx);
    let (share_rx_tx, share_rx_rx) = tokio::sync::oneshot::channel();
    tokio::spawn(async move {
        if let Err(e) = pool.start(Some(share_rx_tx)).await {
            error!("SV2 pool exited with error: {e}");
        }
    });
    tokio::spawn(async move {
        match share_rx_rx.await {
            Ok(mut share_receiver) => {
                while let Some(share) = share_receiver.recv().await {
                    // TODO: propagate_valid_bead(share) — wires into bead DAG
                    info!(template_id = ?share.template_id, channel_id = share.channel_id, "ValidatedShare received from SV2 pool");
                }
            }
            Err(_) => warn!("SV2 pool shut down before share bridge was ready"),
        }
    });
    info!(port = port, "SV2 pool started in BraidpoolIpc mode");
    tx
});
```

SV1 stratum service runs unchanged in parallel. SV2 is purely additive. `propagate_valid_bead` wiring deferred to a later PR.

---

### braidpool PR 5 — Translator binary (thin wrapper)

**GitHub:** `braidpool/braidpool#637`  **Branch:** `feat/sv2-translator`  **Status:** Draft  
**Depends on:** braidpool PR #561 merged, sv2-apps PRs #1/#2 merged

Thin binary crate at workspace root. Delegates entirely to SRI's `translator_sv2` crate from the sv2-apps fork — no Braidpool-specific extranonce logic. Gets SV1 miners connected to the SV2 pool end-to-end.

```toml
[dependencies]
translator_sv2 = { git = "https://github.com/braidpool/sv2-apps", branch = "sv2-integration-braidpool" }
stratum_apps   = { git = "https://github.com/braidpool/sv2-apps", branch = "sv2-integration-braidpool" }
```

`main.rs` is 30 lines: load config → `TranslatorSv2::new(config)` → `translator.start()` + Ctrl+C shutdown.

Config (`braidpool-translator.toml.example`):
```toml
[upstream]
pool_address    = "127.0.0.1:34254"
authority_pubkey = "..."  # must match pool's --sv2-authority-pubkey

[downstream]
listen_address      = "0.0.0.0:3355"
min_extranonce2_size = 6
```

**What this does NOT do:** Braidpool commitment embedding in the extranonce. Standard SRI extranonce subdivision only. Commitment embedding is PR 6.

---

### braidpool PR 6 — Extranonce commitment embedding (audit mode)

**Branch:** `feat/sv2-translator-audit` (not yet created)  
**Depends on:** PR #637 merged

Extends the translator with Braidpool-specific extranonce subdivision for audit mode. Overrides SRI's default extranonce handling to embed the 5-byte commitment in the extranonce sent to each miner.

**Audit mode layout (what this PR implements):**
```
extranonce_size requested = 8  (2B slot + 5B commitment + 1B roll)
ext1 to miner = pool_prefix[4] + slot[2] + commitment[5] = 11B
ext2 to miner =                                             1B
```

**Reconstruction before upstream submit:**
```
reconstructed ext1 = pool_prefix[4]
reconstructed ext2 = slot[2] + commitment[5] + rolling[1] = 8B
```

**Key work:**
- Override `OpenExtendedMiningChannel` to request `extranonce_size = 8` instead of the default
- Per-miner slot assignment (2B, up to 65,536 miners)
- Commitment bytes derived from `BraidpoolTemplate` fields (committed metadata hash)
- Strip commitment on `SubmitSharesExtended` before forwarding upstream
- `ValidatedShare.extranonce1` carries the full 11B for UHPO attribution

---

## 9. Template Channel Design — watch vs mpsc

The node→pool template channel was originally `tokio::sync::mpsc`. It was changed to `tokio::sync::watch` in PR #561 (node) and sv2-apps PRs #1/#2 (pool) for three reasons:

**1. mpsc blocks or silently drops on a new block tip.**
A bounded mpsc blocks `ipc_template_consumer` if the pool is slow — the IPC connection to Bitcoin Core stalls. An unbounded mpsc queues stale templates; the pool works through N−1 stale blocks before reaching the current tip, keeping miners on stale work the entire time.

**2. watch is latest-wins and non-blocking.**
`watch::send()` always overwrites the slot and returns immediately. If two `TipChanged` events arrive while the pool is busy, they collapse to one. The pool always wakes up to the freshest template, never a queued stale one.

**3. Clean shutdown detection.**
When the node drops `watch::Sender`, `rx.changed()` returns `Err(RecvError)` — the pool's `sv2_template_consumer` exits cleanly. With mpsc, a dropped sender just means `recv()` returns `None` — same behaviour, but watch makes it explicit and symmetrical with the `Err` path.

**Height guard in `ipc_template_consumer` (node/src/lib.rs):**
Bitcoin Core sends an initial template before `TipChanged` arrives, with `height = 0`. This is a placeholder. The node skips forwarding it over the watch channel (`height == 0` guard) so the pool never receives a zero-height phantom template. The `None` sentinel that `watch::channel` is initialized with serves the same role at the pool end — `borrow_and_update()` returns `None` for the initial value and `sv2_template_consumer` skips it with `None => continue`.

**Latency pipeline (two layers — not redundant):**

| Layer | What it fixes | PRs |
|-------|--------------|-----|
| 1 — IPC → SV2 forward | Node's IPC loop never stalls; pool always holds the latest template | #561 (watch channel) |
| 2 — Pool → per-miner fanout | Miners receive `NewExtendedMiningJob` (future job) before `SetNewPrevHash` arrives — zero-latency job activation | #528, #543 |

Layer 1 ensures the template is current when Layer 2 fanout fires. Fixing only Layer 2 without Layer 1 means the fanout can run on a stale template from a queued mpsc message.

**Files changed for the watch migration:**

| File | Change |
|------|--------|
| `node/src/lib.rs` | `ipc_template_consumer` takes `watch::Sender<Option<BraidpoolTemplate>>`; height guard; closed-sender detection sets sender to `None` |
| `node/src/main.rs` | `watch::channel(None)` replaces mpsc; `with_braidpool_template_watch(rx)` |
| `node/src/ipc.rs` | `get_template()` gains `block_height: u32`; initial call gets `0` |
| `sv2-apps pool/mod.rs` | `with_braidpool_template_watch(watch::Receiver<Option<...>>)` replaces `with_braidpool_template_rx` |
| `sv2-apps pool/pool_runtime.rs` | Field type updated to `watch::Receiver<Option<...>>` |
| `sv2-apps braidpool-tp/lib.rs` | `sv2_template_consumer` takes `watch::Receiver`; loop uses `changed()` + `borrow_and_update()`; `None => continue` skips sentinel |

---

## 11. PR Ordering

```
[sv2-apps PR #4 CLOSED — compile blocker resolved upstream via stratum-mining sync]
sv2-apps PR #1 (braidpool-common + braidpool-template-provider)
    branch: braidpool/template-provider → sv2-integration-braidpool
    ↓ must merge before PR #2 — PR #2 imports these crates
sv2-apps PR #2 (share bridge + ValidatedShare + BraidpoolIpc wiring)
    branch: braidpool/noise-channel-manager → sv2-integration-braidpool
    ↓ after PR #1 merges: git fetch && git rebase upstream/sv2-integration-braidpool
    ↓ cherry-picked commits will drop automatically; only the 4 commits above remain
    ↓ (all sv2-apps PRs merged into sv2-integration-braidpool)
braidpool PR #561 (node wiring + real PoolSv2 consumer — combines old PR 4 + PR 5)
    branch: feat/sv2-pool-wiring
    note: PR #595 closed, work folded into #561
    ↓
braidpool PR #637 / PR 5 (translator binary — thin SRI wrapper)
    branch: feat/sv2-translator  Status: Draft
    gets SV1 miners connected; no commitment embedding yet
    ↓
braidpool PR 6 (extranonce commitment embedding — audit mode)
    branch: feat/sv2-translator-audit — not yet created
    overrides SRI extranonce: slot[2] + commitment[5] + rolling[1] = 8B
    strips commitment before upstream submit
```

**Prerequisites already done:** #492, #503 merged.

**Key interdependency note:** sv2-apps PR #2 imports `BraidpoolTemplate` from `braidpool-common` (PR #1) and calls `sv2_template_consumer` from `braidpool-template-provider` (PR #1). It will not compile without PR #1. After PR #1 merges, rebase PR #2 onto `sv2-integration-braidpool` — duplicate cherry-picked commits drop automatically.

---

## 12. Dependency Versions — Verify First

```bash
# In sv2-apps
cat rust-toolchain.toml          # MSRV 1.85.0
grep "bitcoin" pool-apps/pool/Cargo.toml

# In braidpool node (after #398)
grep "bitcoin" node/Cargo.toml
cargo build -p node 2>&1 | head -20
```

Resolve any version conflict in a standalone commit before PR 1.

---

## 13. Upstream Blocker — ~~`bitcoin_core_sv2` Compile Error on `sv2-integration-braidpool`~~ RESOLVED

**Status: RESOLVED** — Fixed in `stratum-mining/sv2-apps` commit `14841ab7` ("refactor!: adapt to the ntime_start, ntime and nonce field renames") and pulled into `braidpool/sv2-apps:sv2-integration-braidpool` via upstream sync (as of 2026-10-23). sv2-apps PR #4 was opened for this but closed as redundant once the sync landed.

The compile blocker no longer affects PR #561 or any future braidpool PRs that add `pool_sv2 = { git = ..., branch = "sv2-integration-braidpool" }` as a dependency.

> ⚠️ **Re-surfaced (2026-11-20):** reviewing #637, `cargo check` against
> `sv2-integration-braidpool` at commit `9d49b98` hit this exact error again —
> `stratum-apps` fails against `stratum_core` with 13 errors (`codec_sv2::Error::MissingBytes`
> not found, etc.). So the field-rename fix may **not** actually be on the current
> branch HEAD, or a later commit regressed it. **Verify `sv2-integration-braidpool`
> compiles standalone before claiming the stack is green** — #637 at minimum does not.

---

## 14. Audit Findings 

| # | Finding | Status |
|---|---------|--------|
| 1 | Separator scan vs offset | Resolved — use `processed_block_hex` deserialization |
| 2 | OP_RETURN in suffix | Confirmed correct — outputs are in `coinbase_tx_suffix` |
| 3 | extranonce1 = 4 bytes | Confirmed — `UPSTREAM_EXTRANONCE1_SIZE = 4` |
| 4 | Audit extranonce 11 bytes | Handled — `ValidatedShare.extranonce1: Vec<u8>` |
| 5 | mpsc single consumer / stale template on backpressure | Fixed — switched to `watch::channel`; latest-wins, non-blocking, any number of receivers |
| 6 | PoolNetwork doesn't exist | Use `bitcoin::Network` directly |
| 7 | height = Zero | Fixed — `BraidpoolTemplate.height` from `ipc_template.components` |
| 8 | f64 precision in PoW | Fixed in PR 3 — use U256 target from SetTarget |
| 9 | Per-peer job map | Fixed — write against post-#492 `GlobalJobStore` |
| 10 | Placeholder pubkey | Fixed — Sansh's auth key flows into `SwarmHandler::new` in PR 2 |

---

## 15. Future: End-to-End Latency Instrumentation (micro-timestamps)

**Status: future work — its own PR/stack, deliberately NOT part of any single PR
(#637 or otherwise).** Documented here so the design is captured.

### Why it's a separate stack (not in #637 or any one binary)

The headline metric is **"tip change → last miner notified"** — the time from a new
Bitcoin tip to the slowest miner receiving the activating job. Measuring it requires
**six timestamp points spread across three components**, so they *cannot* live in the
translator binary (#637) or any single crate even if we wanted them to:

| Timestamp point | Component | Code anchor (approx) |
|---|---|---|
| block notification received | **node** (IPC) | `ipc.rs::ipc_block_listener` (`TipChanged`) |
| template built | **node** | `lib.rs::ipc_template_consumer` (BraidpoolTemplate built) |
| job sent to first / last miner | **pool fan-out / translator** | `pool …channel_manager` `NewExtendedMiningJob` send; translator SV1 `mining.notify` |
| share received | **pool** | `mining_message_handler::SubmitSharesExtended` |
| share validated | **pool** | `extended_channel.validate_share` → `ValidatedShare` |
| bead broadcast | **node** | `main.rs` share-bridge consumer → `propagate_valid_bead` (once wired) |

Because the points span node + pool + translator, the instrumentation is a
cross-cutting observability workstream, not a feature of any one PR.

### What it is: the SV2/stratum twin of the P2P propagation harness

This is the miner↔pool analogue of the node↔node bead-propagation-latency harness
(see `propagation-latency-harness.md`). Same shape:

- **Join key:** `template_id`, which already threads end-to-end
  (`BraidpoolTemplate.template_id` → `ValidatedShare.template_id`). No wire-format
  change needed — emit structured log events keyed by `template_id`, join offline.
- **Metric:** report `p50` and `p99` of each segment and of the full
  tip→last-miner path, at **N = 100, 1,000, 10,000** miners, driven by the load
  generator (PR #659's JMeter + cpuminer threads).
- **Clock skew:** MVP on a **single host** (skew = 0, exact); add chrony/PTP only
  when scaling cross-host. Identical discipline to the p2p harness §3.

### Hooks that already exist (scaffolding in place)

- `BeadContext.received_at: Instant` (sv2-apps #2) — the pool-side "template
  received" timestamp hook; its doc comment already names latency measurement as
  the purpose. Currently `BeadContext` is unused scaffolding kept for exactly this.
- `BraidpoolTemplate.header_timestamp` and the `template_id` threading give the
  correlation spine.

### Why it matters (consensus link)

Job-dispatch latency is consensus-relevant: a miner hashing a stale job produces
stale shares, which directly degrade EDCA payout accuracy, and slower propagation
widens cohorts (the spec's cohort-size ceiling x₀ depends on network latency `a`).
So "tip → last miner notified < bead interval" is a correctness target, not just ops.

### Sequencing

Land **after** the core SV2 path (#1/#2/#561/#637) and the share→bead wiring are
stable, so the six hook points don't move under it. Then: (A) structured log events
behind a flag → (B) offline collector computing the percentiles → (C) optional
Prometheus for production. A before B before C; A's event schema is the contract.
