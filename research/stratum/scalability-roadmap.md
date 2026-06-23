# Braidpool Stratum Layer — 6-Month Contribution Roadmap

**Contributor:** [Nkatha Kaburu](https://github.com/nkatha23)  
**Duration:** 6 months  
**Scope:** Stratum V1 scalability fixes + UDP multicast job delivery implementation

---

## Context

The current Stratum V1 implementation has two problems:

1. **Structural bugs** that will cause crashes at scale — unbounded memory,
   deadlocks, missing cleanup. These must be fixed before any real miners connect.
2. **Fundamental architecture limit** — TCP-per-miner doesn't scale to 40,000
   devices. UDP multicast is the solution: one packet from the server, all miners
   receive it simultaneously, each miner subdivides the nonce space using its
   assigned `extranonce1`.

Months 1–2 fix the structural bugs. Months 3–6 design and implement UDP multicast.
The multicast implementation is the primary deliverable of this roadmap.

---

## Month 1 — Stratum V1 Structural Fixes (Part 1)

### Issue 1 — MiningJobMap Grows Forever (OOM)

**Location:** `stratum.rs` lines 1186–1248

`MiningJobMap` stores every job ever created with no eviction. `next_job_id`
increments forever. At bead-rate job updates (150ms–1000ms per `braid_consensus.md`
Eq. 7) instead of block-rate (10 minutes):

```
10,000 miners × bead-rate jobs × ~2KB = OOM within hours
```

Note: `lib.rs` already has `MAX_CACHED_TEMPLATES = 90` for the Bitcoin template
cache — the job map needs the same treatment.

**Fix:** Capacity-based eviction using the monotonic job ID:

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

**Test:** Fill the map past capacity, assert oldest entry is gone, assert memory
usage stays flat over 24 hours with 100 miners connected.

### Issue 2 — Nested Mutex Deadlock

**Location:** `stratum.rs` line 1258

```rust
Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>
```

Two async locks acquired in sequence. If two tasks acquire in different orders,
or either holds a lock across an `.await` point, tokio deadlocks. At 10,000
concurrent `mining.submit` calls this is near-certain.

**Fix:** Replace both layers with `DashMap` (internal sharding, no external
mutex) and `AtomicU64` for the job counter:

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

**Benchmark:** `Mutex<HashMap>` vs `DashMap` at 1k/10k concurrent submitters.
Target: >10x throughput improvement.

### A1 — Job Delivery Latency Instrumentation

v0.1 data gathering question #1: *"What is the latency in submitting a new work
unit to a mining device?"* No timing exists on the notify path today. This data
is needed before any latency optimization can be validated.

**Fix:** Add `tokio::time::Instant` at template arrival and at channel send. Log
delta per miner on every `mining.notify`. Also record per-miner queue depth at
time of send — high queue depth with high latency identifies slow miners early.

**Output:** Baseline latency histogram for the TCP path, against which the
Month 4–6 multicast numbers will be compared.

**Deliverables:**
- `fix(stratum): cap MiningJobMap with capacity-based eviction`
- `refactor(stratum): replace nested mutex with DashMap + AtomicU64`
- `fix(stratum): instrument job delivery latency per miner`

---

## Month 2 — Stratum V1 Structural Fixes (Part 2)

### Issue 3 — No Connection Limit

**Location:** `stratum.rs` lines 1840–1860

Every TCP connection is accepted unconditionally. At 40,000 miners, combined
with the unbounded job maps, this exhausts both RAM and file descriptors. Opening
40,000 TCP connections requires hundreds of GB of RAM in kernel state alone.

**Fix:**

```rust
const MAX_DOWNSTREAM_CONNECTIONS: usize = 10_000;

if downstream_connection_mapping.read().await
    .downstream_channel_mapping.len() >= MAX_DOWNSTREAM_CONNECTIONS {
    warn!("Connection limit reached, rejecting new connection");
    continue;
}
```

Also log a warning at 80% capacity and expose a metric so operators can plan
ahead. Add a test that hits the limit and verifies the rejection is graceful.

### Issue 4 — Cleanup Not Guaranteed on Panic

**Location:** `stratum.rs` lines 1876–1895

Cleanup only runs if `handle_connection` returns normally. Any `.unwrap()` panic
leaves ghost entries in `ConnectionMapping` and the job map forever, consuming
memory that is never reclaimed.

**Fix:** `ConnectionGuard` using Rust's `Drop` trait — cleanup runs on normal
return, panic, and async cancellation:

```rust
struct ConnectionGuard {
    peer_addr: String,
    connection_mapping: Arc<RwLock<ConnectionMapping>>,
    mining_job_map: Arc<DashMap<String, Arc<MiningJobMap>>>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        // spawn cleanup task since drop is sync
        let peer_addr = self.peer_addr.clone();
        let cm = Arc::clone(&self.connection_mapping);
        let jm = Arc::clone(&self.mining_job_map);
        tokio::spawn(async move {
            cm.write().await.downstream_channel_mapping.remove(&peer_addr);
            jm.remove(&peer_addr);
        });
    }
}
```

**Test:** Simulate `kill -9`, network drop, and deliberate panic mid-connection.
Assert zero ghost entries after each. This is the chaos test baseline.

### Issue 5 — Slow Miner Backpressure

**Location:** `stratum.rs` line 1857

Each miner has a 1024-message channel buffer. At bead-rate job updates this
fills in seconds for any high-latency miner. Job notifications are silently
dropped — the miner mines stale work without knowing.

**Fix:**
1. On `try_send` failure (full buffer): log the slow miner, record a `jobs_dropped` counter.
2. Set `clean_jobs=true` on the next successful send so the miner abandons stale work immediately.
3. After N consecutive failures, disconnect the miner — a miner that can't drain its buffer cannot meaningfully participate.
4. Coordinate `clean_jobs=true` with cohort boundaries from `node/src/braid/mod.rs`
   — fire it at graph cuts, not arbitrarily.

### A2 — Coinbase Size Limit Enforcement

v0.1 data gathering question #2: *"How large of a coinbase can the mining unit
handle?"* `template_creator.rs` has `MAX_OP_RETURN_DATA = 80` and
`MAX_COINBASE_SCRIPT_SIG = 100` but no guard preventing the total coinbase
exceeding Bitcoin's consensus limit as committed metadata grows.

**Fix:** Assert total coinbase size before issuing `mining.notify`. Log the
measured size per job so v0.1 operators can report actual hardware limits.

### A3 — Per-Miner Share Accounting

v0.1 data gathering question #3: *"What is the error rate of the miner?"* No
counters exist today.

**Fix:** Add to `DownstreamClient`:

```rust
struct ShareCounters {
    accepted: AtomicU64,
    stale: AtomicU64,    // valid share, job already evicted
    invalid: AtomicU64,  // wrong difficulty, bad extranonce reuse
    dropped: AtomicU64,  // jobs_dropped due to full buffer
}
```

Log on disconnect and every 10 minutes. `stale` rate is a leading indicator
of Issue 5 backpressure — a miner with rising stale rate is falling behind.

**Deliverables:**
- `fix(stratum): add MAX_DOWNSTREAM_CONNECTIONS with metric logging`
- `fix(stratum): guarantee cleanup via ConnectionGuard`
- `fix(stratum): slow miner backpressure with clean_jobs coordination`
- `fix(stratum): coinbase size limit enforcement + per-miner share counters`

---

## Month 3 — Multicast Protocol Design + Infrastructure

### Why TCP Doesn't Scale

At 40,000 miners:

| Problem | Impact |
|---------|--------|
| 40,000 TCP connections | ~hundreds of GB RAM in kernel state alone |
| Round-robin `mining.notify` at 1μs/send | 40ms per job broadcast — 27% of a 150ms bead window |
| One slow miner | Blocks the notify loop for every miner behind it |
| TCP state machine overhead | SYN/ACK, keepalive, retransmit per connection |

The multicast model replaces the per-miner loop with a single packet:

```
Current (TCP):
  Server → miner_1 (mining.notify)  ─┐
  Server → miner_2 (mining.notify)   │  O(N) time
  ...                                 │
  Server → miner_40000              ─┘

Multicast (UDP):
  Server → multicast_group ──────────── O(1) time
     ├─→ miner_1 (simultaneous)
     ├─→ miner_2 (simultaneous)
     └─→ miner_40000 (simultaneous)
```

Each miner uses its assigned `extranonce1` (8 bytes, PRs #472/#475) to
subdivide the 2^64 nonce space independently — no per-miner coordination needed.

TCP stays for: `mining.subscribe` (join + extranonce1 assignment),
`mining.authorize` (authentication), `mining.submit` (share submission).  
UDP multicast for: `mining.notify` only.

### Nonce Subdivision Protocol

With 8-byte `extranonce1`, 2^64 unique partition slots are available. The
subdivision must be deterministic — every node must be able to verify that a
submitted share falls within the correct miner's assigned range.

Define:
- `slice_size = 2^64 / MAX_DOWNSTREAM_CONNECTIONS` (or a power-of-two aligned value)
- Miner with `extranonce1 = N` searches `[N × slice_size, (N+1) × slice_size)`
- `extranonce2` rolls within this slice, giving `slice_size × 2^64` total combinations per job

Document the interaction with `extranonce2` rolling — the combined search space
must not wrap or collide between adjacent miners.

### Multicast Group Architecture

Design the group management protocol:

1. **Miner connects** via TCP `mining.subscribe` → receives `extranonce1` (existing)
2. **New field in subscribe response**: `multicast_group_addr` — the IPv4 multicast
   address and port the miner should join (e.g. `239.0.0.1:3334`)
3. **Miner joins** the UDP multicast group using `IP_ADD_MEMBERSHIP`
4. **Pool tracks** joined miners via the existing TCP connection — if TCP drops,
   miner is considered departed; no separate multicast-layer bookkeeping needed
5. **Geographic segments**: define whether one pool-wide group or per-region groups
   are used (relevant for high-latency WANs)

Research question: does IGMP snooping on managed switches affect CPUNet testnet
deployments? Document findings.

### Reliability Layer Design

UDP has no delivery guarantee. Three options, each with different tradeoffs:

| Option | Latency overhead | Complexity | When to use |
|--------|-----------------|------------|-------------|
| Accept loss | None | None | LAN / <0.1% loss |
| Sequence + retransmit | 1 RTT per gap | Low | WAN with occasional loss |
| FEC (roadmap v0.7) | Fixed overhead | High | High-loss or satellite links |

Month 3 decision: design the sequence + retransmit option (implementable in
Month 5). FEC is deferred to roadmap v0.7 but design must leave a clean
extension point for it.

### Job Packet Binary Format

UDP has a practical MTU of ~1472 bytes on Ethernet (1500 - 20 IP - 8 UDP).
A multicast `mining.notify` packet must fit in a single datagram:

```
Offset  Size  Field
0       4     sequence_number (u32, monotonically increasing)
4       1     version (u8, protocol version)
5       1     flags (u8, clean_jobs in bit 0)
6       32    job_id (bytes)
38      32    prev_hash (bytes)
70      var   coinbase1 (length-prefixed)
+var    var   coinbase2 (length-prefixed)
+var    var   merkle_branches (count + 32 bytes each)
+var    4     version (Bitcoin block version)
+var    4     nbits (Bitcoin difficulty)
+var    4     ntime (Unix timestamp)
```

Design the serializer/deserializer. If a job exceeds MTU, define a fragmentation
scheme or a fallback to TCP unicast for that job only.

### Stratum Load Generator

Build a Rust tool that opens N TCP connections, subscribes, receives jobs, and
submits fake shares — without doing real hashing. This is the measurement harness
for all Month 4–6 benchmarks.

```rust
async fn simulate_miner(addr: SocketAddr, id: u64, metrics: Arc<Metrics>) {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    let t0 = Instant::now();
    // subscribe → record subscribe_latency
    // authorize
    // receive mining.notify → record job_latency
    // submit fake share every N jobs
    // loop
}
```

Configurable parameters: N miners, share submission rate, simulation duration,
output format (CSV for benchmark reports).

**Deliverables:**
- `research/stratum/multicast-protocol-design.md` — full protocol spec
- `tools(stratum): Rust stratum load generator`

---

## Month 4 — UDP Multicast Core Implementation

### Multicast Broadcaster

New async task that receives job notifications and broadcasts them as UDP
multicast packets:

```rust
async fn run_multicast_broadcaster(
    mut notify_rx: mpsc::Receiver<NotifyCmd>,
    multicast_addr: SocketAddr,
    mut seq: u32,
) {
    let socket = UdpSocket::bind("0.0.0.0:0").await.unwrap();
    socket.set_multicast_ttl_v4(32).unwrap();

    while let Some(cmd) = notify_rx.recv().await {
        seq = seq.wrapping_add(1);
        let payload = serialize_notify_packet(seq, &cmd);
        socket.send_to(&payload, multicast_addr).await.unwrap();
    }
}
```

Key design decisions:
- The broadcaster runs as a sibling to the existing TCP notify loop, not a
  replacement — miners opt into multicast via `mining.subscribe`
- `seq` wraps at `u32::MAX`; receivers handle wrap-around
- Separate task from the connection handler so a slow socket write never blocks
  job processing

### Mining.subscribe Extension

Extend the `mining.subscribe` response to include the multicast group address:

```json
{
  "id": 1,
  "result": [
    [["mining.set_difficulty", "..."], ["mining.notify", "..."]],
    "extranonce1_hex",
    8,
    "239.0.0.1:3334"
  ],
  "error": null
}
```

Miners that don't understand the fourth field ignore it and continue using TCP
— full backward compatibility.

### Nonce Subdivision on the Server Side

When assigning `extranonce1`, compute and record the miner's nonce slice:

```rust
fn assign_extranonce1(connection_id: u32, max_connections: u32) -> (u64, u64, u64) {
    let slice_size = u64::MAX / max_connections as u64;
    let extranonce1 = connection_id as u64;
    let range_start = extranonce1 * slice_size;
    let range_end = range_start.saturating_add(slice_size);
    (extranonce1, range_start, range_end)
}
```

Store `(range_start, range_end)` in the connection record so share validation
can verify that submitted extranonce2 values fall within the assigned range.

### Share Validation for Multicast Miners

Extend `mining.submit` validation to check extranonce range:

```rust
fn validate_share(submission: &Submit, connection: &ConnectionRecord) -> Result<()> {
    let extranonce2 = parse_extranonce2(&submission.extranonce2)?;
    if extranonce2 < connection.range_start || extranonce2 >= connection.range_end {
        return Err(ShareError::ExtranoncOutOfRange);
    }
    // existing difficulty check...
    Ok(())
}
```

### Multicast Receiver (for Integration Tests)

Implement a `MulticastReceiver` struct for testing — connects to the multicast
group, collects packets, verifies sequence continuity:

```rust
struct MulticastReceiver {
    socket: UdpSocket,
    last_seq: u32,
    gaps: Vec<u32>,
}

impl MulticastReceiver {
    async fn recv_job(&mut self) -> (u32, NotifyCmd) { ... }
    fn packet_loss_rate(&self) -> f64 { ... }
}
```

**Deliverables:**
- `feat(stratum): UDP multicast broadcaster`
- `feat(stratum): multicast join protocol in mining.subscribe response`
- `feat(stratum): nonce subdivision and range-based share validation`
- `test(stratum): MulticastReceiver and broadcaster unit tests`

---

## Month 5 — Reliability Layer + DAG Integration + Load Testing

### Sequence Numbers and Retransmit Protocol

Each multicast packet carries a `sequence_number` (u32). Miners detect gaps:

```
miner receives: seq 100, 101, 103   ← gap at 102
miner sends via TCP: {"method": "mining.retransmit", "params": [102]}
pool responds via TCP unicast: the packet for seq 102
```

Server side: maintain a `RecentJobs` ring buffer of the last K multicast packets.
K = 64 is sufficient for typical LAN loss bursts. If the miner requests a
sequence number outside the buffer window, send a fresh `mining.notify` via TCP
with `clean_jobs=true` instead.

```rust
struct MulticastReliability {
    recent_jobs: VecDeque<(u32, Vec<u8>)>,  // (seq, serialized_packet)
    capacity: usize,
}

impl MulticastReliability {
    fn store(&mut self, seq: u32, packet: Vec<u8>) { ... }
    fn get(&self, seq: u32) -> Option<&[u8]> { ... }
}
```

### DAG Tip Integration

Wire the multicast broadcaster to DAG tip change signals — not just Bitcoin
block arrivals. Every new bead tip should trigger a new multicast packet so
miners get fresh work within microseconds of a new bead appearing.

Required: a subscription channel from `node/src/braid/mod.rs`:

```rust
// In braid/mod.rs — new signal
pub struct DagTipChanged {
    pub new_tips: Vec<BeadId>,
    pub cohort_cut: bool,  // true if this tip closes a cohort (graph cut)
}

// In stratum — subscribe on startup
let mut dag_tip_rx = braidpool_node.subscribe_dag_tips();
tokio::spawn(async move {
    while let Some(tip_event) = dag_tip_rx.recv().await {
        let clean_jobs = tip_event.cohort_cut;
        notify_tx.send(NotifyCmd { clean_jobs, ... }).await;
    }
});
```

The `cohort_cut` flag drives `clean_jobs=true` — at a graph cut all prior beads
are finalized, so miners should abandon old work immediately.

### TCP + Multicast Equivalence Tests

Both paths must produce identical observable results. Write integration tests
that run two simulated miners in parallel — one TCP, one multicast — and assert:

- Both receive the same job IDs in the same order
- Both receive `clean_jobs=true` at the same cohort boundaries
- Shares submitted from either path are validated identically
- A job missed by the multicast miner triggers retransmit and is received

### Full Load Test (10,000 Miners)

Using the Month 3 load generator, run a 24-hour test at full scale:

- 10,000 concurrent connections (mix of TCP-only and multicast)
- Measure: memory over time, job delivery latency (p50/p95/p99), ghost
  connections after disconnects, stale share rate, multicast packet loss rate
- Expected: flat memory after Month 1–2 fixes, multicast latency O(1) vs TCP O(N)

**Deliverables:**
- `feat(stratum): sequence numbers and retransmit for multicast reliability`
- `feat(stratum): wire multicast broadcaster to DAG tip changes`
- `test(stratum): TCP vs multicast equivalence integration tests`
- `test(stratum): 10k miner load test with metrics report`

---

## Month 6 — Benchmarking + Optimization + Documentation

### A/B Benchmark: TCP vs Multicast

Run the load generator at 3 scales and record all metrics:

| Miners | TCP notify latency (p99) | Multicast notify latency (p99) | TCP RAM | Multicast RAM |
|--------|--------------------------|-------------------------------|---------|---------------|
| 100 | baseline | baseline | baseline | baseline |
| 1,000 | measure | measure | measure | measure |
| 10,000 | measure | measure | measure | measure |

Expected result: TCP notify time grows linearly. Multicast stays constant
regardless of miner count.

### A4 — Network Latency Measurement

v0.1 data gathering question #4: *"What is the network latency we can expect?"*

With multicast this becomes a richer measurement than with TCP alone:
- **TCP path:** time from `mining.subscribe` to first job receipt (existing A4)
- **Multicast path:** time from multicast send to first valid share submission
- **Gap:** the difference reveals whether the bottleneck is stratum or physical
  network topology

Record per-miner RTT and correlate with geographic location (if available from
operator reports). This feeds directly into the v0.1 data gathering goals.

### Optimization Pass

After the benchmark baseline is established, identify and address the top
bottlenecks in the multicast path:

- **Serialization cost:** profile `serialize_notify_packet` — if it allocates
  on the hot path, switch to a pre-serialized buffer that gets stamped with
  `ntime` and `seq` at send time
- **Socket contention:** if multiple producers race to the multicast socket,
  add a dedicated sender task with a bounded queue
- **Backpressure on the notify channel:** if the DAG tip fires faster than the
  broadcaster can send, define a drop policy (always drop old, never drop
  `clean_jobs=true`)

### Edge Case Hardening

- **MTU path discovery:** test on networks with non-standard MTU (PPPoE = 1492,
  some VPNs = 1380). If a serialized job exceeds the discovered MTU, fall back
  to TCP unicast for that miner silently.
- **IPv6 multicast:** document what changes — group address format, socket
  options, IGMP vs MLD. Implement or leave a clear TODO.
- **IGMP snooping:** on managed switches, multicast may be filtered if no
  listener reports exist. Document the IGMP leave/join interaction with the
  TCP control channel lifecycle.
- **Multicast on loopback** (for tests): `IP_MULTICAST_LOOP` socket option must
  be enabled for integration tests to work on a single machine.

### FEC Recommendation

Write a technical recommendation on FEC for roadmap v0.7:

- Compare: sequence+retransmit (Month 5) vs Reed-Solomon FEC vs LDPC
- Measure: actual packet loss rate on CPUNet testnet across geographic locations
- Recommendation: if measured loss < 0.1% on LAN, sequence+retransmit is
  sufficient for v0.1/v0.2; FEC becomes relevant for WAN and satellite-connected
  miners in v0.7

### Documentation

- `research/stratum/multicast-benchmark.md` — full benchmark results, raw data,
  methodology
- Update `docs/` with multicast architecture diagram and operator configuration
  guide (how to set up multicast routing, configure `MAX_DOWNSTREAM_CONNECTIONS`,
  tune the retransmit buffer)
- Code comments in the multicast modules explaining the nonce subdivision math
  and reliability protocol for future contributors

**Deliverables:**
- `fix(stratum): record per-miner network latency for v0.1 data gathering`
- `fix(stratum): multicast serialization optimization`
- `fix(stratum): MTU path discovery and TCP fallback`
- `research/stratum/multicast-benchmark.md`
- Recommendation report to maintainers on FEC for v0.7

---

## Full Delivery Table

| Month | Primary | Secondary | PRs |
|-------|---------|-----------|-----|
| 1 | Job map cap + DashMap | Latency instrumentation | 3 |
| 2 | Connection limit + cleanup + backpressure | Coinbase size + share counters | 4 |
| 3 | Multicast protocol design + load generator | Protocol spec doc | 1 PR + 1 doc |
| 4 | UDP broadcaster + subscribe extension + nonce subdivision | Multicast receiver for tests | 4 |
| 5 | Reliability layer + DAG integration | Equivalence tests + 10k load test | 4 |
| 6 | Benchmarks + optimization + edge cases | FEC recommendation + documentation | 4 + report |

**Total: ~20 PRs, 2 research documents, 1 recommendation report**

---

## What Success Looks Like

**End of Month 2:** All five structural issues fixed. Node runs 7 days with 100
miners, flat memory. No deadlocks under concurrent load. Ghost connections
impossible. First real numbers for v0.1 questions #1, #2, #3.

**End of Month 4:** UDP multicast broadcaster running alongside TCP. Miners can
receive jobs via UDP multicast. Pool assigns nonce space slices based on
`extranonce1`. Miners using multicast submit valid shares. Both paths produce
identical results.

**End of Month 5:** Reliability layer complete. Missed jobs trigger retransmit.
Multicast wired to DAG tip changes — sub-second job updates working. 10k load
test passes: memory under 4GB, p99 latency under 10ms, zero ghost connections.

**End of Month 6:** Full A/B benchmark delivered. At 10,000 miners, multicast
notify latency is O(1) vs TCP O(N). Memory usage with multicast is a fraction
of TCP-per-miner. Edge cases hardened. FEC recommendation delivered. Braidpool
can support 40,000+ devices without hardware scaling — groundwork for roadmap
v0.7 FEC/UDP work complete.
