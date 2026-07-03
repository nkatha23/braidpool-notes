# Braidpool Stratum Layer — Deep Internals

> All code references point to `node/src/` in the braidpool repo.
> Line numbers reflect the `dev` branch as of 2026-07-03.

---

## 1. Protocol Version — Stratum V1 + BIP310

Braidpool implements **Stratum V1** — not V2. The wire format is newline-delimited
JSON-RPC 2.0, not binary. The codec is set up in `stratum.rs` using tokio's
`LinesCodec`:

```rust
// stratum.rs ~line 1954
let mut framed = FramedRead::new(reader, LinesCodec::new_with_max_length(MAX_LINE_LENGTH));
```

`MAX_LINE_LENGTH = 2^16 = 65536 bytes` — a miner sending a line longer than this
gets the connection dropped.

### Methods Handled

All method dispatch lives in `handle_client_to_server_request()` (~line 251):

| Method | Handler | What it does |
|--------|---------|--------------|
| `mining.configure` | `handle_configure()` | BIP310 version rolling negotiation |
| `mining.subscribe` | `handle_subscribe()` | Returns extranonce1, extranonce2 length |
| `mining.authorize` | `handle_authorize()` | Worker login (currently accepts all) |
| `mining.submit` | `handle_submit()` | Validates PoW, creates bead |
| `mining.suggest_difficulty` | `suggest_difficulty()` | Miner requests a difficulty |

Anything else returns an `UnknownMethod` error.

---

## 2. How Braidpool Talks to the Bitcoin Node

There are **two paths**: IPC for block templates (primary), and JSON-RPC over HTTP
for proxy calls (optional).

### A — IPC Socket (primary, for getblocktemplate)

The node connects to Bitcoin Core via a Unix domain socket. The socket path
comes from CLI (`--ipc-socket` flag, `main.rs`). A blocking task runs
`ipc_block_listener()` which:

1. Opens the socket via `SharedBitcoinClient::new(&ipc_socket_path)`
2. Calls `getblocktemplate` on Bitcoin Core to get the next template
3. Publishes templates into a channel that `ipc_template_consumer` reads
4. Sends completed blocks back to Bitcoin Core for broadcast

The template consumer (`ipc_template_consumer.rs`) parses the raw template
into a `BlockTemplate` struct and forwards it to the stratum server via
`notification_tx: mpsc::Sender<NotifyCmd>`.

### B — JSON-RPC over HTTP (optional, for proxy calls)

`BitcoinRpcConfig` (`rpc_server.rs` ~line 186) holds host/port/user/password.
The `bitcoin_proxy()` RPC method forwards arbitrary calls from Braidpool's
own JSON-RPC API down to Bitcoin Core using `reqwest::Client`. This is used
for things like `getblockchaininfo`, not for share submission.

### Flow in main.rs

```
Bitcoin Core ──IPC socket──► ipc_block_listener
                                    │
                              NotifyCmd channel
                                    │
                              ipc_template_consumer
                                    │
                         stratum::Notifier (mining.notify)
                                    │
                              miners (TCP)
```

---

## 3. TCP Binding — IPs, Ports, and Listener Setup

The stratum server is configured via `StratumServerConfig` (stratum.rs ~line 102):

```rust
pub struct StratumServerConfig {
    pub hostname: String,              // default "0.0.0.0"
    pub port: u16,                     // default 3333
    pub start_difficulty: u64,         // initial difficulty for new connections
    pub minimum_difficulty: u64,
    pub maximum_difficulty: Option<u64>,
    pub solo_address: Option<String>,
}
```

The `port` field is set from `args.stratum_port` (CLI flag) in `main.rs`. The
caller binds the `TcpListener` before passing it to `run_stratum_service()`:

```rust
// main.rs
let stratum_bind_address = format!("{}:{}", stratum_config.hostname, args.stratum_port);
let stratum_listener = tokio::net::TcpListener::bind(&stratum_bind_address).await?;
```

`run_stratum_service()` receives the already-bound listener — it does not call
`bind()` itself. This separation means the caller owns the socket and the port
is OS-assigned if `0` is passed (used in tests).

Each accepted TCP connection spawns a new tokio task. The connection's IP is
stored in `DownstreamClient.downstream_ip` and later embedded in the bead's
`committed_metadata.miner_ip`.

---

## 4. Extranonce1 — Assignment, Size, and Uniqueness

### Constants (lib.rs ~line 98)

```rust
pub const EXTRANONCE1_SIZE: usize = 8;      // 8 bytes per miner
pub const EXTRANONCE2_SIZE: usize = 8;      // 8 bytes miner-controlled
// Together: 16 bytes total extranonce space in the coinbase scriptSig
```

### Per-Connection Generation (stratum.rs ~line 1087)

```rust
// A global atomic counter gives each connection a unique ID for logging
static NEXT_CONNECTION_ID: AtomicU32 = AtomicU32::new(0);

impl Default for DownstreamClient {
    fn default() -> Self {
        let connection_id = NEXT_CONNECTION_ID.fetch_add(1, Ordering::SeqCst);
        let extranonce1_bytes = random::<u64>().to_be_bytes();  // cryptographically random
        let extranonce1_hex = hex::encode(extranonce1_bytes);
        DownstreamClient {
            extranonce1: Vec::from(extranonce1_bytes),
            extranonce2_len: EXTRANONCE2_SIZE,
            ...
        }
    }
}
```

`rand::random::<u64>()` is used instead of the connection counter for the
actual extranonce bytes. This is intentional: two nodes running simultaneously
would have overlapping sequential counters, but random 64-bit values give
near-zero collision probability across the entire pool.

### Returned to Miner in mining.subscribe

```rust
// stratum.rs ~line 1073
let extranonce1_hex_str = hex::encode(self.extranonce1.clone());
json!([subscriptions, extranonce1_hex_str, self.extranonce2_len])
// e.g. [..., "000000009495ac08", 8]
```

The miner is told: "your extranonce1 is this 8-byte hex string; you control
8 bytes of extranonce2." Total nonce space per miner: 2^64 extranonce2
combinations before the pool needs to reassign extranonce1.

---

## 5. Nonce and Merkle Root — How They Fit Together

When a miner finds a nonce, they send `mining.submit` with:
- `job_id` — which template they were working on
- `extranonce2` — their 8-byte choice (hex)
- `ntime` — the timestamp they used
- `nonce` — the 4-byte nonce they found
- optionally `version_bits` — for BIP310 version rolling

### Coinbase Reconstruction (stratum.rs handle_submit ~line 488)

The pool pre-splits the coinbase transaction into `coinbase1` and `coinbase2`
with the extranonce slot in between:

```
full coinbase = coinbase1 + extranonce1 (8 bytes) + extranonce2 (8 bytes) + coinbase2
```

On submit, the pool reconstructs:

```rust
let coinbase_tx_hex = format!(
    "{}{}{}{}",
    submitted_job.coinbase1,
    extranonce_1_hex,           // from this connection's DownstreamClient
    extranonce2.to_ascii_lowercase(),  // from miner's submit
    submitted_job.coinbase2
);
let coinbase_bytes = hex::decode(&coinbase_tx_hex)?;
let coinbase_tx = bitcoin::Transaction::consensus_decode(&mut Cursor::new(coinbase_bytes))?;
```

### Merkle Root Computation (~line 522)

```rust
let mut merkle_branches_bytes: Vec<Vec<u8>> = Vec::new();
for branch_hex in &submitted_job.coinbase_merkle_path {
    let mut branch_bytes: [u8; 32] = [0u8; 32];
    hex::decode_to_slice(branch_hex, &mut branch_bytes)?;
    merkle_branches_bytes.push(Vec::from(branch_bytes));
}
let merkle_root_bytes = calculate_merkle_root(
    coinbase_tx.compute_txid(),   // txid excludes witness (segwit-correct)
    merkle_branches_bytes.as_slice()
);
let merkle_root = TxMerkleNode::from_byte_array(merkle_root_bytes);
```

`calculate_merkle_root` hashes the coinbase TXID against each sibling in the
merkle path using double-SHA256, producing the final merkle root for the header.

---

## 6. mining.submit — Full Validation Sequence

`handle_submit()` signature (stratum.rs ~line 382):

```rust
pub async fn handle_submit(
    &mut self,
    submit_work_params: &Value,
    mining_job_map: Arc<Mutex<MiningJobMap>>,
    client_request_id: u64,
    swarm_handler: Arc<Mutex<SwarmHandler>>,
) -> Result<StratumResponses, StratumErrors>
```

**Step-by-step:**

1. **Parse params** — extract worker_name, job_id (u64), extranonce2 (hex),
   ntime (hex u32), nonce (hex u32). Returns error if any field is missing or
   wrong type.

2. **Look up job** — `mining_job_map.get_by_job_id(numeric_job_id)` returns
   the `JobDetails` (which contains the `BlockTemplate`, coinbase1/2, merkle
   path). Returns `MiningJobNotFound` if the job has been evicted.

3. **Reconstruct coinbase** — as described above.

4. **Compute merkle root** — as described above.

5. **Apply version rolling** (if miner negotiated BIP310):
   ```rust
   let mask = self.version_rolling_mask;  // stored from handle_configure
   // Validate: miner must not set bits outside the negotiated mask
   let precondition = version_bits & !mask_version_bits;
   if precondition != 0 {
       return Err(StratumErrors::MaskNotValid{...});
   }
   // Apply: keep non-rollable bits from template, take rollable bits from miner
   final_version = (header_version & !mask) | (version_bits & mask);
   ```

6. **Build block header**:
   ```rust
   let header = BlockHeader {
       version: BlockVersion::from_consensus(final_masked_version),
       prev_blockhash: submitted_job.blocktemplate.previousblockhash,
       merkle_root,
       time: BlockTime::from_u32(ntime_u32),
       bits: submitted_job.blocktemplate.bits,
       nonce: nonce_u32,
   };
   ```

7. **Validate PoW**:
   ```rust
   match header.validate_pow(target) {
       Ok(_) => {
           // Send to block submission channel (to Bitcoin Core via IPC)
           submission_tx.send(BlockSubmissionRequest { template_id, header, coinbase_transaction })?;
           // Return true to miner
           StandardResponse::new_ok(Some(client_request_id), json!(true))
       }
       Err(_) => {
           // Return false — invalid share, not an error
           StandardResponse::new_ok(Some(client_request_id), json!(false))
       }
   }
   ```

   The `target` is derived from the template's `bits` field (compact target).

---

## 7. Difficulty — How It Works Today

### mining.suggest_difficulty (~line 797)

The miner sends its preferred difficulty. The server:
- Records `suggest_difficulty_done = true`
- Responds immediately with `mining.set_difficulty` containing the miner's
  requested value (no clamping to pool min/max yet)

**There is no dynamic difficulty adjustment.** The server does not track share
rate per miner and does not auto-adjust difficulty. The `start_difficulty`,
`minimum_difficulty`, and `maximum_difficulty` fields in `StratumServerConfig`
exist but are not yet wired into an adjustment loop.

This is a known gap in the current implementation — real pools run a VARDIFF
algorithm to target a share every N seconds per miner.

---

## 8. Version Rolling — BIP310

BIP310 lets ASICs roll the block version bits to extend the nonce space beyond
the 4-byte nonce. The miner requests it in `mining.configure`.

### Negotiation (handle_configure ~line 902)

Miner sends:
```json
{"method":"mining.configure","params":[["version-rolling"],{"version-rolling.mask":"1fffe000","version-rolling.min-bit-count":"00000010"}]}
```

Server:
1. Parses the requested mask (4 bytes hex)
2. ANDs with `0x1FFFE000` — the BIP320-compliant rollable range (bits 13–28)
3. Stores the final mask in `self.version_rolling_mask`
4. Responds with the negotiated mask and min-bit-count

```rust
let final_rollable_version_bits = u32::from_be_bytes(mask_bytes) & 0x1FFFE000;
self.version_rolling_mask = Some(format!("{:08x}", final_rollable_version_bits));
```

### Validation on Submit

During `handle_submit`, if a mask was negotiated, the miner must pass
`version_bits` as param[5]. The server checks:
- Miner only set bits within the negotiated mask
- Computes `final_version = (template_version & !mask) | (version_bits & mask)`

---

## 9. MiningJobMap — Job Storage and Eviction

Each downstream miner connection has its own `MiningJobMap` keyed by
`peer_addr` in a shared `HashMap<String, Arc<Mutex<MiningJobMap>>>`.

```rust
pub struct MiningJobMap {
    mining_jobs: HashMap<TemplateId, JobDetails>,     // template_id → full job
    job_id_to_template: HashMap<u64, TemplateId>,     // numeric id → template_id
    next_job_id: u64,                                  // monotonically increasing
    capacity: usize,                                   // eviction cap
}
```

### Eviction (insert_mining_job)

`MAX_JOBS_PER_MINER = 10` (lib.rs). On every insert, if the map is full, the
oldest job is evicted:

```rust
if self.job_id_to_template.len() >= self.capacity {
    // oldest_id = next_job_id - capacity (exact, because ids are sequential)
    if let Some(oldest_id) = numeric_job_id.checked_sub(self.capacity as u64) {
        if let Some(old_template) = self.job_id_to_template.remove(&oldest_id) {
            self.mining_jobs.remove(&old_template);
        }
    }
}
```

O(1) eviction per insert. No heap allocation. No timestamp needed.

### Why 10?

A miner submitting a share for a job older than the last 10 templates is
working on stale data anyway — the block has almost certainly already been
found. 10 is conservative; it covers several minutes of templates at typical
block arrival rates.

---

## 10. Share → Bead → DAG

When `handle_submit` validates a PoW, it calls `swarm_handler.propagate_valid_bead()`
(lib.rs ~line 285). This is where a miner's share becomes a first-class DAG node.

### Bead Construction (lib.rs ~line 305)

```rust
let weak_share = Bead {
    block_header: candidate_block_header,   // the validated header
    committed_metadata: CommittedMetadata {
        comm_pub_key: public_key,           // placeholder public key
        transaction_ids: TxIdVec(transaction_ids),
        parents: parent_hash_set,           // current tips of the braid
        parent_bead_timestamps: time_hash_set,
        payout_address: downstream_payout_addr.to_string(),
        start_timestamp: job_notification_time,
        min_target: min_target,
        weak_target: weak_target,
        miner_ip: downstream_client_ip.to_string(),
    },
    uncommitted_metadata: UnCommittedMetadata {
        broadcast_timestamp: unix_timestamp,
        extra_nonce_1: extranonce_1_raw_value,  // u64
        extra_nonce_2: extranonce_2_raw_value,  // u64
        signature: sig,                          // placeholder (see security section)
    },
};
```

### DAG Extension (lib.rs ~line 372)

```rust
let status = braid_data.extend(&weak_share);
```

`braid::extend()` links the new bead to the current tips (parents), advances
the Highest Work Path if necessary, and returns `BeadAdded`, `BeadAlreadyExists`,
or an error.

### P2P Broadcast (lib.rs ~line 413)

```rust
let serialized_weak_share_bytes = bitcoin::consensus::serialize(&weak_share);
self.command_sender.send(SwarmCommand::PropagateValidBead {
    bead_bytes: serialized_weak_share_bytes,
}).await?;
```

The swarm handler publishes to a floodsub topic so all peers receive the new
bead. Peers that receive it call `braid::extend()` on their own copy.

---

## 11. Payout / FROST — Current Status

**There is no FROST or multisig payout implementation.**

What exists today:
- `payout_address` field in `CommittedMetadata` — stores the miner's address
  string (from the worker name or solo_address config). Not validated as a
  valid Bitcoin address.
- A **hardcoded placeholder ECDSA signature** in every bead:
  ```rust
  let hex = "3046022100839c1fbc5304de944f697c9f4b1d01d1faeba32d751c0f7acb21ac8a0f436a72...";
  let sig = Signature {
      signature: secp256k1::ecdsa::Signature::from_str(hex).unwrap(),
      sighash_type: EcdsaSighashType::All,
  };
  ```
- No per-miner UTXO generation, no Schnorr threshold signing, no UHPO
  (Unspent Hasher Payout Output) construction.

The FROST multisig payout is a planned feature from the braidpool spec but
has not been started in the Rust node yet.

---

## 12. Security Concerns

### HIGH

| Issue | Location | Detail |
|-------|----------|--------|
| Hardcoded placeholder signature | lib.rs ~line 340 | All beads share the same signature. No per-miner signing, no signature verification on receive. Bead authenticity is not enforced. |

### MEDIUM-HIGH

| Issue | Location | Detail |
|-------|----------|--------|
| Worker name used as payout address without validation | lib.rs ~line 335 | `downstream_payout_addr` comes from worker name. Not checked for valid bech32/P2PKH format. Garbage address silently embedded in bead metadata. |
| `bead_index_mapping.get().unwrap()` | lib.rs ~line 383 | Panics if a bead hash is missing from the index. Could crash the node if bead is extended but not indexed. |

### MEDIUM

| Issue | Location | Detail |
|-------|----------|--------|
| `to_u32().unwrap()` on timestamp | lib.rs ~line 356 | Panics after year 2106 when Unix time exceeds u32::MAX. Not a today problem, worth noting. |
| No extranonce2 length validation on submit | stratum.rs ~line 446 | Pool checks hex is decodable but not that `len == EXTRANONCE2_SIZE * 2`. Wrong-length extranonce2 silently produces a wrong coinbase and the share fails PoW — not a crash, but wastes a round trip. |
| No rate limiting on mining.submit | stratum.rs ~line 382 | A malicious miner can spam invalid submits with zero consequence. No per-connection submit counter or backpressure. |
| No validation that submitted ntime is recent | stratum.rs handle_submit | ntime is used as-is from the miner. Far-future timestamps would be rejected by Bitcoin's block validity rules but the pool doesn't pre-check. |

---

## 13. Constants Reference

All in `node/src/lib.rs`:

```rust
pub const EXTRANONCE1_SIZE: usize = 8;         // bytes, per connection
pub const EXTRANONCE2_SIZE: usize = 8;         // bytes, miner-controlled
pub const EXTRANONCE_SEPARATOR: [u8; 16] = [1u8; 16];  // 16-byte slot in coinbase
pub const MAX_CACHED_TEMPLATES: usize = 90;    // Bitcoin template cache cap
pub const MAX_JOBS_PER_MINER: usize = 10;      // MiningJobMap eviction cap
```

In `node/src/stratum.rs`:
```rust
const MAX_LINE_LENGTH: usize = 65536;          // max bytes per JSON message from miner
```

---

## 14. Data Flow Summary

```
Bitcoin Core
    │  (IPC socket / getblocktemplate)
    ▼
ipc_template_consumer
    │  (NotifyCmd channel)
    ▼
stratum::Notifier  ──────────────────────────────────► mining.notify → miner TCP
    │                                                       │
    │                                               miner rolls nonce space:
    │                                               extranonce2 (8 bytes) × nonce (4 bytes)
    │                                               × version_bits (BIP310, up to 13 bits)
    │                                                       │
    │                                               mining.submit
    ▼                                                       │
stratum::handle_submit ◄────────────────────────────────────┘
    │  reconstruct coinbase
    │  compute merkle root
    │  build BlockHeader
    │  validate_pow(target)
    │
    ├── if PoW meets full Bitcoin target ──► block_submission_tx ──► Bitcoin Core (IPC)
    │
    └── if PoW meets pool weak target ──► propagate_valid_bead()
            │  build Bead (committed + uncommitted metadata)
            │  braid.extend(&bead)   ← DAG update
            └── SwarmCommand::PropagateValidBead ──► libp2p floodsub ──► peers
```
