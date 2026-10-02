# Stratum Module Refactor — Decisions & Trade-offs

**Branch**: `refactor/stratum-module-split`  
**Date**: 2026-10-01  
**Author**: nkatha23  
**Reviewer/pair**: Claude (claude-sonnet-4-6)

---

## Why We Did This

`node/src/stratum.rs` grew to ~4,844 lines on `dev` (plus unmerged PRs pushing it higher).
The file contained six distinct concerns all mixed together: data types, per-connection
client state, job broadcasting, TCP listener, connection tracking, and job storage.
Sansh confirmed the split was a good idea; it became a fork-only refactor while the data
structures are still in flux.

---

## What the File Looked Like Before

Single file: `node/src/stratum.rs`

| Lines (approx) | Content |
|---|---|
| 1–41 | Constants + shared imports |
| 42–250 | All data structs (`BlockTemplate`, `StratumServerConfig`, `DownstreamClient`, responses…) |
| 251–1956 | `impl DownstreamClient` — full protocol state machine (~1,706 lines) |
| 1957–2003 | `pub struct Server` + `pub enum NotifyCmd` |
| 2004–2185 | `GlobalJobStore` impl |
| 2186–3083 | `Notifier` struct + full impl |
| 3084–3400 | `PrefixStats`, `ControlMsg`, `ConnectionInfo`, `ConnectionMapping` |
| 3401–3850 | `impl Server` |
| 3851–4844 | `mod test` + `mod global_job_store_tests` |

---

## What It Looks Like After

Directory: `node/src/stratum/` (mod.rs replaces stratum.rs)

| File | Lines | Responsibility |
|---|---|---|
| `mod.rs` | 1,014 | Shared constants, module declarations, re-exports, test modules |
| `client.rs` | 1,655 | `DownstreamClient` struct + full Stratum V1 protocol impl |
| `notifier.rs` | 890 | `Notifier`, `NotifyCmd`, job broadcast loop, extranonce helpers |
| `server.rs` | 460 | `Server`, TCP listener, connection spawner, `handle_connection` |
| `connection.rs` | 303 | `ConnectionMapping`, `ConnectionInfo`, `ControlMsg`, `PrefixStats` |
| `types.rs` | 206 | Pure data types: `BlockTemplate`, `StratumServerConfig`, `JobDetails`, response enums |
| `job_store.rs` | 160 | `GlobalJobStore` — bounded LRU job cache |
| **Total** | **4,688** | (original was 4,844; shrinkage from removing dead whitespace) |

---

## Struct / Enum Decisions

### Structs

| Struct | Where it lives | Why here |
|---|---|---|
| `DownstreamClient` | `client.rs` | It IS the Stratum V1 per-connection protocol state machine |
| `GlobalJobStore` | `job_store.rs` | Pure data structure; no async I/O, no network deps |
| `ConnectionMapping` | `connection.rs` | Tracks all live TCP connections; distinct from job storage |
| `ConnectionInfo` | `connection.rs` | Created and consumed by `ConnectionMapping`, so same file |
| `PrefixStats` | `connection.rs` | Return type of `ConnectionMapping::get_prefix_stats` |
| `Notifier` | `notifier.rs` | Owns the broadcast loop; tightly coupled to `NotifyCmd` |
| `Server` | `server.rs` | TCP listener; creates `DownstreamClient` per accept |
| `BlockTemplate` | `types.rs` | Pure data, no impl logic |
| `StratumServerConfig` | `types.rs` | Config struct, no behavior |
| `JobDetails` | `types.rs` | Data bag shared between job_store and notifier |
| `JobNotification` | `types.rs` | Wire format struct, no behavior |

### Enums

| Enum | Where it lives | Why here |
|---|---|---|
| `NotifyCmd` | `notifier.rs` | Consumed exclusively by `Notifier::run_notifier` |
| `StratumResponses` | `types.rs` | Return type of `DownstreamClient` handler methods |
| `ControlMsg` | `connection.rs` | Consumed by `ConnectionMapping` / `handle_connection` in server.rs |

### Functions

| Function | Where it lives | Visibility | Why |
|---|---|---|---|
| `reverse_four_byte_chunks` | `notifier.rs` | `pub` | Used in tests + called externally; lives where it's computed |
| `_to_little_endian` | `notifier.rs` | `fn` (private) | Helper for `reverse_four_byte_chunks`, same file |
| `target_from_difficulty` | `client.rs` | `pub(super)` | Only called from within stratum module (client + tests) |
| `validate_share_against_target` | `client.rs` | `fn` (private) | Pure validation, only used inside `handle_submit` |

---

## Visibility Decisions

### Fields promoted to `pub(super)`

Fields that were implicitly in-scope before the split (single file) needed explicit
visibility grants so sibling submodules could access them.

| Field / Method | Change | Reason |
|---|---|---|
| `DownstreamClient::extranonce1` | `pub(super)` | `server.rs` sets it when constructing struct literal; `test` module checks it |
| `DownstreamClient::connection_id` | `pub(super)` | `server.rs` constructs the struct literal with this field |
| `DownstreamClient::version_rolling_mask` | `pub(super)` | Same — struct literal construction in `server.rs` |
| `DownstreamClient::version_rolling_min_bit` | `pub(super)` | Same |
| `DownstreamClient::extranonce2_len` | `pub(super)` | Same |
| `DownstreamClient::target_from_difficulty` | `pub(super)` | Called by test module in `mod.rs` |

**Rule of thumb used**: if something is only consumed within the `stratum` module (not
exported to `lib.rs`), use `pub(super)`. If it needs to cross the crate boundary, use `pub`.

### Constants

All shared constants live in `mod.rs`. They are plain `const` (private to `stratum`).
Child modules access them as `super::CONSTANT_NAME`. This works because in Rust, child
modules can reference private items of their parent.

| Constant | Value | Who uses it |
|---|---|---|
| `DISCONNECT_SIGNAL` | `"!!!_INTERNAL_..."` | `pub` — used externally in tests and connection teardown |
| `PREFIX_BYTES_SIZE` | `2` | `connection.rs`, `client.rs` |
| `COMMITMENT_SIZE` | `5` | `connection.rs`, `client.rs` |
| `DEFAULT_VERSION_ROLLING_MASK` | `0x1FFFE000` | `client.rs` (BIP 310 default) |
| `UPSTREAM_EXTRANONCE1_SIZE` | `4` | `client.rs`, test module |
| `COMMITMENT_HISTORY_SIZE` | `5` | `server.rs`, controls extranonce history depth |

---

## Import / Trait Fixes Made During Compile

These were not bugs in the original code — they worked because everything was in one scope.
The split forced explicit imports.

| Issue | File | Fix |
|---|---|---|
| `BlockHash::from_byte_array` not found | `notifier.rs`, `connection.rs`, `types.rs`, `mod.rs` tests | Add `use bitcoin::hashes::Hash as _;` (trait must be in scope) |
| `TxMerkleNode::from_byte_array` not found | `mod.rs` tests | Same trait import |
| `BlockHash::to_byte_array` not found | `connection.rs` | Same trait import |
| `BlockHash::all_zeros` not found | `types.rs` | Same trait import |
| `fill_bytes` not on `ThreadRng` | `client.rs` | Add `use rand::RngCore;` |
| `fuse()` on `Next<FramedRead<...>>` | `server.rs` | Add `use futures::FutureExt;` |
| `bitcoin::bitcoin_hashes` path wrong | `notifier.rs` | Use `bitcoin::hashes::Hash` (correct re-export path) |

The most common class of fix: **orphan trait imports**. When you call a method that comes
from a trait (`Hash::from_byte_array`, `RngCore::fill_bytes`, `FutureExt::fuse`), the trait
must be explicitly in scope. In a monolithic file you often get this for free from a broad
wildcard import at the top; in split files you have to be deliberate.

---

## Test Module Strategy

The two test modules (`mod test` and `mod global_job_store_tests`) stayed in `mod.rs`
rather than moving into their respective implementation files. Reasons:

1. `mod test` exercises *integration* between `DownstreamClient`, `Server`, `Notifier`,
   `ConnectionMapping`, and `GlobalJobStore` simultaneously — it does not belong to any
   single submodule.
2. Moving them would require making many more private items `pub(super)` or `pub(crate)`.
3. In Rust, keeping integration tests in `mod.rs` is idiomatic for this pattern.

Unit tests for individual submodules (e.g., pure `GlobalJobStore` logic) could in future
move into those files. The `global_job_store_tests` module is a candidate for this.

---

## What the Split Enables

- **Grep and navigation**: finding all share-submission logic means opening one file
  (`client.rs`), not searching through 4,800 lines.
- **Parallel review**: a security reviewer can audit `server.rs` and `connection.rs`
  (network boundary) while someone else reviews `client.rs` (protocol correctness).
- **Targeted compile caches**: touching `types.rs` only rebuilds files that import it.
  Touching `client.rs` does not re-check `job_store.rs`.
- **Smaller diffs**: a PR that only touches job eviction logic changes `job_store.rs`;
  the diff is self-contained and easy to review.
- **Onboarding**: a new contributor can read `types.rs` (206 lines) to understand all
  the data shapes, then pick one submodule to go deeper.

---

## What the Split Costs

- **More files to open**: understanding a single request path (subscribe → authorize →
  submit) now requires tracing across `client.rs`, `server.rs`, `connection.rs`, and
  `notifier.rs`.
- **Visibility boilerplate**: fields that were implicitly accessible in one file now need
  `pub(super)` annotations, which adds noise and exposes internal state slightly more
  broadly within the crate.
- **`use super::*` gotcha**: `use super::*` only imports `pub` items, not private ones.
  The test modules needed explicit imports added for everything that was previously in
  shared file scope. Easy to miss, and the compiler errors are not always obvious.
- **Premature if data structures are still changing**: if `DownstreamClient` grows new
  fields or merges with another struct, you may need to touch three files instead of one.
  This is the reason we are keeping this on a personal fork branch rather than opening a PR
  against main right now.

---

## Opinion: More Files, Less Lines — or Vice Versa?

**Short answer**: more files with focused responsibility is better for a project of
Braidpool's scale and ambition, but only once the module's shape has stabilised.

**The case for splitting (what we did)**:
- A 4,800-line file already has a cognitive overhead tax on every reader and every reviewer.
  Bitcoin Core's equivalent file (`net_processing.cpp`) is ~7,000 lines and is widely
  considered one of the hardest files in the codebase to review safely.
- Rust's module system makes splits low-cost: `pub(super)` and re-exports in `mod.rs`
  preserve the public API exactly. External callers do not need to change at all.
- The boundaries we drew correspond to real conceptual differences: *what a miner is*
  (`client.rs`) vs *how jobs are stored* (`job_store.rs`) vs *how jobs are broadcast*
  (`notifier.rs`). That is not an arbitrary split — it follows the data flow.

**The case against (or: when NOT to split)**:
- If the structs are changing — fields being added, merged, or renamed — a split means
  every change touches more files and more `pub(super)` decisions. This is where we are
  right now with SV2 integration work coming.
- If the "modules" only make sense together and one can never be used without the other,
  the split is cosmetic and adds indirection for no gain.
- Very small files (under ~150 lines) that exist purely because of an ideological split
  add navigation overhead without adding clarity.

**The practical rule**:
Split when a *new reader* would benefit from being able to ignore whole files.
Keep together when everything in the file is tightly coupled and needs to be read
as a unit to understand any one part of it.

`stratum.rs` had crossed the line. `client.rs` at 1,655 lines is still large but it
is a coherent unit — the full Stratum V1 state machine for one miner connection. That
is the right granularity for now.
