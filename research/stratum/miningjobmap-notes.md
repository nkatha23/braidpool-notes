# MiningJobMap — Working Notes

PR: [#484](https://github.com/braidpool/braidpool/pull/484)  
Files changed: `node/src/lib.rs` (+5), `node/src/stratum.rs` (+54 / -9)

---

## What is a HashMap?

A `HashMap<K, V>` is a data structure that stores key-value pairs and lets you
look up a value by its key in constant time — O(1) — regardless of how many
entries are in the map.

Internally it works by running the key through a hash function to get a bucket
index, then storing the value in that bucket. Looking up a key hashes it again
and goes straight to the right bucket.

```
key "abc" → hash → bucket 7 → value
key "xyz" → hash → bucket 3 → value
```

The tradeoff: a `HashMap` uses more memory than a plain list, and it never
shrinks automatically. If you keep inserting without removing, it grows forever.

---

## What is MiningJobMap?

`MiningJobMap` is the data structure that tracks active mining jobs for one
downstream miner connection. Every time a new block template arrives (from a new
Bitcoin block, or a new DAG tip), a new entry is added.

It has two `HashMap`s that mirror each other:

```rust
pub struct MiningJobMap {
    mining_jobs: HashMap<TemplateId, JobDetails>,      // template_id → full job
    job_id_to_template: HashMap<u64, TemplateId>,      // numeric_id → template_id
    next_job_id: u64,                                  // counter, always increasing
    capacity: usize,                                   // NEW: max entries to keep
}
```

### Why two maps?

- **`mining_jobs`** — the actual job data, keyed by `TemplateId` (a hash of the
  block template). This is what the server looks up when a miner submits a share.
- **`job_id_to_template`** — a reverse index from the numeric job ID (a simple
  counter) to the `TemplateId`. The stratum protocol sends miners a short numeric
  ID (`mining.notify`). When the miner submits a share, they send back that
  numeric ID. The server needs to map it back to the full `TemplateId` to find
  the job.

So the lookup path for a share submission is:

```
miner sends: job_id = 42
  → job_id_to_template.get(42) → TemplateId("abc123...")
  → mining_jobs.get("abc123...") → JobDetails { blocktemplate, coinbase1, ... }
```

### What does JobDetails hold?

```rust
pub struct JobDetails {
    pub blocktemplate: BlockTemplate,         // full Bitcoin block template
    pub coinbase1: String,                    // coinbase prefix (hex)
    pub coinbase2: String,                    // coinbase suffix (hex)
    pub coinbase_merkle_path: Vec<String>,    // merkle siblings (hex)
    pub coinbase_witness_commitment: Option<Witness>,
    pub job_sent_time: u32,                   // unix timestamp
}
```

`BlockTemplate` itself contains `Vec<Transaction>` — the full transaction list
for the block. See size note below.

---

## The Problem Before This PR

There was no eviction. `next_job_id` incremented forever. Both `HashMap`s grew
without bound. Old jobs were never removed.

At Bitcoin block rate (~1 per 10 minutes): 144 entries/day per miner — slow but
survivable.

At bead rate: much worse (see source note below). The node would OOM-crash
within hours of connecting real miners.

---

## How Big is Each Entry?

This is where the original roadmap estimate of ~2KB was wrong.

`BlockTemplate` contains `Vec<Transaction>` (the full list of transactions to
include in the block). Looking at the actual struct:

```rust
pub struct BlockTemplate {
    pub transactions: Vec<Transaction>,   // ← this is large
    pub target: bitcoin::Target,
    pub bits: bitcoin::CompactTarget,
    pub height: bitcoin::absolute::Height,
    // ... other fields
}
```

In production:
- A typical Bitcoin block has 2,000–3,000 transactions
- A simple P2WPKH transaction is ~250 bytes
- A 2,000-transaction block template ≈ 500KB

So `~2KB per JobDetails` in the roadmap was very conservative. The real number
per entry is closer to **100KB–500KB** depending on how full the mempool is.

This makes the OOM risk much worse than the original estimate. Even at low
job rates, a large mempool means each entry is huge.

**Revised math:**
```
10,000 miners × 10 jobs cached × 500KB per job = 50GB at full mempool
```
The cap matters even more than originally thought.

---

## The Fix

### New constant in `lib.rs` (line 28–31)

```rust
/// Maximum number of mining jobs retained per downstream miner connection.
/// Oldest jobs are evicted on insert once this limit is reached.
/// Miners only need the current job and a few recent ones for late share submission.
pub const MAX_JOBS_PER_MINER: usize = 10;
```

Placed next to `MAX_CACHED_TEMPLATES = 90` which does the same thing for the
Bitcoin template cache — same pattern, same reasoning.

Why 10? A miner only needs the current job and a handful of recent ones in case
a share arrives slightly late due to network delay. 10 is generous. Old jobs are
stale — miners aren't supposed to be working on them.

### New field in `MiningJobMap` (stratum.rs line 1190)

```rust
pub struct MiningJobMap {
    mining_jobs: HashMap<TemplateId, JobDetails>,
    job_id_to_template: HashMap<u64, TemplateId>,
    next_job_id: u64,
    capacity: usize,    // NEW
}
```

### Updated constructor `MiningJobMap::new` (line 1193)

```rust
// Before
pub fn new() -> Self {

// After
pub fn new(capacity: usize) -> Self {
    Self {
        mining_jobs: HashMap::new(),
        job_id_to_template: HashMap::new(),
        next_job_id: 0,
        capacity,
    }
}
```

### Eviction logic in `insert_mining_job` (lines 1211–1217)

```rust
// Evict the oldest job when at capacity. next_job_id is monotonically
// increasing so the oldest surviving job id is always (next_job_id - capacity).
if self.job_id_to_template.len() >= self.capacity {
    if let Some(oldest_id) = self.next_job_id.checked_sub(self.capacity as u64) {
        if let Some((_, old_template)) = self.job_id_to_template.remove_entry(&oldest_id) {
            self.mining_jobs.remove(&old_template);
        }
    }
}
```

**Key insight:** because `next_job_id` only ever increases, you always know
exactly which ID is the oldest still in the map. No scanning needed — it's a
direct key lookup on both maps. O(1) eviction.

The `checked_sub` prevents underflow when fewer than `capacity` jobs have been
inserted yet (e.g. the very first job, `0 - 10` would panic without it).

### Test-only helper `len` (lines 1257–1261)

```rust
#[cfg(test)]
pub fn len(&self) -> usize {
    self.job_id_to_template.len()
}
```

Gated behind `#[cfg(test)]` so it's not compiled into production binaries. Used
by the eviction test to assert map size.

### Call sites updated

**Production** (`run_stratum_service`, line 1854):
```rust
// Before
let self_mining_map = Arc::new(Mutex::new(MiningJobMap::new()));

// After
let self_mining_map = Arc::new(Mutex::new(MiningJobMap::new(crate::MAX_JOBS_PER_MINER)));
```

**Test helper** (line 2456):
```rust
// Before
Arc::new(Mutex::new(MiningJobMap::new()))

// After
Arc::new(Mutex::new(MiningJobMap::new(crate::MAX_JOBS_PER_MINER)))
```

### New test `test_mining_job_map_eviction` (lines 2617–2649)

```rust
#[tokio::test]
async fn test_mining_job_map_eviction() {
    let capacity = 3;
    let mut map = MiningJobMap::new(capacity);

    let make_job = || JobDetails { ... };  // minimal JobDetails

    // Insert capacity+2 jobs — oldest two should be evicted
    for i in 0..5u64 {
        let template_id = TemplateId::from(i as u32);
        map.insert_mining_job(template_id, make_job()).await;
    }

    // Only `capacity` jobs should remain
    assert_eq!(map.len(), capacity);

    // Oldest jobs (id 0 and 1) must be gone
    assert!(map.get_by_job_id(0).await.is_err());
    assert!(map.get_by_job_id(1).await.is_err());

    // Most recent jobs (id 2, 3, 4) must still be present
    assert!(map.get_by_job_id(2).await.is_ok());
    assert!(map.get_by_job_id(3).await.is_ok());
    assert!(map.get_by_job_id(4).await.is_ok());
}
```

The test uses `capacity = 3` and inserts 5 jobs. It then asserts that jobs 0
and 1 are gone and jobs 2, 3, 4 remain. This directly tests the eviction logic.

---

## The `debug!` vs `warn!` Question

Self-review comment on the eviction log line:

```rust
debug!(evicted_job_id = %oldest_id, "Evicted oldest job from MiningJobMap");
```

**`debug!` is correct.** Eviction is expected, normal behavior — every insert
past capacity triggers one eviction. Logging it at `warn!` would flood logs in
normal operation.

If you want to detect when capacity is *too low*, the right approach is a
separate metric: count evictions per second and warn if the rate exceeds a
threshold. That's a future addition, not something to do here.

---

## Source of the Bead Rate Claim (150ms–1000ms)

The 150ms–1000ms figure comes from `docs/roadmap.md` line 31, not from code:

```
grep -n "150" ~/braidpool/docs/roadmap.md
31: Braidpool beads will come in with a mean time between 150ms-1000ms,
    and we need to stop whatever the mining device is doing...
```

The mathematical derivation behind it is in `braid_consensus.md` — the cohort
time formula:

```
T_C = 1/(λx) + a · e^(a·λx)
```

where `a` ≈ 40ms (minimum global network latency at speed of light) and `λx`
is determined by the difficulty adjustment targeting `N_B/N_C = 2.42`. At the
optimal point with realistic hashrate and `a = 40ms`, `T_C` works out to the
150ms–1000ms range.

**The 150ms–1000ms is a design target from the spec, not a measured value.**
There are no real miners yet. The actual bead rate at v0.1 will be measured for
the first time when real hardware connects.

This also means the "576,000 jobs/day per miner" figure in the PR description
is a worst-case bound (1 job per 150ms = 6.67/second × 86,400 = 576,000),
not an observed rate.

### How to verify it when real miners connect

Once v0.1 is running, the bead rate can be measured directly from the DAG:
- Count beads per cohort over a time window T
- Compute `T_C = T / N_C`
- Compare to the 150ms–1000ms target

The job delivery latency instrumentation (planned as a companion to this PR)
will also surface how fast jobs actually arrive at the stratum layer.

---

## Resolved Questions

### What is an evicted job?

When a miner connects, the pool assigns them a sequence of jobs — job 0, job 1,
job 2... Each job corresponds to a block template the miner should be hashing.
When the capacity cap is hit, job 0 gets evicted to make room for job 10. The
miner's hardware may still be working on job 0 (it takes time to exhaust the
nonce space), but the pool has already moved on. If the miner finds a valid hash
for job 0 and tries to submit it, the pool looks up job 0 in `MiningJobMap` —
but it's gone. That's an evicted job share submission.

### Should `MAX_JOBS_PER_MINER = 10` be runtime-configurable?

10 is probably fine for LAN miners (low latency, fast job turnover) but a WAN
miner with 500ms RTT might legitimately be working on older jobs. However, making
it runtime-configurable adds complexity to `config.toml` before we even know
what value is right. The v0.1 goal is data gathering — once we have real latency
measurements from real miners (A4 in the roadmap), we'll know the right value.
For now a compile-time constant is correct.

**Decision:** keep as compile-time constant. Add a comment that it should be
tuned after v0.1 data.

### Should evicted job submissions increment `shares_stale`?

Yes. A share submitted for an evicted job is semantically stale — the miner did
valid proof-of-work but on a job the pool no longer considers active. The
distinction from `shares_invalid` matters:

- `shares_invalid` — wrong difficulty, bad extranonce, malformed share
- `shares_stale` — valid PoW on a job the pool has moved past (either evicted
  or superseded by a newer block)

A `MiningJobNotFound` error on submit should map to `shares_stale`, not a
generic error. Tracked for the share accounting PR (planned Month 2).

**Questions for review club:**

> **Q1 — `MAX_JOBS_PER_MINER` configurability** (`lib.rs` line 31)
>
> ```rust
> pub const MAX_JOBS_PER_MINER: usize = 10;
> ```
>
> This is currently a compile-time constant. A LAN miner with sub-10ms RTT will
> never need more than a few cached jobs. A WAN miner with 300–500ms RTT might
> legitimately still be working on an older job when it's evicted. Should this
> be exposed in `config.toml` so operators can tune it per deployment? Or is
> keeping it constant correct until v0.1 latency data tells us what the right
> value actually is?

> **Q2 — Evicted job share submission: `shares_stale` or distinct error?**
> (`stratum.rs` — `mining.submit` handler, share accounting planned for Month 2)
>
> If a miner submits a share for a job that has been evicted from `MiningJobMap`,
> the lookup in `job_id_to_template` returns `None` — `MiningJobNotFound`. Should
> this be counted as `shares_stale` (valid proof-of-work on a job the pool no
> longer holds) rather than `shares_invalid` (bad difficulty, bad extranonce,
> malformed)? The distinction matters when diagnosing whether a miner is slow or
> broken: a rising `stale` rate means the miner is falling behind the job rate;
> a rising `invalid` rate means something is wrong with the miner's hashing.

### PR description size claim

The original `~2KB per entry` estimate was wrong — `BlockTemplate` contains
`Vec<Transaction>` which is much larger. PR description corrected. Actual size
is 100KB–500KB per entry depending on mempool fullness.

---

## Why PR #484 Was Closed — mcelrath's Review Finding

mcelrath identified a correctness bug in the eviction logic: eviction deleted
by `template_id`, not by `job_id`. The resend path (when a new miner connects
and gets the current template) inserts the same `template_id` a second time
under a new `job_id`. When the older `job_id` is evicted, the code did:

```rust
self.mining_jobs.remove(&old_template);  // deletes by template_id
```

This silently deleted the template entry, making the newer `job_id` (still
pointing at that `template_id`) return `MiningJobNotFound` on submit — a valid
share rejected.

This couldn't be fixed cleanly within the per-miner architecture. The correct
fix required rethinking the storage structure entirely, which led to PR #492.

---

## New Approach — `GlobalJobStore` (PR #492)

### Core idea

Replace all per-miner `MiningJobMap`s with a single `GlobalJobStore` shared
across every connection. `JobDetails` is wrapped in `Arc` so all miners point
at one allocation. The notify loop inserts once and fans out pointer copies —
zero template clones.

```rust
pub struct GlobalJobStore {
    jobs: HashMap<TemplateId, Arc<JobDetails>>,
    job_id_to_template: HashMap<u64, TemplateId>,
    next_job_id: u64,
    capacity: usize,
}
```

### How each problem from PR #484 is solved

**Memory (5 GB → 500 KB at 10k miners)**

Old notify loop:
```rust
for (peer, map) in job_map_arc.iter() {
    let template_for_job = template.clone(); // 500 KB × 10k = 5 GB
    map.insert_mining_job(template_id, job_details).await;
}
```

New notify loop:
```rust
let job_details = Arc::new(JobDetails { ... }); // one allocation
let job_id = global_job_store.lock().await.insert(template_id, Arc::clone(&job_details));
for sender in &downstream_senders {
    sender.send(job_id).await;  // pointer copy, no clone
}
```

**Correctness bug (mcelrath's finding)**

Eviction now removes by `job_id` slot, only freeing the template when no other
`job_id` still references it:

```rust
if let Some(old_template_id) = self.job_id_to_template.remove(&oldest_id) {
    let still_referenced = self.job_id_to_template.values().any(|&tid| tid == old_template_id);
    if !still_referenced {
        self.jobs.remove(&old_template_id);
    }
}
```

Two `job_id`s sharing a `template_id` (resend path) no longer clobber each
other on eviction.

**`entry().or_insert()` — no duplicate Arc on resend**

When a new miner triggers a resend of the current template, `insert()` uses
`entry().or_insert_with()` to return the existing `Arc` without a second
allocation:

```rust
let arc = self.jobs
    .entry(template_id)
    .or_insert_with(|| Arc::new(job))
    .clone();
```

**Churn eviction bug — `latest_job_id_for()`**

With capacity=5, six rapid reconnects would mint new `job_id`s and evict the
one that already-connected miners are submitting against. The resend path now
calls `latest_job_id_for(template_id)` to reuse the existing `job_id` rather
than minting a new one:

```rust
pub fn latest_job_id_for(&self, template_id: TemplateId) -> Option<u64> {
    self.job_id_to_template
        .iter()
        .filter(|(_, &tid)| tid == template_id)
        .map(|(&id, _)| id)
        .max()
}
```

A new `job_id` is only minted when a brand-new template arrives via the notify
loop, or in the cold path where the resend fires before any miner has ever
connected (so no existing `job_id` exists yet).

**Combined `get()` — single lookup instead of double**

Old submit path did two separate map traversals:
```rust
let template_id = map.template_id_from_job_id(job_id)?;  // traversal 1
let job = map.get_by_job_id(job_id)?;                    // traversal 2
```

New `get()` returns both in one shot:
```rust
pub fn get(&self, job_id: u64) -> Result<(Arc<JobDetails>, TemplateId), StratumErrors> {
    let &template_id = self.job_id_to_template.get(&job_id)
        .ok_or(StratumErrors::MiningJobNotFound { ... })?;
    let job = self.jobs.get(&template_id)
        .ok_or(StratumErrors::MiningJobNotFound { ... })?;
    Ok((Arc::clone(job), template_id))
}
```

### Capacity change: 10 → 5

The old `MAX_JOBS_PER_MINER = 10` was per-miner. The new
`GLOBAL_JOB_STORE_CAPACITY = 5` is global. Because `next_job_id` is now the
only source for new `job_id`s (resend reuses existing ones), 5 slots covers
~750 ms of bead-rate templates — enough for in-flight shares from any connected
miner with reasonable latency.

### Unit tests added (6)

| Test | What it checks |
|---|---|
| `eviction_at_capacity` | oldest slot removed when full |
| `still_referenced_template_survives_eviction` | template not freed while another job_id points to it |
| `arc_reuse_on_duplicate_template_id` | `entry().or_insert()` returns same Arc |
| `evicted_id_returns_not_found` | `get()` errors on evicted id |
| `latest_job_id_for_returns_max_id` | returns highest job_id for a template |
| `latest_job_id_for_absent_after_eviction` | returns None once all job_ids for template are evicted |
