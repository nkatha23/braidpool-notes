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

SV1 stratum service runs unchanged in parallel. SV2 is purely additive. `propagate_valid_bead` wiring deferred to PR 5.

---

### braidpool PR 5 — Translator binary

**Target:** `nkatha23/braidpool → braidpool/braidpool`  **Branch:** `feat/sv2-translator-binary` (not yet created)  
**Depends on:** braidpool PR #561 merged

New binary crate at workspace root. Uses `miner-apps/translator` from `braidpool/sv2-apps` fork as the core. Braidpool-specific additions: extranonce subdivision using 4-byte prefix (normal mode), `mining.notify` construction using merkle root computed from `BraidpoolTemplate.merkle_path`.

Config `translator.toml`:
```toml
[upstream]
pool_address = "127.0.0.1:34254"
authority_pubkey = "..."  # must match pool's keypair

[downstream]
listen_address = "0.0.0.0:3333"
min_extranonce2_size = 6
```

**Test:** End-to-end — pool + translator + mock SV1 miner. Full `subscribe → authorize → notify → submit → success` cycle.

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
braidpool PR 5 (translator binary)
    branch: feat/sv2-translator-binary — not yet created
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
