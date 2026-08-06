# Braidpool Audit Mode — Deep Internals

> Code references point to `node/src/` on the `dev` branch as of 2026-08-05.

Audit mode turns Braidpool into a **Stratum proxy + local DAG auditor**. Instead
of pulling templates from Bitcoin Core, the node connects upstream to a pool
(Ocean, etc.), repackages the jobs with an embedded commitment in extranonce1,
and reconstructs a local DAG from every valid miner share. The DAG is
**local-only evidence** — not broadcast to peers, not part of Braidpool
consensus.

---

## 1. CLI Flags

Defined in `cli.rs`. No clap-level validation between flags — runtime checks in
`main.rs`.

| Flag | Type | Default | Notes |
|------|------|---------|-------|
| `--audit` | `bool` | `false` | Enables audit mode |
| `--upstream-host` | `Option<String>` | — | Required if audit; `process::exit(1)` if missing |
| `--upstream-port` | `u16` | `3334` | Ocean's default |
| `--upstream-username` | `Option<String>` | — | Bitcoin address for payout; required if audit |
| `--upstream-password` | `String` | `"x"` | Standard Stratum convention |
| `--miner-difficulty` | `Option<f64>` | — | Weak difficulty assigned to downstream miners |

---

## 2. What Audit Mode Skips vs Keeps

### Not started in audit mode (`main.rs`)

| Component | Why skipped |
|-----------|-------------|
| `DBHandler` / `braidpool.db` | DAG consensus state not needed |
| `ipc_block_listener` + `ipc_template_consumer` | Templates come from upstream, not Bitcoin Core |
| libp2p `listen_on()` + `dial boot nodes` | No peer broadcast of local audit beads |
| IBD trigger | No chain sync needed |
| `SwarmHandler` real messages | Replaced with a dummy channel |

### Still runs in audit mode

| Component | Why kept |
|-----------|---------|
| JSON-RPC server (`run_rpc_server`) | Exposes miner stats via RPC |
| libp2p swarm construction | Struct is built but stays idle |
| Stratum TCP server (`run_stratum_service`) | Still accepts downstream miners |
| `AuditDAG` + `audit.db` | The whole point of audit mode |
| `UpstreamPoolClient` | Connects to upstream, proxies shares |

### Startup gate

`upstream_ready_rx` with a **60-second timeout** blocks node startup until
`UpstreamPoolClient` completes the subscribe + authorize handshake. If the
upstream is unreachable at startup, the node exits.

---

## 3. Data Flow

```
Upstream Pool (Ocean, etc.)
    │  (TCP / Stratum V1)
    ▼
UpstreamPoolClient
    │  subscribe → extranonce1 (4 bytes), extranonce2_size
    │  authorize → confirmed
    │  mining.set_difficulty ──────────────────► downstream miners
    │  mining.notify ──── job repackaged ───────► downstream miners
    │                     (commitment injected
    │                      into extranonce1)
    │
downstream miner  ──── mining.submit ──────────► handle_submit
                                                     │
                                         is_upstream_job? (TemplateId::Upstream)
                                                     │
                                                     ▼
                                      validate_and_forward_upstream_share
                                                     │
                                         ┌───────────┴────────────┐
                                         │                        │
                                  AuditDAG.add_and_record_bead    │
                                  (local DAG, audit.db)           │
                                                                   │
                                                       upstream_share_tx channel
                                                                   │
                                                                   ▼
                                                         UpstreamPoolClient
                                                         (forward to upstream)
                                                                   │
                                                        upstream response
                                                        (accepted / rejected)
                                                                   │
                                                        AuditRecord.upstream_accepted
                                                        updated in audit.db
```

The divergence point in `stratum.rs::handle_submit` is:
```rust
if submitted_job.is_upstream_job {
    // early return — audit path, no bead propagation to libp2p
    return self.validate_and_forward_upstream_share(...)
}
// normal Braidpool path below
```

---

## 4. TemplateId Enum — The Mode Seam

Defined in `lib.rs`:

```rust
pub enum TemplateId {
    Braidpool(u64),        // normal mode: integer job ID from internal template
    Upstream(String),      // audit mode: job ID string from upstream pool
}
```

`MiningJobMap` accepts both. `is_upstream_job` on `JobDetails` is set to `true`
when the template originated from the upstream. This is what routes the submit
into the audit path.

---

## 5. UpstreamPoolClient

### Handshake sequence (subscribe first, then authorize)

```
Braidpool → upstream:  mining.subscribe  {"method":"mining.subscribe","params":["Braidpool/1.0.0",...]}
upstream → Braidpool:  result: [[subscriptions], extranonce1, extranonce2_size]
                       extranonce1: 4-byte hex (e.g. "deadbeef")
                       extranonce2_size: 4 (bytes)
Braidpool → upstream:  mining.authorize  {username, password}
upstream → Braidpool:  result: true
```

Extracted values sent to stratum server via `extranonce_tx` channel immediately
after subscribe completes.

**No configure in handshake** — configure is forwarded only when a downstream
miner requests it.

### UpstreamCache fields

| Field | TTL | Invalidated by |
|-------|-----|---------------|
| `configure_response` | `u64::MAX` (permanent) | `clear()` on reconnect |
| `subscribe_response` | `u64::MAX` | `clear()` on reconnect |
| `current_difficulty` | `u64::MAX` | `clear()` on reconnect |
| `latest_job` | 3600s | `set_latest_job()` if `clean_jobs=true`, or `invalidate_job()` on disconnect |

### Reconnect behavior

On upstream disconnect: `pending_shares.clear()` + `pending_requests.clear()` +
`cache.clear()`. In-flight shares are **dropped** (not re-submitted). Reconnect
uses exponential backoff (5s base, 60s max) + jitter. All per-miner job maps
get `clear_upstream_jobs()` called so miners start fresh on reconnect.

### TCP keepalive

Uses `socket2` to set `idle=300s`, `interval=2s`, `retries=3` (Linux). Dead
connection detected in ~306s.

### Share forwarding

Does NOT blindly forward every submit. Validates before forwarding:
1. `extranonce1` is set (ready from subscribe handshake)
2. `extranonce2` length matches upstream `extranonce2_size * 2` hex chars
3. `extranonce2` is valid hex

Shares failing validation get an error response sent directly to the miner —
not queued to upstream.

---

## 6. Commitment Scheme

This is the cryptographic core of audit mode. Each DAG generation gets a fresh
commitment, embedded by Braidpool in extranonce1. Miners must use the current
commitment to have their shares accepted into the local audit DAG.

### Extranonce1 byte layout (11 bytes total)

```
Byte offset  Length  Field             Who owns it
─────────────────────────────────────────────────
[0:4]        4       upstream_ext1     Upstream pool (from subscribe response)
[4:6]        2       miner_prefix      Braidpool-assigned, unique per miner
[6:11]       5       commitment        Braidpool-computed from current DAG tips
─────────────────────────────────────────────────
Total:       11      TOTAL_EXTRANONCE1_BYTES
```

Constants in `audit.rs`:
```rust
UPSTREAM_EXTRANONCE1_BYTES = 4
MINER_PREFIX_BYTES = 2
COMMITMENT_BYTES = 5
TOTAL_EXTRANONCE1_BYTES = 11
```

### Commitment computation (per DAG generation)

```rust
fn compute_generation_hash(active_parents: &[(BlockHash, BlockHash, Time)]) -> [u8; 5] {
    // 1. Sort parents deterministically by compare_hash()
    // 2. Concatenate all composite_hashes
    // 3. SHA256 of the concatenation
    // 4. Take first 5 bytes
}
```

When a valid share is added and `advance_generation()` is called:
- `current_siblings` → `active_parents`
- Commitment recomputed from new `active_parents`
- All registered miners get `commitment_pending = true` (triggers new job notify)

### Verification (`verify_in_extranonce1`)

On miner submit, parses the miner's extranonce1 from the reconstructed coinbase:
1. Check total length equals `upstream_ext1_size + MINER_PREFIX_BYTES + COMMITMENT_BYTES`
2. Check bytes [4:6] match this miner's assigned prefix
3. Check bytes [6:11] match the current commitment bytes

### Stale vs invalid

If bytes [6:11] match the **previous** commitment (`MinerAuditState.previous_commitment`),
the share is explicitly marked:
```
AuditVerificationResult::Invalid { reason: "Stale commitment: share used previous bead commitment" }
```
Stale shares are **not added to the audit DAG** and not forwarded upstream.

If the prefix mismatches or length is wrong, the share is also `Invalid` but
for a different reason.

### Attack prevention

| Attack | How commitment scheme prevents it |
|--------|----------------------------------|
| Cross-generation nonce reuse | Old commitment rejected; miner must recompute |
| Prefix spoofing | Per-miner 2-byte prefix checked on every submit |
| Replaying shares from a fork | Commitment is derived from current tips; different tips → different commitment |

---

## 7. AuditDAG

### Key structs

```rust
pub struct AuditDAG {
    braid: Arc<RwLock<Braid>>,                          // underlying DAG
    records: HashMap<ShareId, AuditRecord>,             // per-share audit log
    miner_states: HashMap<String, MinerAuditState>,     // commitment state per miner IP
    bead_to_share: HashMap<BlockHash, ShareId>,         // composite_hash → share
    db_handler: Option<Arc<AuditDBHandler>>,            // audit.db (None in tests)
    active_parents: Vec<(BlockHash, BlockHash, Time)>,  // current generation tips
    current_siblings: Vec<(BlockHash, BlockHash, Time)>,// shares in current job
}

pub struct MinerAuditState {
    current_commitment: AuditCommitment,
    miner_prefix: Vec<u8>,             // 2 bytes, unique per miner
    commitment_pending: bool,          // new job needs to be sent
    previous_commitment: Option<AuditCommitment>, // accepted for one generation
    upstream_ext1_size: usize,         // 4 (from upstream subscribe)
    miner_roll_bytes: usize,           // bytes miner controls for extranonce2
}
```

### Lifecycle: add_and_record_bead

1. Verify share against miner's current commitment (fallback to previous)
2. If valid: add bead to `braid.extend(&bead)`, push to `current_siblings`
3. Persist to `audit.db` via `AuditDBHandler`
4. Return `(share_id, bead_added)` — `bead_added` false if Braid rejected duplicate

### Lifecycle: advance_generation

Called after each set of siblings is complete:
1. If `current_siblings` non-empty → shift to `active_parents`, clear siblings
2. Recompute generation commitment from sorted `active_parents`
3. Log new generation hash and parent count

### get_stats / get_miner_stats

Scans `records` for a given miner IP and returns:
```rust
MinerStats {
    total, verified, failed, eligible, accepted, rejected: usize,
    audit_rate: f64,         // verified / total
    acceptance_rate: f64,    // upstream_accepted / upstream_eligible
}
```

### Known issues

**Hardcoded genesis pubkey** (`audit.rs::create_genesis_bead_for_audit`):
```rust
let public_key = "020202020202020202020202020202020202020202020202020202020202020202"
    .parse::<bitcoin::PublicKey>()
    .unwrap();
```
Placeholder key (`0x02` × 33 bytes) used in genesis bead `comm_pub_key`. Not
derived from real key material. Not a security risk in audit mode (DAG is
local-only), but would be a problem if audit beads were ever broadcast.

**compare_hash Equal log** (`audit.rs::compare_hash`):
```rust
error!("A very rare event has occurred, the chances of this are fewer than the atoms in the observable universe.");
Ordering::Equal
```
If two 32-byte composite hashes are identical (2^{-256} probability), the code
logs an error and returns `Equal`. This is a defensive trap. In practice it will
never fire.

---

## 8. audit.db Schema

Separate SQLite database at `~/.braidpool/audit.db` (Linux) or
`~/Library/Application Support/braidpool/audit.db` (macOS).

### Tables

**AuditBead** — one row per accepted share:
```sql
CREATE TABLE AuditBead (
    id              INTEGER PRIMARY KEY,
    composite_hash  BLOB UNIQUE,   -- Braidpool DAG identity
    block_hash      BLOB UNIQUE,   -- Bitcoin block hash
    -- standard block header fields --
    version, prev_block_hash, merkle_root, timestamp, bits, nonce,
    -- Braidpool bead metadata --
    payout_address, start_timestamp, comm_pub_key, min_target,
    weak_target, miner_ip,
    extranonce1     TEXT,          -- hex (16 chars = 8 bytes u64)
    extranonce2     TEXT,          -- hex (16 chars)
    broadcast_timestamp BLOB,
    signature       BLOB,
    created_at      INTEGER        -- UNIX seconds
);
```

**AuditBeadParent** — DAG edges (multi-parent):
```sql
CREATE TABLE AuditBeadParent (
    child_id         INTEGER REFERENCES AuditBead(id) ON DELETE CASCADE,
    parent_block_hash BLOB   REFERENCES AuditBead(block_hash) ON DELETE RESTRICT,
    parent_timestamp INTEGER,
    PRIMARY KEY (child_id, parent_block_hash)
);
```

**MinerStatsView** — aggregated per-miner counts:
```sql
CREATE VIEW MinerStatsView AS
SELECT miner_ip,
       COUNT(*)     AS total_valid_beads,
       MIN(created_at) AS first_bead_at,
       MAX(created_at) AS last_bead_at
FROM AuditBead GROUP BY miner_ip;
```

**What MinerStatsView cannot answer**: Only valid (accepted) beads are stored,
so there is no rejection denominator. Error rate, invalid signature count, and
stale rate cannot be computed from the DB alone — they live in `AuditDAG.records`
in memory only.

**AuditTips view** — current DAG leaf nodes:
```sql
CREATE VIEW AuditTips AS
SELECT ab.*
FROM AuditBead ab
LEFT JOIN AuditBeadParent abp ON abp.parent_block_hash = ab.block_hash
WHERE abp.child_id IS NULL;
```
Finds beads whose `block_hash` never appears as a parent — the live tips of the
DAG.

### composite_hash vs block_hash

`composite_hash` is Braidpool's DAG identity (derived from all bead metadata
including parent links). `block_hash` is the standard Bitcoin block hash. Both
are UNIQUE in `AuditBead`. `AuditBeadParent` references `parent_block_hash` so
parent rows can be independently identified via Bitcoin consensus.

### State restoration on restart

```
AuditDAG::new_with_db()
    │
    └─► load_from_db()
            │
            ├─► get_tips() — query AuditTips view → rows
            │
            └─► parse_bead_row(pool, row)  (for each tip)
                    │
                    ├─► reconstruct Bead struct from row
                    ├─► sub-query AuditBeadParent → sort by hash → parent vector
                    └─► return (Bead, composite_hash)
```

After load, the node has all DAG tips and can resume commitment generation from
where it left off.

---

## 9. Where Audit Mode Sits in the Overall Data Flow

Updated version of `stratum-internals.md` Section 14, audit branch added:

```
Bitcoin Core ──IPC socket──► ipc_template_consumer      [normal mode only]
                                    │
                              NotifyCmd channel
                                    ▼

Upstream Pool ──TCP──► UpstreamPoolClient                [audit mode only]
                              │  subscribe / authorize
                              │  repackage job (inject commitment into ext1)
                              │
                        NotifyCmd channel
                              ▼

stratum::Notifier ──────────────────────────── mining.notify → miners (TCP)
                                                       │
                                               mining.submit
                                                       ▼
                                            stratum::handle_submit
                                                       │
                                            TemplateId::Upstream?
                                              ┌────────┴────────┐
                                              │ YES             │ NO (normal)
                                              ▼                 ▼
                             validate_and_forward_upstream  propagate_valid_bead
                                              │                 │
                              ┌───────────────┘           braid.extend()
                              │                           libp2p broadcast
                              ▼
                         AuditDAG.add_and_record_bead
                         (audit.db)
                              │
                              ▼
                         upstream_share_tx ──► UpstreamPoolClient
                                                       │
                                              forward mining.submit upstream
                                                       │
                                              upstream accepted/rejected
                                                       │
                                              AuditRecord.upstream_accepted updated
```

---

## 10. Open Tasks Related to Audit Mode

| Task | Status | Blocker |
|------|--------|---------|
| `getminer` RPC (#298) | Unimplemented | Needs `MinerStatsView` + `AuditDAG.get_stats` wired to RPC handler |
| PR #492 rebase | Needs rebase | #509 merged into dev — branch now conflicts with audit mode changes |
| MinerStatsView error rate | Design gap | Invalid/stale counts live in memory only; need schema change or in-memory join to expose via RPC |
