# Braidpool SV2 Integration — Implementation Document

---

## 1. The Problem

Bitcoin mining today is dominated by centralized pools. Miners trust a single operator to pay them
correctly, select transactions fairly, and not steal block rewards. P2Pool attempted decentralization
but died because hardware manufacturers hard-limited coinbase transaction size.

Braidpool solves this with a DAG-based weak block protocol ("braid"). Every valid share becomes a
"bead" in a directed acyclic graph. Consensus on who contributed what work is established by graph
structure, not by a trusted operator. Payouts are enforced by FROST threshold signatures.

The current stratum layer is Stratum V1 TCP, hand-rolled in `node/src/stratum.rs`. This works for
initial data gathering but has three production-scale problems:

- No authentication between pool components (MITM can inject jobs)
- No Future Job mechanism (latency to new work unit is high)
- No native path for SV2-capable hardware like Bitshoka

---

## 2. What SV2 Gives Braidpool

**We use SV2 for:**

- Noise protocol encrypted channel between pool and translator proxy (NX-handshake, NoiseTcpStream)
, the pool authenticates with a static keypair, preventing job injection
- Extended Channel for pool↔tproxy job distribution — one channel carries all miners' work,
  tproxy subdivides the extranonce space
- Future Job mechanism: pool pre-sends `NewExtendedMiningJob` with `min_ntime` unset before the
  full template is ready, activates instantly via `SetNewPrevHash` ,  directly addresses latency
- Native SV2 miner connections (future path for Bitshoka and similar hardware)

**We explicitly do NOT use:**

- Job Declaration Protocol (JDP),  miners do not select transactions in Braidpool; the pool builds
  templates via its own `ipc_template_consumer`
- Template Distribution Protocol (TDP) — Braidpool uses direct Bitcoin Core IPC (Cap'n Proto)
- `roles_logic_sv2` — SRI's opinionated role helper that bundles JDP/TDP assumptions
- `bitcoin-core-sv2` — SRI's library for connecting Bitcoin Core to TDP; Braidpool's existing IPC
  pipeline replaces it

---

## 3. Prerequisites — Merge Before SV2 Work

```
#492 (GlobalJobStore)   ← merge FIRST; gives share handler a clean single-lookup API
#503 (share counters)   ← merge after #492
```

**Why #492 matters:** The current `dev` branch uses a two-level per-peer job map:
`HashMap<peer_addr, Arc<Mutex<MiningJobMap>>>`. PR 3's share bridge would need to map
`channel_id → peer_addr → MiningJobMap` — fragile. After #492, `GlobalJobStore.get(job_id)`
returns `(Arc<JobDetails>, TemplateId)` in one call. Write the SV2 PRs against the post-#492 world.

---

## 4. Key Files to Read Before Writing Code

### In `braidpool/braidpool`

| File | What to understand |
|------|--------------------|
| `node/src/stratum.rs` | `handle_submit`, `propagate_valid_bead`, `NotifyCmd`, `Notifier`, `ConnectionMapping`, `DownstreamClient`, `construct_job_notification` (coinbase split at line 2236) |
| `node/src/lib.rs` | `ipc_template_consumer`, `SwarmHandler::propagate_valid_bead`, `EXTRANONCE1_SIZE=8`, `EXTRANONCE2_SIZE=8`, `EXTRANONCE_SEPARATOR=[1u8;16]` |
| `node/src/audit.rs` | `UPSTREAM_EXTRANONCE1_BYTES=4`, `MINER_PREFIX_BYTES=2`, `COMMITMENT_BYTES=5`, `TOTAL_EXTRANONCE1_BYTES=11` |
| `node/src/ipc/client.rs` | `SharedBitcoinClient` — how templates arrive from Bitcoin Core |
| `node/src/config.rs` | Uses `bitcoin::Network` with custom `CPUNet` variant (no `PoolNetwork` enum) |
| `node/src/template_creator.rs` | Coinbase construction — output order: reward[0], segwit[1], OP_RETURN[2] |
| `node/src/main.rs` | Component wiring, `notification_tx` is `mpsc::channel` (single consumer) |

### In `braidpool/sv2-apps`

| Path | What to understand |
|------|--------------------|
| `pool-apps/pool/src/` | SRI's pool — channel management, `NewExtendedMiningJob`, `SubmitSharesExtended` |
| `miner-apps/translator/src/` | SRI's translator — SV1 downstream, SV2 upstream, extranonce subdivision |
| `stratum-apps/src/` | Noise connection helpers, key management, TOML config |

---

## 5. The Coinbase Split — Most Critical Detail (Corrected)

### How the split actually works (stratum.rs:2236–2247)

The Notifier does NOT split at a byte offset derived from `EXTRANONCE1_SIZE`/`EXTRANONCE2_SIZE`.
It scans the serialized coinbase bytes for the `EXTRANONCE_SEPARATOR` pattern:

```rust
// stratum.rs:2236-2247
let separator_pos = deserialized_coinbase
    .as_slice()
    .windows(EXTRANONCE1_SIZE + EXTRANONCE2_SIZE)  // 16-byte window
    .position(|window| window == EXTRANONCE_SEPARATOR)  // [1u8; 16]
    ...
let coinbase_1 = hex::encode(&deserialized_coinbase[..separator_pos]);
let coinbase_2 = hex::encode(&deserialized_coinbase[separator_pos + 16..]);
```

`adapt_notify_cmd` must use the same scan:

```rust
let separator = [1u8; EXTRANONCE1_SIZE + EXTRANONCE2_SIZE]; // [1u8; 16]
let separator_pos = deserialized_coinbase
    .windows(separator.len())
    .position(|w| w == separator)
    .ok_or(AdaptError::SeparatorNotFound)?;

let coinbase_tx_prefix = deserialized_coinbase[..separator_pos].to_vec();
let coinbase_tx_suffix = deserialized_coinbase[separator_pos + separator.len()..].to_vec();
```

### OP_RETURN is in `coinbase_tx_suffix`, not prefix

All Bitcoin outputs follow all inputs in the serialized transaction. The extranonce is embedded in
the coinbase **input's** `script_sig`. Therefore everything after the extranonce — including all
outputs — lands in `coinbase_tx_suffix` (coinbase2).

Output order from `build_braidpool_coinbase_from_template` (template_creator.rs:424-429):
```
output[0] → reward payout        → in coinbase_tx_suffix
output[1] → segwit commitment    → in coinbase_tx_suffix (if present)
output[2] → OP_RETURN commitment → in coinbase_tx_suffix
```

The OP_RETURN is NOT "the first output in coinbase_tx_prefix." The current code is correct;
`adapt_notify_cmd` just replicates the scan.

### Mapping to SV2 Extended Channel fields

```
coinbase_tx_prefix  = coinbase1   (everything before the 16-byte separator)
extranonce_prefix   = extranonce1 (pool-assigned, per tproxy connection)
extranonce          = extranonce2 (tproxy/miner-controlled)
coinbase_tx_suffix  = coinbase2   (everything after the 16-byte separator, includes all outputs)
```

---

## 6. Extranonce Layout (Corrected)

The proposal incorrectly stated extranonce1 = 8 bytes. **Actual values from the codebase:**

```rust
// stratum.rs:38
const UPSTREAM_EXTRANONCE1_SIZE: usize = 4; // actual extranonce1 sent to miners

// lib.rs
pub const EXTRANONCE1_SIZE: usize = 8;   // half of separator (not the actual ext1 size)
pub const EXTRANONCE2_SIZE: usize = 8;   // miner rolls this
pub const EXTRANONCE_SEPARATOR: [u8; 16] = [1u8; 16]; // placeholder in coinbase
```

### Normal mode

```
extranonce_prefix   = 4 bytes   (pool-assigned per tproxy connection, randomly generated)
extranonce          = 12 bytes  (tproxy controls: 8 miner-rolls + 4 reserved)
total space         = 16 bytes  (= EXTRANONCE1_SIZE + EXTRANONCE2_SIZE = separator size)
```

`OpenExtendedMiningChannel.Success` must carry `extranonce_size = 12`.

### Audit mode

```
extranonce_prefix   = 11 bytes  (upstream_ext1[4] + miner_prefix[2] + commitment[5])
extranonce          = 5 bytes   (1 miner-roll byte + 4 unused)
total space         = 16 bytes  (same separator)
```

`OpenExtendedMiningChannel.Success` must carry `extranonce_size = 5` in audit mode.

The channel manager must negotiate different `extranonce_size` based on whether the node is running
in audit mode or normal mode.

---

## 7. The  PRs

### PR 1 — Template Adapter Stub (braidpool/sv2-apps)

**Branch:** `braidpool/pool-template-adapter`  

Replaces the template source in `pool-apps/pool/` — instead of receiving templates from
`bitcoin-core-sv2` via TDP, the pool accepts a `tokio::sync::mpsc::Receiver<BraidpoolTemplate>`.

```rust
pub struct BraidpoolTemplate {
    pub coinbase_tx_prefix: Vec<u8>,   // bytes before EXTRANONCE_SEPARATOR
    pub coinbase_tx_suffix: Vec<u8>,   // bytes after EXTRANONCE_SEPARATOR (includes all outputs)
    pub merkle_path: Vec<[u8; 32]>,
    pub prev_hash: [u8; 32],
    pub nbits: u32,
    pub version: i32,
    pub height: u32,        // from ipc_template.components — required for Future Job
    pub template_id: u64,
}

pub async fn adapt_notify_cmd(
    notify: NotifyCmd,
    ipc_components: &BlockTemplateComponents,  // provides height
) -> Option<BraidpoolTemplate> {
    // Scans for EXTRANONCE_SEPARATOR, splits coinbase, maps fields
    // Returns None for non-SendToAll variants
}
```

**Critical:** `height` must come from `ipc_template.components` (Cap'n Proto IPC data), NOT from
`BlockTemplate` which leaves `height = Height::ZERO` in `ipc_template_consumer`. This field is
required for `NewExtendedMiningJob` and the Future Job latency mechanism.

**Test:** Unit test that a `NotifyCmd::SendToAll` with known coinbase bytes (containing the 16-byte
separator) produces a `BraidpoolTemplate` with correct prefix/suffix split.

### PR 2 — Noise Channel Manager (braidpool/sv2-apps)

**Branch:** `braidpool/noise-channel-manager`  

Wires the pool to accept `NoiseTcpStream` connections from tproxy. Pool generates a static authority
keypair on startup (stored in config), performs NX-handshake as server, opens an Extended Channel.

Add to pool config TOML:
```toml
[authority]
public_key = "..."   # secp256k1 static key, hex
secret_key = "..."
```

The `channel_manager.rs` module handles:
- `SetupConnection` from tproxy → `SetupConnection.Success`
- `OpenExtendedMiningChannel` → `OpenExtendedMiningChannel.Success` with:
  - `extranonce_prefix` = 4 bytes (normal mode) randomly generated per connection
  - `extranonce_size` = 12 (normal mode) or 5 (audit mode)
- Connection lifecycle (one tproxy per pool connection for now)

**Note:** extranonce1 is randomly generated (`rand::thread_rng().fill_bytes()`), NOT derived from
`connection_id`. The `PoolNetwork` enum does not exist — use `bitcoin::Network` directly.

**Test:** Spin up pool and mock tproxy in-process, complete Noise handshake, assert
`SetupConnection.Success` with correct `extranonce_size` for both normal and audit modes.

### PR 3 — Share→Bead Bridge (braidpool/sv2-apps)

**Branch:** `braidpool/share-bead-bridge`  

When pool receives `SubmitSharesExtended`, validates PoW and calls the bead creation path via a
channel sender.

```rust
pub struct ValidatedShare {
    pub extranonce1: Vec<u8>,   // 4 bytes normal, 11 bytes audit — NOT u64
    pub extranonce2: Vec<u8>,   // variable
    pub ntime: u32,
    pub nonce: u32,
    pub version: u32,
    pub template_id: u64,       // post-#492; pre-#492 use TemplateId enum
    pub channel_id: u32,
}

pub type ShareBridgeSender = mpsc::Sender<ValidatedShare>;
```

Job lookup (post-#492): `global_job_store.get(job_id)` → `(Arc<JobDetails>, TemplateId)`.

**PoW validation:** Use the channel's maximum target from `SetTarget` (a U256-compatible value) for
PoW comparison. Do NOT use `target_from_difficulty` — that function uses f64 arithmetic which
introduces precision loss at high difficulties. `SubmitSharesExtended` carries the target directly.

**Test:** Mock a `SubmitSharesExtended` with known-valid PoW, assert `ShareBridgeSender` receives
one `ValidatedShare` with correct fields, assert `SubmitSharesSuccess` is sent upstream.

### PR 4 — Wire Pool Into Braidpool Node (braidpool/braidpool)

**Branch:** `feat/sv2-pool-wiring`  
`node/src/main.rs`, new `node/src/sv2/mod.rs`

#### NotifyCmd fanout — required change

`notification_tx` is currently `mpsc::channel` (single consumer = SV1 Notifier). SV2 pool cannot
tap it directly. Convert to broadcast:

```rust
// main.rs
let (notification_tx, _) = tokio::sync::broadcast::channel::<NotifyCmd>(1024);
let sv1_rx = notification_tx.subscribe();  // → SV1 Notifier
let sv2_rx = notification_tx.subscribe();  // → SV2 pool

// NotifyCmd must impl Clone (check BlockTemplate derives Clone)
```

Alternative if `NotifyCmd` can't derive `Clone`:

```rust
// fanout task
let (notify_tx, notify_rx) = mpsc::channel::<NotifyCmd>(1024);
let (sv1_tx, sv1_rx) = mpsc::channel(1024);
let (sv2_tx, sv2_rx) = mpsc::channel(1024);
tokio::spawn(async move {
    while let Some(cmd) = notify_rx.recv().await {
        let _ = sv1_tx.send(cmd.clone()).await;
        let _ = sv2_tx.send(cmd).await;
    }
});
```

#### Placeholder key — must not be silently inherited

Both `propagate_valid_bead` (lib.rs:322) and `validate_and_forward_upstream_share`
(stratum.rs:1303) use a hardcoded placeholder public key:
```rust
let public_key = "020202020202020202020202020202020202020202020202020202020202020202"
    .parse::<bitcoin::PublicKey>().unwrap();
```

PR 4 must add explicit `// FIXME(sv2-integration): replace with authority_key from Noise keypair`
comments at both sites and file a tracking issue. Do not silently inherit the placeholder into the
SV2 path.

#### CLI additions

```
--sv2-pool-port  <PORT>   Port for SV2 pool (default 34254, 0 to disable)
--sv2-authority-pubkey    Pool authority public key (hex)
--sv2-authority-seckey    Pool authority secret key (hex)
```

#### Network config

Use `bitcoin::Network` directly. **`PoolNetwork` enum does not exist** in the codebase — do not
reference it.

The existing SV1 stratum service runs unchanged in parallel. SV2 is additive.

**Test:** Integration test that starts a node in test mode, connects a mock tproxy, completes the
Noise handshake, sends a `NotifyCmd::SendToAll`, and asserts a `NewExtendedMiningJob` arrives at
the mock tproxy socket.

### PR 5 — Translator Binary (braidpool/braidpool)

**Branch:** `feat/sv2-translator-wiring`  
 new `translator/` binary crate at workspace root

Introduces a standalone binary that runs alongside the node:

- Connects upstream to Braidpool pool via SV2 Noise channel (PR 2)
- Accepts SV1 miners downstream on port 3333 (configurable)
- Translates `NewExtendedMiningJob` → per-miner `mining.notify`
- Translates `mining.submit` → `SubmitSharesExtended` upstream

Config file `translator.toml`:
```toml
[upstream]
pool_address = "127.0.0.1:34254"
authority_pubkey = "..."   # must match pool's keypair

[downstream]
listen_address = "0.0.0.0:3333"
min_extranonce2_size = 6
```

**Test:** Full end-to-end: pool node + translator + mock SV1 miner. Mock miner sends
`mining.subscribe`, `mining.authorize`, receives `mining.notify`, sends `mining.submit`. Assert
`SubmitSharesSuccess` arrives at mock miner and `ValidatedShare` arrives at `ShareBridgeSender`.

---

## 8. PR Ordering and Dependencies

```
#492 (GlobalJobStore) — merge first, unblocks clean job lookup in PR 3
#503 (share counters) — merge after #492
         ↓
PR 1 (template adapter — separator scan, BraidpoolTemplate with height)
         ↓
PR 2 (noise channel manager — correct extranonce sizes per mode)
         ↓
PR 3 (share bridge — Vec<u8> extranonces, target from SetTarget, GlobalJobStore lookup)
         ↓  (PRs 1-3 target braidpool/sv2-apps)
PR 4 (node wiring — broadcast fanout, bitcoin::Network, FIXME placeholder keys)
         ↓
PR 5 (translator binary)
```

PRs 1–3 target `braidpool/sv2-apps`. PRs 4–5 target `braidpool/braidpool`. PR 4 can start
structurally in parallel with PR 3 since it only depends on the interface types, not the
implementation — but #492 must land before either.

---

## 9. Dependency Versions — Verify First

Before any code:

```bash
# In sv2-apps
grep -r "bitcoin" pool-apps/pool/Cargo.toml
cat rust-toolchain.toml   # MSRV 1.85.0

# In braidpool node
grep "bitcoin" node/Cargo.toml
cargo build -p node 2>&1 | head -20
```

sv2-apps specifies MSRV 1.85.0. Braidpool uses a forked `bitcoin` crate with the `CPUNet` network
variant. Verify the forked crate's version is compatible before touching any logic. Resolve any
conflict in a standalone dependency-only commit before the first PR.

---

## 10. SV2 Spec Sections That Matter

| Section | Topic |
|---------|-------|
| §4 | Noise protocol handshake |
| §5.1.2 | Extended Job and Extended Extranonce (extranonce subdivision model) |
| §5.1.3 | Future Job (latency win, requires `height` field) |
| §5.3.15/5.3.16 | `NewMiningJob` and `NewExtendedMiningJob` message fields |
| §5.3.17 | `SetNewPrevHash` |
| §5.3.11/5.3.12 | `SubmitSharesStandard` and `SubmitSharesExtended` |

---

## 11. Audit Findings Summary

| # | Finding | Impact | Location |
|---|---------|--------|----------|
| 1 | Coinbase split uses separator scan, not byte offset | Wrong split point → invalid coinbase | stratum.rs:2236 |
| 2 | OP_RETURN is in coinbase_tx_suffix, not prefix | Wrong field mapping | template_creator.rs:424 |
| 3 | Actual extranonce1 is 4 bytes, not 8 | Wrong extranonce_prefix size in SV2 channel | stratum.rs:38 |
| 4 | Audit-mode extranonce1 is 11 bytes — doesn't fit u64 | Data truncation in ValidatedShare | audit.rs:18-23 |
| 5 | notification_tx is mpsc single-consumer | SV2 pool cannot subscribe to it | main.rs:155 |
| 6 | PoolNetwork enum does not exist | Compile failure in PR 4 | config.rs |
| 7 | BlockTemplate.height = Zero in ipc_template_consumer | Future Job broken | lib.rs:211-218 |
| 8 | target_from_difficulty uses f64 precision loss | Incorrect PoW comparison | stratum.rs:1446 |
| 9 | MiningJobMap is per-peer pre-#492 | Complex two-level lookup in share bridge | main.rs:234 |
| 10 | Placeholder pubkey/sig hardcoded in two places | Security placeholder silently inherited | lib.rs:322, stratum.rs:1303 |


