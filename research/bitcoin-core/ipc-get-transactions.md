# Bitcoin Core #34020 — getTransactions(ByWitnessID) IPC Methods

**PR:** https://github.com/bitcoin/bitcoin/pull/34020

## What it adds

Two new IPC methods on the `Mining` interface (Cap'n Proto):

- `getTransactionsById(txids: List(Data)) -> List(Data)` — fetch by `Txid`
- `getTransactionsByWitnessID(wtxids: List(Data)) -> List(Data)` — fetch by `Wtxid`

Both return serialized transactions. An **empty element** is returned for any txid/wtxid not found in the mempool. Clients must treat empty = not found. This is a Cap'n Proto limitation: inside a list, null and empty Data are indistinguishable on the wire.

Does **not** support `-txindex` historical lookup — mempool/recent state only. Fine for Braidpool's use case (recent template transactions, not arbitrary history).

## Why IPC instead of RPC

- Binary serialization (Cap'n Proto) vs JSON — faster
- No HTTP overhead
- Batch: 2,000 transactions in one round trip instead of 2,000 RPC calls
- Braidpool already uses this exact socket for `getBlockTemplate` and `submitSolution`

## Current Braidpool IPC state

From reading the codebase:

| File | Purpose |
|------|---------|
| `node/src/ipc.rs` | Block listener, template fetching, block submission |
| `node/src/ipc/client.rs` | `SharedBitcoinClient` — async priority-queue wrapper over Cap'n Proto |
| `node/schema/mining.capnp` | Mining interface schema |
| `node/schema/init.capnp` | Init interface (includes `makeMining()`) |

Currently implemented in `ipc/client.rs`:
- `get_block_template()` / `get_block_template_components()`
- `get_mining_tip_info()`
- `is_initial_block_download()`
- `check_block()`
- `submit_solution()`
- `remove_transaction()` / `remove_multiple_transactions()`

**Not implemented:** `getTransactionsById` / `getTransactionsByWitnessID` — these are new in #34020.

## Relevance to Braidpool

### 1. Phase 2 lazy transaction fetch (roadmap)

`JobDetails.blocktemplate.transactions: Vec<Transaction>` stores all transactions in every job. That's the design today — full template copied into every job at broadcast time.

The Phase 2 plan: store `None` for transactions, fetch lazily only when a miner finds a full Bitcoin difficulty block. Current fallback: check `template_cache` (capacity 90), error out with `TemplateEvicted` if the template was evicted.

`getTransactionsByWitnessID` is a **cleaner fallback** than `template_cache`:
- `template_cache` can evict templates, especially as Braidpool grows
- Instead of `TemplateEvicted`, `ipc/client.rs` calls `getTransactionsByWitnessID` with the wtxids from `BlockTemplate.transactions` (which we still have — just not the full `Transaction` objects)
- Bitcoin Core returns the full serialized transactions directly
- Assemble block, call `submit_solution`

This eliminates the eviction failure mode entirely for the full-block-found path.

### 2. Version dependency

This IPC method is only available in Bitcoin Core built from master post-2026-07-08. The next release after this merge is v32. Braidpool needs to document the minimum required Core version once this ships in a release. For CPUNet testing (controlled environment), fine immediately. For production, gate on v32+.

### 3. SV2 Job Declaration (future)

When Braidpool eventually supports SV2's Job Declarator Server role (issue #313), the JDS receives a wtxid list from the miner and must fetch/validate those transactions. `getTransactionsByWitnessID` is exactly the Bitcoin Core side of that handshake.

### What #35671 (TxCollection) is NOT

Sjors opened #35671 concurrently — explicitly for SV2 JDS dropping its mempool mirror. That's a different problem: JDS validating an externally-declared template where the pool doesn't assemble the block. Braidpool IS the template source via `ipc_template_consumer`, miners don't declare their own jobs. #35671 is also still actively accumulating design review (correctness gaps in duplicate wtxid handling, weight-vs-size limits, mutex scope). Not something to depend on.

## Implementation sketch (when ready)

Three steps, none urgent until Phase 2 lazy fetch is prioritized:

**Step 1 — Update capnp schema** (`node/schema/mining.capnp`)
Add to the `Mining` interface:
```capnp
getTransactionsByWitnessId @N (wtxids :List(Data)) -> (transactions :List(Data));
```

**Step 2 — Add client method** (`node/src/ipc/client.rs`)
Mirror the pattern of `get_block_template_components()`:
```rust
pub async fn get_transactions_by_witness_id(
    &self,
    wtxids: Vec<Wtxid>,
) -> Result<Vec<Option<Transaction>>, IpcError>
```
Returns `None` for empty-element slots (not-found txs).

**Step 3 — Use in handle_submit** (`node/src/stratum.rs`)
When a miner finds a full Bitcoin difficulty block, instead of reading from `JobDetails.blocktemplate.transactions`, call `get_transactions_by_witness_id()` with the wtxids. Assemble block, call `submit_solution`.

## Cap'n Proto null/empty quirk

The empty-element convention for not-found transactions is a deliberate workaround for a Cap'n Proto limitation: `List(Data)` cannot distinguish null from empty on the wire. Documented and accepted by reviewers. If Cap'n Proto fixes this in a future version, the wire format changes (empty → null) but client code change is trivial.

## Rust type definitions

The `2140-dev/bitcoin-capnp-types` repo already has Rust type definitions for these new methods. Braidpool's `Cargo.toml` would need to pull a version of that crate that includes #34020 support.
