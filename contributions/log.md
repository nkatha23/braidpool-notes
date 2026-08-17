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

### [PR #525](https://github.com/braidpool/braidpool/pull/525) — fix(stratum): parse ntime and nonce before coinbase reconstruction
Moved both `u32::from_str_radix` blocks to immediately after the audit-mode
early return, before job lookup and coinbase work. Fixed extranonce2 error
message field (`extranonce2_len` → `miner_extranonce2_size`). Two tests:
`non_hex_ntime_returns_err_before_coinbase_work` (distinguishes old vs new
error ordering) and `unpadded_nonce_not_rejected_by_length_check` (pins the
no-strict-width-check policy). Tests use `MiningJobMap` — no dependency on
#492. Merged by zaidmstrr.

## Open PRs

### [PR #503](https://github.com/braidpool/braidpool/pull/503) — feat(stratum): add per-miner share counters (accepted/stale/invalid)
`ShareCounters { accepted, stale, invalid }` struct on `DownstreamClient`.
Counters bumped at every exit point of `handle_submit`: `invalid` at auth gate,
malformed params, job-not-found (stale), PoW failure; `accepted` after all
miner-input validation passes (before `propagate_valid_bead`); `stale` at job
eviction sites. Logged on miner disconnect. Five unit tests cover each counter
path independently (unauthorized submit uses valid-looking params so the only
failure path is the auth gate). Rebased on dev post-#509 merge; resolved 6
merge conflicts.

### [PR #508](https://github.com/braidpool/braidpool/pull/508) — fix(tests): eliminate shared SQLite state causing parallel test races
Added `DBHandler::new_in_memory()` — an in-memory constructor for tests with
`max_connections(1)` (required: `sqlite::memory:` gives each connection its own
private DB) and `Executor::execute(SCHEMA)` (handles multi-statement SQL).
Updated `test_batch_insertion_beads` to use it directly. Applied Sansh DRY
feedback (removed `test_db_initializer()` helper). Applied Copilot feedback
(`max_connections(1)` and `db_connection_pool.execute(SCHEMA)`).

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

| Priority | Item | Blocker | Notes |
|----------|------|---------|-------|
| Next | `getminer` RPC (#298) | #503 and #492 merge | Needs `ShareCounters` (Braidpool path) + `AuditDAG.get_stats` (audit path) |
| Next | #492 rebase | — | #509 merged; needs rebase onto dev (audit mode added `TemplateId`, `is_upstream_job`, new `handle_submit` params) |
| Month 1 | `MiningJobMap` capacity cap | — | [scalability-roadmap.md](../research/stratum/scalability-roadmap.md#month-1) |
| Month 2 | `ConnectionGuard` drop pattern | — | [scalability-roadmap.md](../research/stratum/scalability-roadmap.md#month-2) |
| Month 3 | `DashMap` migration | — | [scalability-roadmap.md](../research/stratum/scalability-roadmap.md#month-3) |
| Follow-up | Refactor `or_insert_with` in `fetch_beads_in_batch` | — | follow-up to #475 |
