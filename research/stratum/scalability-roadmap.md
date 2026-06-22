# Braidpool Stratum Layer — Complete 6-Month Roadmap

**Contributor:** [Nkatha Kaburu](https://github.com/nkatha23)  
**Duration:** 6 months  
**Target:** Stratum V1 production-ready + multicast research for 10,000–40,000 miners

---

## Problem Statement

The current Stratum V1 implementation works correctly for small numbers of miners
but has five structural issues that cause memory exhaustion, deadlocks, and silent
failures at scale. Beyond these fixes, Bob McElrath has identified a deeper
architectural limitation: TCP per-miner doesn't scale to 40,000 devices. This
roadmap covers both the immediate fixes and the research needed to transition
toward UDP multicast job delivery.

---

## Part 1 — Stratum V1 Scalability Fixes (Months 1–5)

### Issue 1 — Unbounded Job History (OOM)

**Location:** `stratum.rs` lines 1186–1248

`MiningJobMap` stores every job ever created with no eviction:

```rust
mining_jobs: HashMap<TemplateId, JobDetails>,    // grows forever
job_id_to_template: HashMap<u64, TemplateId>,    // grows forever
next_job_id: u64,                                 // increments forever
```

At bead-rate job updates (150ms–1000ms per bead per `braid_consensus.md`)
instead of block-rate (10 minutes), the growth is catastrophic:

```
10,000 miners × 8,640 bead-rate jobs/day × ~2KB = ~172GB RAM/day
```

**Fix:** Add `capacity: usize` to `MiningJobMap`. Since job IDs are monotonically
increasing, the oldest surviving ID is always `current_id - capacity`:

```rust
if self.job_id_to_template.len() >= self.capacity {
    if let Some(oldest_id) = numeric_job_id.checked_sub(self.capacity as u64) {
        if let Some((_, old_template)) = self.job_id_to_template.remove(&oldest_id) {
            self.mining_jobs.remove(&old_template);
        }
    }
}
```

Note: `MAX_CACHED_TEMPLATES = 90` already exists in `lib.rs` for the Bitcoin
template cache — the job map needs the same treatment.

**PR:** `fix(stratum): cap MiningJobMap history with capacity-based eviction`

---

### Issue 2 — Nested Mutex Deadlock Risk

**Location:** `stratum.rs` line 1258, lines 476–478

The global job map has two layers of async locks:

```rust
Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>
```

Reading a job requires: lock outer → clone inner Arc → lock inner. If two async
tasks acquire these in different orders, or hold either lock across an `.await`
point, tokio deadlocks or spikes in latency. At 10,000 concurrent `mining.submit`
calls this becomes near-certain.

**Fix:** Replace both layers with `DashMap` (internal sharding, no external mutex)
and `AtomicU64` for the job counter:

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

**PR:** `refactor(stratum): replace nested mutex with DashMap + AtomicU64`

---

### Issue 3 — No Connection Limit

**Location:** `stratum.rs` lines 1840–1860

Every TCP connection is accepted unconditionally. At 40,000 miners, combined
with unbounded job maps, this exhausts both RAM and file descriptors. Bob's
analysis: *"opening that much TCP connections will need hundreds of GBs of RAM."*

**Fix:**

```rust
const MAX_DOWNSTREAM_CONNECTIONS: usize = 10_000;

if downstream_connection_mapping.read().await
    .downstream_channel_mapping.len() >= MAX_DOWNSTREAM_CONNECTIONS {
    warn!("Connection limit reached, rejecting new connection");
    continue;
}
```

Log a metric when approaching 80% of the limit so operators can plan ahead.

**PR:** `fix(stratum): add MAX_DOWNSTREAM_CONNECTIONS with metric logging`

---

### Issue 4 — Cleanup Not Guaranteed on Panic

**Location:** `stratum.rs` lines 1876–1895

Cleanup only runs if `handle_connection` returns normally. Any `.unwrap()` panic
leaves ghost entries in both `ConnectionMapping` and the job map:

```rust
tokio::spawn(async move {
    let _ = Self::handle_connection(...).await;
    // never runs on panic:
    connection_mapping.remove(&peer_addr);
    mining_job_map.remove(&peer_addr);
});
```

**Fix:** `ConnectionGuard` using Rust's `Drop` trait:

```rust
struct ConnectionGuard {
    peer_addr: String,
    connection_mapping: Arc<RwLock<ConnectionMapping>>,
    mining_job_map: Arc<DashMap<String, Arc<MiningJobMap>>>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        // runs on normal return, panic, AND cancellation
    }
}
```

**PR:** `fix(stratum): guarantee miner cleanup on disconnect via ConnectionGuard`

---

### Issue 5 — Slow Miner Backpressure

**Location:** `stratum.rs` line 1857

Each miner has a 1024-message channel buffer. When full, job notifications are
silently dropped — the miner mines stale work without knowing. At bead-rate job
updates (C1 below), this buffer fills in seconds for a high-latency miner.

The `clean_jobs` flag in `mining.notify` (line 1165) is the right mechanism —
when a notification is skipped due to a full buffer, the next send must use
`clean_jobs=true`. This also needs coordination with cohort boundaries (C3).

**Fix:** Detect full buffer, log the slow miner, set `clean_jobs=true` on next
send, disconnect after N consecutive failures.

**PR:** `fix(stratum): handle full downstream channel with clean_jobs coordination`

---

## Part 2 — Protocol Completeness for v0.1 (Months 3–5, parallel)

### A1. Job Delivery Latency Instrumentation

No timing exists on the notify path today. v0.1 data gathering requires knowing
how long a job takes from template creation to miner receipt — this is the primary
metric for evaluating whether stratum is fast enough for 150ms bead times.

**Fix:** Add `tokio::time::Instant` at template arrival and at channel send, log
delta per miner.  
**Touches:** `stratum.rs` notify path (lines ~1418–1540).

### A2. Coinbase Size Limit Enforcement

`template_creator.rs` has `MAX_OP_RETURN_DATA = 80` and `MAX_COINBASE_SCRIPT_SIG = 100`
but no guard against the full coinbase exceeding Bitcoin's 100kB consensus limit
as committed metadata grows. A coinbase over the limit produces consensus-invalid
beads silently.

**Fix:** Add size assertion in coinbase construction before issuing `mining.notify`.  
**Touches:** `template_creator.rs` lines ~500–515; `stratum.rs` notify path.

### A3. Per-Miner Share Accounting

No counters exist for `shares_accepted`, `shares_stale`, `shares_invalid` per
connection. This data is required for v0.1 data gathering AND is the prerequisite
for tuning the Issue 5 backpressure fix.

**Fix:** Add per-connection counters to `DownstreamClient`, log on disconnect and
periodically.  
**Touches:** `stratum.rs` `mining.submit` handler; `lib.rs` share validation path.

### B2. Vardiff Must Stay Disabled Until EDCA Score Normalization Exists

`suggest_difficulty_done` and `channel_configured` are commented out in
`mining.configure`. This is correct — EDCA requires a single pool-wide difficulty
`D_bp`. Enabling vardiff without score normalization gives high-hashrate miners
artificially inflated EDCA scores. Document this constraint clearly in code
comments and the spec.  
**Touches:** `stratum.rs` `mining.configure` handler; `lib.rs` vardiff TODO.

### C1. Sub-Second Job Update Rate

Current job trigger: new Bitcoin block template (~10 minutes). Bead time
`Tc = 1/(λx) + a·e^(aλx)` targets 150ms–1000ms. Stratum needs a second trigger:
new DAG tip detected → new job issued.

The `MiningJobMap` capacity from Issue 1 must be sized for bead-rate jobs (not
block-rate). At 1 bead/second with 10,000 miners, the notify path must handle
10,000 channel sends per second.  
**Touches:** `stratum.rs` job broadcast loop; `lib.rs` template ingestion path.

### C3. `clean_jobs` Tied to Cohort Cuts

`clean_jobs=true` in `mining.notify` should fire at graph cuts (cohort boundaries)
— when all prior beads are finalized. Currently it fires only on new Bitcoin
blocks. Early `clean_jobs` wastes valid bead work; late `clean_jobs` causes miners
to build on settled cohorts.  
**Touches:** `stratum.rs` `mining.notify` construction; requires a signal from
`node/src/braid/mod.rs` on graph cut confirmation.

---

## Part 3 — Multicast Research (Month 6)

### The TCP Scaling Wall

Bob McElrath's analysis:

> *"It's really bad design to have each mining device have a TCP connection to the
> server. With 40k mining devices the server has to round-robin push work units as
> fast as it can — multicast would be so much better. One UDP multicast from the
> server, and individual devices know how to further sub-divide the nonce range."*

Current TCP approach at 40k miners:
- 40,000 TCP connections = hundreds of GBs RAM (even before job map issues)
- Round-robin notify: if each `mining.notify` takes 1μs, notifying 40k miners
  takes 40ms — already 27% of a 150ms bead window
- Any miner on a slow network blocks the notify loop for miners behind it

UDP multicast approach:
- Pool sends **one** UDP multicast packet to a multicast group
- All miners receive it simultaneously — O(1) cost regardless of miner count
- Each miner uses its `extranonce1` (PR #472, PR #475) to subdivide the nonce
  space independently — no per-miner coordination needed

### Research Tasks for Month 6

**1. Nonce space subdivision protocol**  
Define how a miner derives its search space from `extranonce1`. With 8-byte
`extranonce1` (PR #475), 2^64 unique partitions are available. Each miner gets a
deterministic slice based on its assigned `extranonce1`.

**2. Multicast group management**  
How do miners join/leave the multicast group? How does the pool know who is
listening? Likely a TCP control channel for `subscribe`/`authorize` + UDP for
job delivery only.

**3. Share submission path**  
UDP multicast is one-way (pool → miners). Share submission (miner → pool) stays
TCP or uses UDP unicast with acknowledgment.

**4. Reliability layer**  
UDP has no delivery guarantee. Missed job notifications mean miners work on stale
beads. Options: FEC (Forward Error Correction), sequence numbers with retransmit,
or accept occasional stale beads as acceptable loss at low packet-loss rates.

**5. Prototype**  
Implement a simple UDP multicast job broadcaster alongside the existing TCP path.
Measure: notification latency, packet loss rate, miner coverage. Compare against
TCP round-robin at 100 / 1,000 / 10,000 simulated miners.

**PR:** `research(stratum): UDP multicast job delivery prototype and benchmark`

---

## 6-Month Delivery Plan

| Month | Work | Deliverable |
|-------|------|-------------|
| 1 | Issue 1 — Job map cap | `fix(stratum): cap MiningJobMap history` |
| 2 | Issue 4 — Cleanup guarantee | `fix(stratum): ConnectionGuard drop pattern` |
| 3 | Issue 2 — DashMap + A1 latency | `refactor(stratum): DashMap migration` + `fix(stratum): job delivery latency instrumentation` |
| 4 | Issue 3 + A2 + A3 | Connection limit + coinbase size guard + share counters |
| 5 | Issue 5 + C1 + C3 | Backpressure + bead-rate jobs + clean_jobs cohort coordination |
| 6 | Multicast research | UDP multicast prototype + benchmark vs TCP at 10k miners |

---

## What Success Looks Like

**End of Month 1:** Node runs 7 days with 100 miners, flat memory. `MiningJobMap`
entries per miner stay at capacity. No OOM.

**End of Month 2:** Abnormal disconnects leave zero ghost entries. Verified by a
panic simulation test.

**End of Month 3:** `mining.submit` under concurrent load shows no lock wait
spikes. `DashMap` benchmark shows >10x throughput over `Mutex<HashMap>` at 1,000+
concurrent submitters. Job delivery latency logged per miner.

**End of Month 4:** Node rejects connections beyond limit with a clear log.
Coinbase size violations caught before `mining.notify`. Per-miner share error
rates visible in logs.

**End of Month 5:** Bead-rate job updates working. Slow miners detected and
handled. `clean_jobs` fires at cohort boundaries. 10,000 simulated miners run for
24 hours: memory under 4GB, latency under 10ms p99, zero ghost connections.

**End of Month 6:** UDP multicast prototype benchmarked. Report delivered to
maintainers with recommendation on whether to proceed with full multicast
transition for v0.2. If viable: notification latency drops from O(N miners) to
O(1), enabling 40,000+ device support without hardware scaling.

---


