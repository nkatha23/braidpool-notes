# Braidpool Stratum Layer — Scalability & Production Readiness Roadmap

**Contributor:** [Nkatha Kaburu](https://github.com/nkatha23)  
**Duration:** 6 months  
**Target:** Stratum V1 ready for 10,000+ concurrent miners (v0.1 data gathering phase)

---

## Problem Statement

The current Stratum V1 implementation works correctly for small numbers of miners
but has five structural issues that will cause crashes, deadlocks, and memory
exhaustion at production scale. They are observable in the code today and will
manifest as soon as real miners start connecting.

---

## Issue 1 — Unbounded Job History (OOM)

**Location:** `stratum.rs` lines 1186–1248

`MiningJobMap` stores every job ever created with no eviction:

```rust
mining_jobs: HashMap<TemplateId, JobDetails>,     // grows forever
job_id_to_template: HashMap<u64, TemplateId>,     // grows forever
next_job_id: u64,                                  // increments forever
```

With a new job every ~30 seconds and 10,000 miners each having their own map,
memory usage becomes:

```
10,000 miners × 2,880 jobs/day × ~2KB = ~57GB RAM/day
```

The node crashes within hours of production launch.

**Fix:** Add `capacity: usize` to `MiningJobMap` and evict oldest entry on insert.
Since job IDs are monotonically increasing, the oldest surviving ID is always
`current_id - capacity`:

```rust
if self.job_id_to_template.len() >= self.capacity {
    if let Some(oldest_id) = numeric_job_id.checked_sub(self.capacity as u64) {
        if let Some((_, old_template)) = self.job_id_to_template.remove(&oldest_id) {
            self.mining_jobs.remove(&old_template);
        }
    }
}
```

---

## Issue 2 — Nested Mutex Deadlock Risk

**Location:** `stratum.rs` line 1258, lines 476–478

The global job map has two layers of locks:

```rust
Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>
```

To read a job, code must:
1. Lock the outer `Mutex<HashMap>`
2. Clone the inner `Arc<Mutex<MiningJobMap>>`
3. Lock the inner `Mutex<MiningJobMap>`

If two async tasks acquire these in different orders, or if either holds a lock
across an `.await` point, the tokio runtime deadlocks or experiences severe
latency spikes. At 10,000 concurrent miners submitting shares simultaneously,
this becomes near-certain.

**Fix:** Replace both layers with `DashMap` which uses internal sharding — no
external mutex needed:

```rust
// Before
Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>

// After
Arc<DashMap<String, Arc<MiningJobMap>>>
```

Inside `MiningJobMap`, replace `HashMap` with `DashMap` and `next_job_id: u64`
with `AtomicU64`:

```rust
pub struct MiningJobMap {
    mining_jobs: DashMap<TemplateId, JobDetails>,
    job_id_to_template: DashMap<u64, TemplateId>,
    next_job_id: AtomicU64,
    capacity: usize,
}
```

This eliminates all async lock acquisition on the job lookup path — share
submission becomes fully concurrent.

---

## Issue 3 — No Connection Limit

**Location:** `stratum.rs` lines 1840–1860

Every TCP connection is accepted unconditionally:

```rust
loop {
    event = listener.accept() => {
        // no limit check — accepts forever
        tokio::spawn(...)
    }
}
```

At 10,000+ miners, combined with the unbounded job maps, this exhausts both
memory and file descriptors.

**Fix:** Add `MAX_DOWNSTREAM_CONNECTIONS` check before accepting:

```rust
const MAX_DOWNSTREAM_CONNECTIONS: usize = 10_000;

if downstream_connection_mapping.read().await
    .downstream_channel_mapping.len() >= MAX_DOWNSTREAM_CONNECTIONS {
    warn!("Connection limit reached, rejecting new connection");
    continue;
}
```

---

## Issue 4 — Cleanup Not Guaranteed on Panic

**Location:** `stratum.rs` lines 1876–1895

Cleanup only runs if `handle_connection` returns normally:

```rust
tokio::spawn(async move {
    let _ = Self::handle_connection(...).await;
    // if handle_connection panics, this never runs:
    connection_mapping.remove(&peer_addr);
    mining_job_map.remove(&peer_addr);
});
```

Any `.unwrap()` panic inside `handle_connection` leaves ghost entries in both
maps — connections that appear active but aren't, holding memory indefinitely.

**Fix:** Implement a `ConnectionGuard` that uses Rust's `Drop` trait to guarantee
cleanup regardless of how the connection ends:

```rust
struct ConnectionGuard {
    peer_addr: String,
    connection_mapping: Arc<RwLock<ConnectionMapping>>,
    mining_job_map: Arc<DashMap<String, Arc<MiningJobMap>>>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        // runs on normal return, panic, or cancellation
        // spawn cleanup task since drop is sync
    }
}
```

---

## Issue 5 — Slow Miner Backpressure

**Location:** `stratum.rs` line 1857

Each miner has a fixed 1024-message channel buffer. When full, job notifications
are silently dropped — the miner continues mining stale work without knowing:

```rust
let (downstream_tx, mut downstream_rx) = mpsc::channel(1024);
```

**Fix:** Add explicit handling when `send` fails due to full buffer — log the
slow miner and either skip the notification (with `clean_jobs=true` on the next
send) or disconnect after N consecutive failures.

---

## 6-Month Delivery Plan

| Month | Issue | Deliverable | PR title |
|-------|-------|-------------|----------|
| 1 | Issue 1 | `MiningJobMap` capacity + eviction | `fix(stratum): cap job history per miner` |
| 2 | Issue 4 | `ConnectionGuard` drop pattern | `fix(stratum): guarantee cleanup on disconnect` |
| 3 | Issue 2 | `DashMap` migration for job maps | `refactor(stratum): replace nested mutex with DashMap` |
| 4 | Issue 3 | Connection limit + metric logging | `fix(stratum): add MAX_DOWNSTREAM_CONNECTIONS` |
| 5 | Issue 5 | Slow miner backpressure handling | `fix(stratum): handle full downstream channel` |
| 6 | Load testing | Simulate 10k miners, document findings | `test(stratum): 10k miner load test results` |

---

## What Success Looks Like

**End of Month 1:** A Braidpool node running continuously for 7 days with 100
miners connected shows flat memory usage. `MiningJobMap` entries per miner stay
at or below the configured capacity. No OOM crashes.

**End of Month 2:** Abnormal miner disconnects (`kill -9`, network drop, panic)
leave zero ghost entries in `ConnectionMapping` or the job map. Verified by a
test that simulates panic mid-connection.

**End of Month 3:** Share submission (`mining.submit`) under concurrent load
shows no lock wait time spikes. `DashMap` benchmarks show >10x throughput
improvement over `Mutex<HashMap>` at 1,000+ concurrent submitters.

**End of Month 4:** Node gracefully rejects connections beyond
`MAX_DOWNSTREAM_CONNECTIONS` with a clear log message. No file descriptor
exhaustion. Memory usage stays bounded even during connection storms.

**End of Month 5:** Slow miners with full buffers are detected and handled
explicitly. No silent stale job delivery. Metrics show buffer utilization per
miner.

**End of Month 6:** A load test with 10,000 simulated miners running for 24
hours shows:
- Memory usage stays under 4GB (fits on an 8GB machine)
- No deadlocks or panics
- Share submission latency under 10ms at p99
- Zero ghost connections after any disconnect pattern

At this point the Stratum V1 layer is production-ready for Braidpool v0.1 data
gathering with real mining hardware.

---

## Context

This roadmap grew out of a conversation with @zaidmstrr (braidpool maintainer).
