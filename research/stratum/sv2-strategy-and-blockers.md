# SV2 Strategy, Stratum Architecture, and Remaining Blockers

Written 2026-09-30 based on Zaid/mstrr discussion and current codebase state.
Covers: which SV2 repo to use, mixed SV1/SV2 miners, stratum.rs size, transaction
selection, TCP/IP work, and remaining blockers before that work starts.

---

## 1. Which SV2 repo — `sv2-apps` or `stratum`?

Two repos exist:
- `stratum-mining/sv2-apps` — high-level application binaries (pool, translator, miner)
- `stratum-mining/stratum` — low-level SV2 protocol library (roles_logic_sv2, codec, noise)

**The concern**: `sv2-apps` is unstable — SRI is actively changing it and we'd need
constant upstream merges into `braidpool/sv2-apps` fork.

**The decision** (from sv2-integration.md): We use **`stratum-mining/stratum`** (the core library)
directly, not `sv2-apps`. Specifically:
- `roles_logic_sv2` — SV2 protocol state machines
- `noise_sv2` — Noise NX handshake for pool authentication
- `codec_sv2` — frame encoding

`sv2-apps` is used as **reference architecture** only — we read it to understand how
SRI wires things, but we don't depend on it. The braidpool-specific pool and translator
binaries live in `braidpool/sv2-apps` fork, which we maintain.

**Why this helps with upstream instability**: The low-level `stratum` library is more
stable than the application layer. When SRI changes `sv2-apps`, we don't need to merge —
we only need to update if the core protocol library changes its API, which happens less often.

**How to add the dependency** (when PR 4 lands):
```toml
# In node/Cargo.toml or pool/Cargo.toml
roles_logic_sv2 = { git = "https://github.com/stratum-mining/stratum", package = "roles_logic_sv2" }
noise_sv2       = { git = "https://github.com/stratum-mining/stratum", package = "noise_sv2" }
```
Or pin to a specific tag once SRI stabilizes versioning:
```toml
roles_logic_sv2 = { version = "1.0.0", registry = "crates-sv2" }
```

---

## 2. Mixed SV1 and SV2 miners — how it works

Braidpool supports both simultaneously. They connect to different endpoints:

```
                    ┌─────────────────────────────────────┐
SV1 miner ─────────▶  stratum.rs  (SV1 TCP, port 3333)   │
                    │  Notifier loop → mining.notify       │
                    │  handle_submit → validate → bead     │
                    └─────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
SV2 miner ─────────▶  translator binary (port 3334)       │
(native SV2)        │  SV2 Extended Channel                │
                    │  ValidatedShare → share bridge       │
                    │        ↓                             │
                    │  propagate_valid_bead                │
                    └─────────────────────────────────────┘
```

The translator binary handles SV1↔SV2 translation. A miner using SV1 can connect
to port 3333 directly. A miner with native SV2 hardware connects to the translator
on port 3334 (or directly to the pool on 34254 if it speaks Extended Channel).

Both paths converge at `propagate_valid_bead` in `SwarmHandler` — bead formation
is the same regardless of which protocol the share arrived on.

`NotifyCmd` is broadcast to both consumers: the SV1 `Notifier` loop and the SV2
template provider. Both get new block templates simultaneously.

---

## 3. Can miners use SV2 Job Declaration?

**No.** And this is intentional.

Job Declaration Protocol (JDP) lets miners select their own transactions. In Bitcoin
pools this matters for censorship resistance — miners can override the pool's mempool.

In Braidpool, transaction selection is **not the miner's concern**:
- Bitcoin Core selects transactions via `getblocktemplate` (fee-maximizing BFS)
- Braidpool's `ipc_template_consumer` receives this template over IPC
- `template_creator.rs` adds the OP_RETURN commitment coinbase
- The complete template flows to miners as `mining.notify`
- Miners find the nonce — they don't touch the transaction list

JDP would require miners to propose a transaction list, which Braidpool would then
need to validate and commit to in the bead. This is a fundamentally different
architecture (and what SV2's `bitcoin-core-sv2` / Template Distribution Protocol is for).

Braidpool explicitly does NOT use TDP or JDP — IPC replaces both.

---

## 4. Transaction selection in Braidpool — in detail

```
Bitcoin Core mempool
       │
       │  Cap'n Proto IPC (Unix socket)
       ▼
ipc/client.rs: get_block_template_components()
       │
       │  Returns: coinbase_transaction, prev_hash, nbits, version,
       │           height, transactions (Vec<Transaction>)
       ▼
ipc.rs: ipc_template_consumer loop
       │  Checks: MIN_TRANSACTION_COUNT (sanity gate)
       │
       ▼
template_creator.rs: build_block_template()
       │  1. Takes Bitcoin Core's transaction list as-is
       │  2. Builds Braidpool coinbase:
       │     Output 0: full block reward to pool payout address
       │     Output 1: SegWit commitment (OP_RETURN + witness merkle root)
       │     Output 2: Braidpool OP_RETURN (bead hash commitment)
       │  3. Computes merkle root over all transactions
       │  4. Serializes complete block into processed_block_hex
       │
       ▼
BlockTemplate { processed_block_hex, transactions, ... }
       │
       │  NotifyCmd::SendToAll
       ▼
stratum.rs: Notifier loop → mining.notify → miners
```

**Key point**: Braidpool does NOT do its own transaction selection. Bitcoin Core does
it via fee-maximizing BFS in `getblocktemplate`. Braidpool adds its commitments on
top and passes the transaction list through unchanged.

This is why JDP is irrelevant — there's nothing for miners to declare; the list is
already finalized by the time it reaches stratum.

**Future**: Lazy transaction fetch (roadmap Phase 2) — store only `wtxids` in the
template, fetch full transactions from Bitcoin Core only when a miner finds a full
Bitcoin-difficulty block. Reduces memory at scale. See `ipc-get-transactions.md`.

---

## 5. stratum.rs is 4000 lines — should we split it?

**Yes, eventually. Not a blocker for current PRs.**

Current structure — everything in one file:
- `StratumServerConfig`, `GlobalJobStore`, `Notifier`
- `DownstreamClient` (handles all SV1 protocol: authorize, subscribe, notify, submit)
- `handle_submit` (~300 lines alone)
- `ConnectionMapping`, `BlockTemplate`, `JobDetails`
- All tests (~1500 lines)

**Natural split** (future refactor):
```
node/src/stratum/
    mod.rs          — re-exports, top-level types
    config.rs       — StratumServerConfig, PoolNetwork wiring
    job_store.rs    — GlobalJobStore, JobDetails
    notifier.rs     — Notifier, NotifyCmd
    client.rs       — DownstreamClient, all handle_* methods
    connection.rs   — ConnectionMapping
    tests/          — test modules
```

**PR #561 does NOT touch stratum.rs** — correct. It only adds `BraidpoolTemplate`
to `braidpool-common` and wires `ipc_template_consumer` to optionally emit it. The
SV2 pool runs as a separate process communicating via channel, so stratum.rs stays
unchanged for SV2 integration. The split is additive, not a replacement.

---

## 6. The drain task comment in PR #561

From the PR description:
> "The receiver is held by a drain task for now and will be replaced once the
> sv2-apps dependency is added."

What this means:

When `--sv2-pool-port` is set, `ipc_template_consumer` builds a `BraidpoolTemplate`
and sends it on `braidpool_template_tx`. The receiver of that channel needs to exist
or the send blocks/panics.

Until the actual SV2 pool is wired in (PR 4 → sv2-apps), a drain task consumes
and discards the templates so the channel doesn't fill up:

```rust
// temporary — replaced when sv2-apps pool is wired
tokio::spawn(async move {
    while let Some(_template) = braidpool_template_rx.recv().await {}
});
```

This is a standard placeholder pattern — keeps the channel alive and non-blocking
without implementing the real consumer yet.

---

## 7. Remaining blockers before TCP/IP transport work

Zaid confirmed: resolve stratum layer first, then TCP/IP. Here's what's remaining:

### Open stratum PRs (must merge first)
| PR | Title | Status |
|----|-------|--------|
| #492 | GlobalJobStore | Open — needs rebase |
| #503 | Per-miner share counters | Open |
| #531 | Worker name / payout address parsing | Open — rfind issue |
| #543 | Notify latency instrumentation | Open |
| #561 | BraidpoolTemplate / SV2 node wiring | Open |

### Major unimplemented features
| Feature | Status | Notes |
|---------|--------|-------|
| Difficulty adjustment | Not implemented | Sansh has rough impl on fork (Sansh2356/braidpool#28) — needs review |
| ECDSA payout signing | Not implemented | Sansh fork has rough impl — needs review |
| SV2 pool (sv2-apps PR #1, #2) | Open | Template provider + share bridge |
| Braidpool node SV2 wiring (PR 4) | Open — `feat/sv2-pool-wiring` | Drain task placeholder |
| Translator binary (PR 5) | Not started | Depends on PR 4 |

### TCP/IP transport work — what it involves

mstrr asked if you're doing the TCP/IP work. From the roadmap this means replacing
libp2p's QUIC transport with TCP/IP for peer connections. Current state:

- All peer connections use libp2p with QUIC (`/ip4/.../udp/.../quic-v1`)
- `--addnode` flag takes multiaddr format (confirmed in PR #554 review)
- TCP transport would use `/ip4/.../tcp/...` multiaddrs instead

**What overlaps with stratum work**: The notify path (#543) touches how templates
propagate to miners. TCP transport touches how beads propagate to peers. These
are different layers (stratum=miner-facing, libp2p=peer-facing) so they don't
directly conflict. But stabilizing the notify path first is sensible because
latency characteristics change with transport, and you want the instrumentation
(#543) in place before measuring the improvement.

**Suggested sequence before starting TCP/IP work**:
1. Merge #492, #503, #531, #543 (stratum stability)
2. Merge PR #561 + sv2-apps PRs 1 and 2 (SV2 foundation)
3. Review Sansh's difficulty adjustment impl
4. Then start TCP/IP transport changes

---

## 8. Sansh's difficulty adjustment and ECDSA payout — what to check

Repo: `Sansh2356/braidpool` PR #28

Before using his implementation, verify:
1. **Difficulty formula**: Does it match the braidpool spec? The spec defines
   difficulty adjustment based on bead rate, not block rate.
2. **Adjustment frequency**: Per-bead? Per-cohort? Per N beads?
3. **ECDSA signing**: Which key signs? The pool authority key from Noise handshake?
   Or a per-miner key? This connects to the placeholder key issue (audit finding #10).
4. **Payout output format**: Does it match `template_creator.rs` Output 0 structure?

When you review it, check against `docs/braidpool_spec.md` section on difficulty
and the UHPO payout mechanism.
