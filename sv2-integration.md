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

**In Sansh's `sv2-integration-braidpool` branch (from `171a9a4`):**

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

Braidpool supports two upstream pool configurations. The upstream pool negotiates extranonce sizes during `SetupConnection`; Braidpool adapts internally but always reconstructs the originally agreed format before submitting shares upstream.

### Upstream configuration 1 — 4+8 (common)

The upstream pool allocates 4 bytes for extranonce1 and 8 bytes for extranonce2.

Braidpool internally uses:
```
extranonce1 (sent to miners) = upstream_ext1[4] + prefix[2] + commitment[5] = 11 bytes
extranonce2 (miner-controlled)                                               =  1 byte
```

Before submitting a share upstream, Braidpool reconstructs:
```
reconstructed_extranonce1 = upstream_ext1[4]
reconstructed_extranonce2 = prefix[2] + commitment[5] + rolling[1] = 8 bytes
```

### Upstream configuration 2 — 8+8

The upstream pool allocates 8 bytes for extranonce1 and 8 bytes for extranonce2.

Braidpool internally uses:
```
extranonce1 (sent to miners) = upstream_ext1[8] + prefix[2] + commitment[5] = 15 bytes
extranonce2 (miner-controlled)                                               =  3 bytes
```

Before submitting a share upstream, Braidpool reconstructs:
```
reconstructed_extranonce1 = upstream_ext1[8]
reconstructed_extranonce2 = prefix[2] + commitment[5] + rolling[3] = 8 bytes
```

### Why reconstruction is needed

The upstream pool only accepts the extranonce format it originally agreed to (e.g. 4+8). Braidpool embeds the commitment bytes inside the extranonce space it sends to downstream miners, then strips them back out before forwarding the share upstream so the share validates correctly.

### Constants (from `node/src/lib.rs`)

```rust
pub const EXTRANONCE1_SIZE: usize = 8;      // half of separator
pub const EXTRANONCE2_SIZE: usize = 8;      // miner-controlled
pub const EXTRANONCE_SEPARATOR: [u8; 16] = [1u8; 16];
```

---

## 8. The PRs — Updated

### PR 0 — Add `BraidpoolTemplate` to `braidpool-common`

**Target:** `braidpool/braidpool`  **Branch:** `feat/braidpool-common-template-type`

```rust
// braidpool-common/src/lib.rs
pub mod template;

// braidpool-common/src/template.rs
#[derive(Debug, Clone)]
pub struct BraidpoolTemplate {
    pub coinbase_tx_prefix: Vec<u8>,   // bytes before EXTRANONCE_SEPARATOR
    pub coinbase_tx_suffix: Vec<u8>,   // bytes after EXTRANONCE_SEPARATOR (all outputs)
    pub merkle_path: Vec<[u8; 32]>,
    pub prev_hash: [u8; 32],
    pub nbits: u32,
    pub version: i32,
    pub height: u32,                   // from ipc_template.components — required for Future Job
    pub template_id: u64,
    pub coinbase_tx: Vec<u8>,          // full serialized coinbase — for build_new_template
}
```

Node's `ipc_template_consumer` converts `Arc<BlockTemplate> → BraidpoolTemplate` using `processed_block_hex` as the coinbase source. This gets sent over the notification channel alongside `NotifyCmd`.

**Test:** Round-trip — build a `BraidpoolTemplate` from a known `BlockTemplate`, verify prefix+suffix reconstruct correctly when rejoined at the separator boundary.

---

### PR 1 — `braidpool-template-provider` crate in sv2-apps

**Target:** `nkatha23/sv2-apps → braidpool/sv2-apps`  **Branch:** `braidpool/pool-template-adapter`  
**Reference:** Sansh's `c6fddf8`, `203e935`, `f502db7`, `6c85bda`

New crate at `stratum-apps/braidpool-template-provider/`:

```toml
# Cargo.toml
[dependencies]
braidpool-common = { git = "https://github.com/braidpool/braidpool", branch = "dev" }
mining_sv2 = "10"
template_distribution_sv2 = "3"
binary_sv2 = "5"
tokio = { workspace = true }
tracing = { workspace = true }
```

Key function — `sv2_template_consumer`:
```rust
pub async fn sv2_template_consumer(
    mut template_rx: mpsc::Receiver<BraidpoolTemplate>,  // from braidpool-common, not node
    sv2_outgoing_tx: Sender<TemplateDistribution<'static>>,
    sv2_incoming_rx: Receiver<TemplateDistribution<'static>>,
    cancellation_token: CancellationToken,
) -> Result<(), BraidpoolTemplateProviderError>
```

Key function — `build_new_template`:
```rust
pub fn build_new_template<'a>(
    template: &BraidpoolTemplate,
    future_template: bool,
) -> Result<NewTemplate<'a>, TemplateDataError> {
    // Use template.coinbase_tx directly (already built by template_creator)
    // braidpool_mode = true: include ALL outputs in coinbase_tx_outputs
    // This carries reward + segwit + OP_RETURN commitment through to factory.rs
}
```

Key function — `build_new_template_from_block_template` (kept for compatibility):
```rust
// Uses BraidpoolTemplate.coinbase_tx (serialized full coinbase)
// instead of processed_block_hex deserialization
// Eliminates the fallback chain Sansh needed
```

**Test:** Unit test — `BraidpoolTemplate` with known coinbase produces `NewTemplate` with correct `coinbase_tx_outputs` count (3: reward + segwit + OP_RETURN).

---

### PR 2 — Noise channel manager in sv2-apps pool

**Target:** `nkatha23/sv2-apps → braidpool/sv2-apps`  **Branch:** `braidpool/noise-channel-manager`  
**Reference:** Sansh's `20fd115`, `9e3473d`

Adapts `pool-apps/pool/` to accept `BraidpoolTemplate` instead of TDP templates.

Key struct addition — `BeadContext`:
```rust
// pool-apps/pool/src/lib/braidpool/mod.rs
pub struct BeadContext {
    pub template_id: u64,
    pub template_propagation_time: std::time::Instant,
    pub transactions: Vec<bitcoin::Transaction>,  // for CommittedMetadata
}
```

Key change — `BraidpoolP2P::spawn` signature:
```rust
pub async fn spawn(
    self,
    auth_key_public: Secp256k1PublicKey,   // from Noise authority keypair
    auth_key_secret: Secp256k1SecretKey,   // fixes placeholder key audit finding
) -> Result<(
    JoinHandle<()>,
    mpsc::Sender<SwarmCommand>,
    mpsc::Sender<BraidpoolDBTypes>,
    Arc<RwLock<Braid>>,
    Arc<Mutex<SwarmHandler>>,              // new — needed for propagate_valid_bead
), BraidpoolError>
```

Channel manager — `OpenExtendedMiningChannel` response:
```rust
// extranonce_size depends on mode
let extranonce_size: u16 = match node_mode {
    NodeMode::Normal => 12,
    NodeMode::Audit => 5,
};
// extranonce_prefix = 4 bytes random (normal) or 11 bytes (audit)
```

**Test:** Noise handshake test — pool and mock tproxy complete NX-handshake, assert `SetupConnection.Success` with correct `extranonce_size`.

---

### PR 3 — Share→bead bridge in sv2-apps pool

**Target:** `nkatha23/sv2-apps → braidpool/sv2-apps`  **Branch:** `braidpool/share-bead-bridge`  
**Reference:** Sansh's `pool/src/lib/channel_manager/mining_message_handler.rs`

```rust
// pool-apps/pool/src/lib/mod.rs
pub struct ValidatedShare {
    pub extranonce1: Vec<u8>,    // 4 bytes normal, 11 bytes audit — NOT u64
    pub extranonce2: Vec<u8>,
    pub ntime: u32,
    pub nonce: u32,
    pub version: u32,
    pub template_id: u64,
    pub channel_id: u32,
    pub bead_context: BeadContext,
}

pub type ShareBridgeSender = mpsc::Sender<ValidatedShare>;
```

PoW validation uses `SetTarget`'s U256 target directly:
```rust
// Do NOT use target_from_difficulty (f64 precision loss — audit finding 8)
// Use the channel's maximum_target from SetTarget message
let target = U256::from(channel.maximum_target);
validate_pow_against_target(&header, target)?;
```

Job lookup uses `GlobalJobStore` (post-#492):
```rust
// single lookup — (Arc<JobDetails>, TemplateId)
let (job, template_id) = global_job_store
    .get(job_id)
    .ok_or(ShareError::JobNotFound(job_id))?;
```

**Test:** Mock `SubmitSharesExtended` with valid PoW → assert `ShareBridgeSender` receives `ValidatedShare` with correct fields, assert `SubmitSharesSuccess` sent upstream.

---

### PR 4 — Wire pool into braidpool node

**Target:** `nkatha23/braidpool → braidpool/braidpool`  **Branch:** `feat/sv2-pool-wiring`

`notification_tx` fanout — converts single-consumer `mpsc` to broadcast:
```rust
// main.rs
let (notification_tx, _) = tokio::sync::broadcast::channel::<NotifyCmd>(1024);
let sv1_rx = notification_tx.subscribe();   // → existing SV1 Notifier
let sv2_rx = notification_tx.subscribe();   // → new sv2_template_consumer task
// NotifyCmd must derive Clone — check BlockTemplate fields
```

Alternative if `NotifyCmd` can't derive `Clone` (large `Vec<Transaction>` inside):
```rust
// fanout task — avoids Clone derive requirement
tokio::spawn(async move {
    while let Some(cmd) = notify_rx.recv().await {
        let _ = sv1_tx.send(cmd.clone()).await;
        let _ = sv2_tx.send(cmd).await;
    }
});
```

`BraidpoolTemplate` conversion in `ipc_template_consumer`:
```rust
// node/src/lib.rs — after building BlockTemplate
let braidpool_template = BraidpoolTemplate::from_block_template(
    &processed_template,
    &components,
    template_id,
)?;
braidpool_template_tx.send(braidpool_template).await?;
```

CLI additions:
```
--sv2-pool-port <PORT>        SV2 pool listen port (default 34254, 0 = disabled)
--sv2-authority-pubkey <HEX>  Pool authority public key
--sv2-authority-seckey <HEX>  Pool authority secret key
```

Placeholder key fix — at `lib.rs:322` and `stratum.rs:1303`:
```rust
// FIXME(sv2-integration): replace with authority_key from Noise keypair
// tracked in issue #XXX
let public_key = "020202...".parse::<bitcoin::PublicKey>().unwrap();
```

SV1 stratum service runs unchanged in parallel. SV2 is additive.

**Test:** Integration test — node starts, mock tproxy connects, `NotifyCmd::SendToAll` sent, `NewExtendedMiningJob` arrives at mock tproxy socket.

---

### PR 5 — Translator binary

**Target:** `nkatha23/braidpool → braidpool/braidpool`  **Branch:** `feat/sv2-translator-binary`

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

## 9. PR Ordering

```
PR 0 (BraidpoolTemplate in braidpool-common) — targets braidpool/braidpool
    ↓
PR 1 (template provider) — targets braidpool/sv2-apps
    ↓
PR 2 (noise channel manager) — targets braidpool/sv2-apps
    ↓
PR 3 (share bridge) — targets braidpool/sv2-apps
    ↓  (PRs 0-3 merged)
PR 4 (node wiring) — targets braidpool/braidpool
    ↓
PR 5 (translator binary) — targets braidpool/braidpool
```

Also required before PR 4: #492, #503, #528, #530 merged to `braidpool:dev`.

---

## 10. Dependency Versions — Verify First

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

## 11. Audit Findings — Status After Sansh's Reference

| # | Finding | Status |
|---|---------|--------|
| 1 | Separator scan vs offset | Resolved — use `processed_block_hex` deserialization |
| 2 | OP_RETURN in suffix | Confirmed correct — outputs are in `coinbase_tx_suffix` |
| 3 | extranonce1 = 4 bytes | Confirmed — `UPSTREAM_EXTRANONCE1_SIZE = 4` |
| 4 | Audit extranonce 11 bytes | Handled — `ValidatedShare.extranonce1: Vec<u8>` |
| 5 | mpsc single consumer | Fix in PR 4 — broadcast fanout |
| 6 | PoolNetwork doesn't exist | Use `bitcoin::Network` directly |
| 7 | height = Zero | Fixed — `BraidpoolTemplate.height` from `ipc_template.components` |
| 8 | f64 precision in PoW | Fixed in PR 3 — use U256 target from SetTarget |
| 9 | Per-peer job map | Fixed — write against post-#492 `GlobalJobStore` |
| 10 | Placeholder pubkey | Fixed — Sansh's auth key flows into `SwarmHandler::new` in PR 2 |
