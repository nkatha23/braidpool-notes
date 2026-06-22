# Contribution Log

## Merged PRs

### PR #472 — fix(stratum): derive extranonce1 from atomic connection_id counter
Closes issue #461. Replaced RNG-based extranonce1 with `AtomicU32` counter
so each miner gets a unique nonce partition. Added test asserting uniqueness.

### PR #477 — fix(tests): replace hardcoded stratum ports with OS-assigned port 0
Fixed `AddrInUse` test failures documented across PRs #309 and #474.
Added oneshot channel to `run_stratum_service` for tests to discover bound port.

### PR #475 — feat: extend extranonce1 and extranonce2 to 8 bytes each
Extends both extranonce fields from `u32` to `u64`. Propagates through
stratum, uncommitted metadata, consensus encoding, DB layer, test utilities.

## Open PRs

### PR #479 — refactor(stratum): move TcpListener binding to caller
`run_stratum_service` accepts a ready `TcpListener`. Caller binds the socket.
Removes oneshot channel from PR #477. Consistent with `rpc_server.rs` pattern.

## PRs Reviewed

- **#466** — WebSocket push notifications (ACK)
- **#473** — Docker setup (tested locally, found health check issue)
- **#474** — `extend()` returns adopted orphan beads (ACK, tested locally)

## Planned Work

| Priority | Item | Roadmap ref |
|----------|------|-------------|
| Month 1 | `MiningJobMap` capacity cap | [scalability-roadmap.md](../research/stratum/scalability-roadmap.md#month-1) |
| Month 2 | `ConnectionGuard` drop pattern | [scalability-roadmap.md](../research/stratum/scalability-roadmap.md#month-2) |
| Month 3 | `DashMap` migration | [scalability-roadmap.md](../research/stratum/scalability-roadmap.md#month-3) |
| Follow-up | Refactor `or_insert_with` in `fetch_beads_in_batch` | follow-up to #475 |
