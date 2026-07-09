# Contribution Log

## Merged PRs

### [PR #472](https://github.com/braidpool/braidpool/pull/472) — fix(stratum): derive extranonce1 from atomic connection_id counter
Closes issue #461. Replaced RNG-based extranonce1 with `AtomicU32` counter
so each miner gets a unique nonce partition. Added test asserting uniqueness.

### [PR #477](https://github.com/braidpool/braidpool/pull/477) — fix(tests): replace hardcoded stratum ports with OS-assigned port 0
Fixed `AddrInUse` test failures documented across PRs #309 and #474.
Added oneshot channel to `run_stratum_service` for tests to discover bound port.

### [PR #475](https://github.com/braidpool/braidpool/pull/475) — feat: extend extranonce1 and extranonce2 to 8 bytes each
Extends both extranonce fields from `u32` to `u64`. Propagates through
stratum, uncommitted metadata, consensus encoding, DB layer, test utilities.

### [PR #479](https://github.com/braidpool/braidpool/pull/479) — refactor(stratum): move TcpListener binding to caller
`run_stratum_service` accepts a ready `TcpListener`. Caller binds the socket.
Removes `port` field from `StratumServerConfig` (no longer used inside the
server). Removes oneshot channel from PR #477 — tests call `local_addr()`
directly before spawning. Consistent with `rpc_server.rs` pattern.
Reviewed by Zaid (Code ACK c4e89d2), merged by Zaid into dev.

## Open PRs

### [PR #492](https://github.com/braidpool/braidpool/pull/492) — refactor(stratum): replace per-miner MiningJobMap with GlobalJobStore
Replaces all per-miner `MiningJobMap`s with a single `GlobalJobStore` shared
across all connections via `Arc<Mutex<GlobalJobStore>>`. `JobDetails` is
`Arc`-wrapped — one allocation shared by all miners, zero template clones on
notify. `insert()` uses `entry().or_insert()` to reuse existing `Arc` for
duplicate `template_id`s. `latest_job_id_for()` prevents churn eviction by
reusing existing `job_id` on miner reconnect. Combined `get()` replaces double
lookup. `GLOBAL_JOB_STORE_CAPACITY = 5` (~750 ms retention at bead rate).
6 new unit tests. Memory: ~5 GB → ~500 KB at 10k connections.
Supersedes closed PR #484.

## Closed / Superseded PRs

### [PR #484](https://github.com/braidpool/braidpool/pull/484) — fix(stratum): cap MiningJobMap per miner (closed, superseded by #492)
Added `capacity: usize` to `MiningJobMap` with monotonic-ID eviction. Closed
after mcelrath review identified that evicting by `template_id` silently
invalidated other `job_id`s pointing at the same template. The correct fix
required replacing the per-miner architecture entirely (→ PR #492).
Notes: [miningjobmap-notes.md](../research/stratum/miningjobmap-notes.md)

## PRs Reviewed

- [**#466**](https://github.com/braidpool/braidpool/pull/466) — WebSocket push notifications (ACK)
- [**#473**](https://github.com/braidpool/braidpool/pull/473) — Docker setup (tested locally, found health check issue)
- [**#474**](https://github.com/braidpool/braidpool/pull/474) — `extend()` returns adopted orphan beads (ACK, tested locally)

## Planned Work

| Priority | Item | Roadmap ref |
|----------|------|-------------|
| Month 1 | `MiningJobMap` capacity cap | [scalability-roadmap.md](../research/stratum/scalability-roadmap.md#month-1) |
| Month 2 | `ConnectionGuard` drop pattern | [scalability-roadmap.md](../research/stratum/scalability-roadmap.md#month-2) |
| Month 3 | `DashMap` migration | [scalability-roadmap.md](../research/stratum/scalability-roadmap.md#month-3) |
| Follow-up | Refactor `or_insert_with` in `fetch_beads_in_batch` | follow-up to #475 |
