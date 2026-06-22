# Braidpool Stratum Layer — 6-Month Contribution Roadmap

**Contributor:** [Nkatha Kaburu](https://github.com/nkatha23)  
**Duration:** 6 months  
**Scope:** Stratum V1 scalability + v0.1 protocol completeness + testing infrastructure + multicast research

---

## Context

The roadmap covers four areas in order of dependency:

1. **Stratum scalability** — fixes that must land before real miners connect
2. **Protocol completeness** — hardcoded placeholders in `propagate_valid_bead` that block v0.1
3. **Testing infrastructure** — required to verify both of the above at scale
4. **Multicast research** — the architectural direction identified for 40,000+ miners

Areas intentionally excluded: EDCA payout implementation, FROST signing (v0.3, research-grade), peer discovery (v0.2).

---

## Month 1 — MiningJobMap Memory Safety

### Primary: Issue 1 — Unbounded Job History

**Location:** `stratum.rs` lines 1186–1248

`MiningJobMap` stores every job ever created with no eviction. `next_job_id`
increments forever. At bead-rate updates (150ms–1000ms per `braid_consensus.md`
Eq. 7) instead of block-rate (10 minutes):

```
10,000 miners × bead-rate jobs × ~2KB per JobDetails = OOM within hours
```

Note: `lib.rs` already has `MAX_CACHED_TEMPLATES = 90` for the Bitcoin template
cache — the job map needs the same treatment.

**Fix:**

```rust
const MAX_JOBS_PER_MINER: usize = 10;

if self.job_id_to_template.len() >= self.capacity {
    if let Some(oldest_id) = numeric_job_id.checked_sub(self.capacity as u64) {
        if let Some((_, old_template)) = self.job_id_to_template.remove(&oldest_id) {
            self.mining_jobs.remove(&old_template);
        }
    }
}
```

### Secondary: A1 — Job Delivery Latency Instrumentation

v0.1 data gathering question #1 (from `roadmap.md`): *"What is the latency in
submitting a new work unit to a mining device?"* No timing exists on the notify
path today.

**Fix:** Add `tokio::time::Instant` at template arrival and at channel send, log
delta per miner on every `mining.notify`.

**Deliverables:**
- `fix(stratum): cap MiningJobMap with capacity-based eviction`
- `fix(stratum): instrument job delivery latency per miner`

---

## Month 2 — Cleanup Guarantee + Share Accounting + Coinbase Size

### Primary: Issue 4 — Cleanup Not Guaranteed on Panic

**Location:** `stratum.rs` lines 1876–1895

Cleanup only runs if `handle_connection` returns normally. Any `.unwrap()` panic
leaves ghost entries in `ConnectionMapping` and the job map forever.

**Fix:** `ConnectionGuard` using Rust's `Drop` trait:

```rust
struct ConnectionGuard {
    peer_addr: String,
    connection_mapping: Arc<RwLock<ConnectionMapping>>,
    mining_job_map: Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        // runs on normal return, panic, AND cancellation
    }
}
```

### Secondary: A3 — Per-Miner Share Accounting

v0.1 data gathering question #3: *"What is the error rate of the miner?"* No
counters exist today for `shares_accepted`, `shares_stale`, `shares_invalid`
per connection.

**Fix:** Add per-connection counters to `DownstreamClient`, log on disconnect
and every N minutes.

### Secondary: A2 — Coinbase Size Limit Enforcement

v0.1 data gathering question #2: *"How large of a coinbase can the mining unit
handle?"* `template_creator.rs` has `MAX_OP_RETURN_DATA = 80` and
`MAX_COINBASE_SCRIPT_SIG = 100` but no guard preventing the full coinbase
exceeding Bitcoin's 100kB consensus limit as committed metadata grows.

**Fix:** Add size assertion in coinbase construction before `mining.notify`.

**Deliverables:**
- `fix(stratum): guarantee miner cleanup on disconnect via ConnectionGuard`
- `fix(stratum): add per-miner share accounting counters`
- `fix(stratum): enforce coinbase size limit before mining.notify`

---

## Month 3 — DashMap Migration + Connection Limit

### Primary: Issue 2 — Nested Mutex Deadlock

**Location:** `stratum.rs` line 1258

Two layers of async locks on the global job map:

```rust
Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>
```

Reading a job requires locking both layers in sequence. If two async tasks
acquire in different orders, or hold either lock across an `.await` point,
tokio deadlocks. At 10,000 concurrent `mining.submit` calls this becomes
near-certain.

**Fix:** Replace with `DashMap` + `AtomicU64`:

```rust
// Before
Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>

// After
Arc<DashMap<String, Arc<MiningJobMap>>>

pub struct MiningJobMap {
    mining_jobs: DashMap<TemplateId, JobDetails>,
    job_id_to_template: DashMap<u64, TemplateId>,
    next_job_id: AtomicU64,
    capacity: usize,
}
```

Share submission becomes fully concurrent — no lock acquisition on the hot path.

### Secondary: Issue 3 — No Connection Limit

**Location:** `stratum.rs` lines 1840–1860

Every TCP connection is accepted unconditionally. At 40,000 miners, combined
with unbounded job maps, this exhausts both RAM and file descriptors. Opening
40,000 TCP connections requires hundreds of GBs of RAM in kernel state alone.

**Fix:**

```rust
const MAX_DOWNSTREAM_CONNECTIONS: usize = 10_000;

if downstream_connection_mapping.read().await
    .downstream_channel_mapping.len() >= MAX_DOWNSTREAM_CONNECTIONS {
    warn!("Connection limit reached, rejecting new connection");
    continue;
}
```

Log a warning at 80% capacity so operators can plan ahead.

**Deliverables:**
- `refactor(stratum): replace nested mutex with DashMap + AtomicU64`
- `fix(stratum): add MAX_DOWNSTREAM_CONNECTIONS with metric logging`

---

## Month 4 — Hardcoded Placeholders in `propagate_valid_bead`

This is the most important month for v0.1 protocol correctness. Three explicit
TODOs in `lib.rs` lines 297–334 block real bead propagation — every bead
currently carries fabricated data.

### TODO 1 — Line 297: Hardcoded Public Key

```rust
// Current
let public_key = "020202020202020202020202020202020202020202020202020202020202020202"
    .parse::<bitcoin::PublicKey>().unwrap();
// "Will be used as separate entity after altering uncommitted_metadata."
```

The miner's real pubkey must come from `mining.authorize` credentials or node
config. This key goes into `committed_metadata.comm_pub_key` — it is what FROST
uses to identify eligible signers and what EDCA uses for share attribution.

### TODO 2 — Line 315: Hardcoded Weak Target

```rust
// Current
let weak_target = CompactTarget::from_unprefixed_hex("1d00ffff").unwrap();
// "Will be replaced via WeakShareDifficulty after difficulty adjustment."
```

This hardcoded value means all beads use Bitcoin mainnet difficulty regardless
of pool settings. The per-bead difficulty must come from the braid consensus
layer — the difficulty adjustment formula in `braid_consensus.md` Eq. 7–11.

### TODO 3 — Line 334: Hardcoded Signature

```rust
// Current
let hex = "3046022100839c1fb...";
// "Will be generated via Pubkey from config parameter from ~/.braidpool."
```

The signature must come from the node's signing key loaded from config.

### Fix Approach

These three TODOs are interconnected — all require a miner identity and signing
key in config. Work order:

1. Add `comm_pub_key` and `signing_key` to `StratumServerConfig` or a new
   `MinerConfig` struct
2. Load from `~/.braidpool/config.toml` (`default_braidpool_config.toml` already
   exists in the source)
3. Wire the real pubkey into `propagate_valid_bead`
4. Wire the real `weak_target` from the braid consensus layer
5. Generate the real signature from the loaded signing key

**Deliverables:**
- `feat(config): add miner identity (pubkey + signing key) to node config`
- `fix(lib): replace hardcoded public key in propagate_valid_bead`
- `fix(lib): replace hardcoded weak_target with braid consensus difficulty`
- `fix(lib): replace hardcoded signature with real signing key`

---

## Month 5 — Backpressure + Bead-Rate Jobs + Testing Infrastructure

### Primary: Issue 5 — Slow Miner Backpressure

**Location:** `stratum.rs` line 1857

Each miner has a 1024-message channel buffer. At bead-rate job updates (C1
below), this buffer fills in seconds for any high-latency miner. Job
notifications are silently dropped — the miner mines stale work without knowing.

**Fix:** Detect full buffer, log the slow miner, set `clean_jobs=true` on the
next send, disconnect after N consecutive failures. Coordinate `clean_jobs` with
cohort boundaries — it should fire at graph cuts, not arbitrarily.

### Secondary: C1 — Sub-Second Job Update Rate

Current job trigger: new Bitcoin block (~10 minutes). Bead time targets
150ms–1000ms. Stratum needs a second trigger: new DAG tip detected → new job
issued. The job map capacity from Month 1 must be sized for bead-rate, not
block-rate.

### Secondary: A4 — Network Latency Measurement

v0.1 data gathering question #4: *"What is the network latency we can expect?"*
Record connection timestamp and first `mining.subscribe` response time per peer.
Log RTT per miner — needed to determine whether stratum or network topology is
the bottleneck.

### Testing Infrastructure

No simulated miner harness exists. The existing `TcpStream` pattern in stratum
tests (lines 2074–2130) shows the right approach — extend it into a reusable
load tool.

```rust
async fn simulate_miner(addr: SocketAddr, id: u64) {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    // subscribe → authorize → receive notify → submit fake share
    // record: connect_time, subscribe_latency, notify_latency
}

for id in 0..N_MINERS {
    tokio::spawn(simulate_miner(addr, id));
}
```

This tool opens N raw TCP connections, sends valid stratum messages, receives
jobs, and submits fake shares — without doing any real hashing. On an 8GB
machine, 10,000 concurrent connections is achievable with `ulimit` adjustments.

Also build: chaos test (simulate `kill -9`, network drop, panic mid-connection
→ verify zero ghost entries) and a lock benchmark (`Mutex<HashMap>` vs `DashMap`
at 1k/10k concurrent submitters).

**Deliverables:**
- `fix(stratum): handle full downstream channel with clean_jobs coordination`
- `fix(stratum): add bead-rate job update trigger from DAG tip changes`
- `fix(stratum): record per-miner connection and subscribe latency`
- `test(stratum): simulated miner harness and chaos test suite`

---

## Month 6 — Multicast Research + 10k Load Test

### The TCP Scaling Wall

The current TCP-per-miner architecture has a hard ceiling well below 40,000
devices:

- 40,000 TCP connections = hundreds of GB RAM in kernel state alone
- Round-robin notify: if each `mining.notify` takes 1μs, notifying 40k miners
  takes 40ms — 27% of a 150ms bead window burned before a single hash is
  computed
- A slow or stalled miner blocks the notify loop for all miners behind it

UDP multicast eliminates this:
- Pool sends **one** UDP multicast packet to the group — O(1) cost regardless
  of miner count
- Each miner uses its `extranonce1` (PRs #472, #475) to subdivide the 2^64
  nonce space independently — no per-miner coordination needed
- TCP control channel kept for `mining.subscribe`, `mining.authorize`, share
  submission; UDP only for job delivery (`mining.notify`)

This maps directly to `roadmap.md` v0.7: *"P2P latency improvements through
Forward Error Correction over UDP (FEC)."* Month 6 is the groundwork for that.

### Research Tasks

**1. Nonce subdivision protocol**  
With 8-byte `extranonce1`, each of 2^64 miners gets a deterministic slice:
`[extranonce1 × slice_size, (extranonce1 + 1) × slice_size)`. Define the
slice size calculation and how it interacts with `extranonce2` rolling.

**2. Multicast group management**  
Miner joins multicast group after TCP `mining.subscribe`. Pool maintains a
multicast address per network segment for geographic locality.

**3. Reliability layer**  
UDP has no delivery guarantee. Options: sequence numbers with retransmit
request, FEC (as in roadmap v0.7), or accept occasional stale beads and measure
actual packet loss rate on CPUNet testnet.

**4. Share submission**  
Stays TCP or UDP unicast with acknowledgment. No change to `mining.submit` path.

**5. Prototype**  
Implement UDP multicast broadcaster alongside the existing TCP path. A/B test
at 100 / 1,000 / 10,000 simulated miners using the Month 5 harness. Measure:
notification latency, packet loss rate, miner coverage.

### 10k Load Test

Run the Month 5 simulated miner harness at full scale — 10,000 concurrent
connections for 24 hours. Measure and document:

- Memory usage over time (flat after Month 1–3 fixes)
- Share submission latency at p50/p95/p99
- Ghost connections after all disconnect patterns
- Job delivery latency vs bead time window

**Deliverables:**
- `research(stratum): UDP multicast job delivery prototype`
- `research/stratum/multicast-benchmark.md` — TCP vs UDP measured at scale
- Report to maintainers: recommendation on multicast transition for v0.2

---

## Full Delivery Table

| Month | Primary | Secondary | PRs |
|-------|---------|-----------|-----|
| 1 | Job map cap | Latency instrumentation | 2 |
| 2 | Cleanup guarantee | Share accounting + coinbase size | 3 |
| 3 | DashMap migration | Connection limit | 2 |
| 4 | Hardcoded placeholders in `propagate_valid_bead` | Config/identity system | 4 |
| 5 | Backpressure + bead-rate jobs | Latency measurement + test harness | 4 |
| 6 | Multicast research | 10k load test | 2 + report |

---

## What Success Looks Like

**End of Month 1:** Node runs 7 days with 100 miners, flat memory. Job map
entries per miner stay at or below capacity. Job delivery latency logged per
miner — first real numbers for v0.1 question #1.

**End of Month 2:** Abnormal disconnects leave zero ghost entries, verified by
chaos test. Coinbase size violations caught before `mining.notify`. Per-miner
share error rates visible in logs — first real numbers for v0.1 questions #2
and #3.

**End of Month 3:** `mining.submit` under concurrent load shows no lock wait
spikes. `DashMap` benchmark shows >10x throughput over `Mutex<HashMap>` at
1,000+ concurrent submitters. Node rejects connections beyond limit cleanly.

**End of Month 4:** `propagate_valid_bead` uses real miner pubkeys, real
difficulty from the braid consensus layer, and real signatures from the node
config. Beads propagated in this state are protocol-correct for v0.1.

**End of Month 5:** Bead-rate job updates working. Slow miners detected and
handled. Network latency measured per miner — first real numbers for v0.1
question #4. Simulated load test at 10,000 miners runs 24 hours: memory under
4GB, share submission latency under 10ms p99, zero ghost connections after any
disconnect pattern.

**End of Month 6:** UDP multicast prototype benchmarked against TCP at 10,000
connections. Recommendation delivered to maintainers. If viable: notification
latency drops from O(N) to O(1), enabling 40,000+ device support without
hardware scaling — groundwork for roadmap v0.7 FEC/UDP work.
