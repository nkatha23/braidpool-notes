# Stratum Layer — Protocol Requirements Analysis

Extracted from: Block-Settled EDCA paper (Mohd Zaid), Braidpool version roadmap,
`general_considerations.md`, `braid_consensus.md`. Cross-referenced against
current stratum code (PRs #472, #475, #477, #479 and the 6-month roadmap).

---

## A. New Items Implied by v0.1 Data Gathering Goals

### A1. Job Delivery Latency Instrumentation

**What it is:** The v0.1 phase needs to measure how long a job takes to travel
from template creation to miner receipt. There is no timing instrumentation in
the current code path.

**Why it matters to stratum:** Job delivery latency is the primary metric for
evaluating whether the stratum layer is fast enough for bead times of 150ms–1s.
Without measurements, v0.1 data gathering produces no actionable numbers.

**Touches:** `stratum.rs` — the `notify` path where `mining.notify` messages are
assembled and written to the downstream channel. Needs a `tokio::time::Instant`
recorded at template arrival and again at channel send, with the delta logged per
miner.

### A2. Coinbase Size Limit Enforcement

**What it is:** The roadmap notes that coinbase size limits must be measured from
real hardware. The committed metadata (parent bead hashes, UHPO commitment,
payout pubkey) grows with every new feature. No current guard prevents the
coinbase from exceeding the 100kB Bitcoin consensus limit in pathological cases.

**Why it matters to stratum:** Stratum constructs the coinbase template and
communicates `coinbase1`/`coinbase2` to miners. If committed metadata pushes the
coinbase over the limit, miners will submit beads that are consensus-invalid.

**Touches:** `stratum.rs` — coinbase construction block; needs a size assertion
before issuing `mining.notify`.

### A3. Miner Error Rate Tracking

**What it is:** The v0.1 goals require measuring the rate of rejected shares per
miner — stale jobs, low-difficulty submissions, invalid extranonce reuse.

**Why it matters to stratum:** Error rates are the leading indicator of Issue 5
(slow miner backpressure): a miner working on stale jobs will show high stale
share rates. This data is needed before the backpressure fix can be tuned.

**Touches:** `stratum.rs` — `mining.submit` handler; `lib.rs` — share validation
path. Counters needed: `shares_accepted`, `shares_stale`, `shares_invalid` per
connection.

### A4. Network Latency vs. Bead Time Correlation

**What it is:** v0.1 data gathering needs to correlate per-miner round-trip
latency (TCP) against the bead time window (150ms–1000ms). Miners with RTT > Tc
will structurally produce stale beads regardless of software quality.

**Why it matters to stratum:** This determines whether stratum-level latency
fixes (Issues 1–5) are the bottleneck or whether network topology is the
bottleneck. The measurement point is in stratum.

**Touches:** `stratum.rs` connection accept loop (lines ~1840–1860); record
connection timestamp and first `mining.subscribe` response time per peer addr.

---

## B. EDCA Protocol Requirements That Need Stratum Changes

### B1. Fee Amplifier F_i in Committed Metadata

**What it is:** EDCA computes payout weight using a Fee Amplifier term that
depends on transaction fees in the block template the miner worked on. This
must be committed into the coinbase so the DAG can verify the calculation
deterministically.

**Why it matters to stratum:** Stratum selects (or proxies) the block template
and constructs the coinbase. Adding F_i means stratum must pass the fee total
from the template source to the coinbase builder. If stratum ever substitutes
or modifies the transaction set, F_i becomes wrong and EDCA payouts are invalid.

**Touches:** `stratum.rs` — coinbase construction; `lib.rs` — template ingestion
from the Bitcoin node. New field needed in `JobDetails` struct.

### B2. Uniform Pool Difficulty D_bp vs. Vardiff

**What it is:** The EDCA Raw Score formula requires a single pool-wide difficulty
D_bp. The current code has a vardiff TODO in `lib.rs`. Vardiff — assigning
different difficulties to different miners — is incompatible with a uniform Raw
Score unless score normalization is added.

**Why it matters to stratum:** If vardiff is activated without score
normalization, high-hashrate miners get artificially inflated scores. The
`suggest_difficulty_done` and `channel_configured` conditions are already
commented out in `mining.configure` — activating them without the EDCA
normalization layer would silently break payouts.

**Touches:** `lib.rs` — vardiff TODO; `stratum.rs` — `mining.configure` handler
(commented-out conditions). Must stay disabled or be paired with score
normalization before enabling.

### B3. Parent Bead References in Job Metadata

**What it is:** Each bead must include hashes of the parent beads it has seen
(the DAG tip set) in its committed metadata. This is what creates the DAG
structure. The stratum job must carry the current tip set so miners can include
it in the coinbase.

**Why it matters to stratum:** Currently jobs reference a Bitcoin block template.
They need to be extended to also carry the current DAG tip hashes. This is a new
field in `mining.notify` or a Braidpool-specific extension message.

**Touches:** `stratum.rs` — `mining.notify` message construction; `JobDetails`
struct; requires a live view of the bead DAG tips from `node/src/braid/mod.rs`.

---

## C. Braid Consensus Requirements That Need Stratum Changes

### C1. Sub-Second Job Update Rate

**What it is:** Bead time Tc = 1/(λx) + a·e^(aλx) targets 150ms–1000ms. The
stratum layer must push new jobs to miners at this cadence when the DAG tip set
changes, not just when a new Bitcoin block arrives.

**Why it matters to stratum:** The current job update trigger is a new Bitcoin
block template (every ~10 minutes). For beads at 150ms intervals, stratum needs
a second trigger: new DAG tip detected → new job issued. The 1024-message channel
buffer (Issue 5) and the slow miner backpressure problem become critical at this
rate.

**Touches:** `stratum.rs` — job broadcast loop; the `MiningJobMap` capacity from
Issue 1 must be sized for bead-rate jobs (not just block-rate jobs).

### C2. Per-Bead Variable Difficulty

**What it is:** `braid_consensus.md` specifies per-bead difficulty adjustment so
the DAG maintains NB/NC ≈ 2.42. Each bead's target difficulty is computed from
the DAG's recent history, not from Bitcoin's 2-week window.

**Why it matters to stratum:** Stratum must communicate bead difficulty (separate
from Bitcoin difficulty) to miners. The `mining.set_difficulty` message needs to
carry the pool-bead difficulty, updated per new cohort. This is distinct from and
does not replace vardiff.

**Touches:** `stratum.rs` — `set_difficulty` send path; needs a bead-difficulty
source from the consensus layer.

### C3. `clean_jobs` Timing Tied to Cohort Cuts

**What it is:** In standard stratum, `clean_jobs=true` means "abandon all
previous jobs, they're stale." In Braidpool, a graph cut (cohort boundary) is
the natural moment to set `clean_jobs=true` — all prior beads are now finalized.

**Why it matters to stratum:** If `clean_jobs=true` is sent too early (before a
cut) or too late (many cohorts later), miners waste time on jobs that are either
orphaned or already settled. The Issue 5 fix (slow miner handling on full buffer)
already notes that the next send should use `clean_jobs=true` — this needs to
be coordinated with cohort boundaries.

**Touches:** `stratum.rs` — `mining.notify` `clean_jobs` flag; requires a signal
from `node/src/braid/mod.rs` when a graph cut is confirmed.

---

## D. Longer-Term / Post v0.1 Items

### D1. Stratum V2 Proxy Compatibility

**What it is:** Stratum V2 uses binary framing and noise protocol encryption.
Existing large farms will proxy SV2 → SV1. Braidpool's SV1 layer must handle
proxied connections where `mining.subscribe` arrives with proxy-injected
extranonce1 values rather than the AtomicU32 counter from PR #472.

**Why it matters to stratum:** The extranonce1 uniqueness guarantee (PR #472)
breaks if a proxy assigns its own extranonce1 and the pool accepts it without
collision detection. A proxy-awareness mode is needed.

**Touches:** `stratum.rs` — `mining.subscribe` handler; extranonce1 assignment
logic.

### D2. Transaction Selection Handoff

**What it is:** `general_considerations.md` notes that in the full protocol,
miners (not the pool) select transactions. Stratum V2's `SetCustomMiningJob`
message is designed for this. The current implementation has the pool doing
template selection and passing it down.

**Why it matters to stratum:** The Fee Amplifier F_i (item B1) depends on which
transactions are in the block. If transaction selection moves to miners, stratum
must accept and validate miner-proposed templates rather than issuing them.

**Touches:** `stratum.rs` — template ingestion; `lib.rs` — job construction.
This is a near-complete redesign of the job flow and belongs post-v0.1.

### D3. Sub-Pool Coordination

**What it is:** Braidpool's architecture allows sub-pools that batch miners
behind a single identity. Each sub-pool would run its own stratum layer and
appear as one large miner to the main pool.

**Why it matters to stratum:** The connection limit (Issue 3, `MAX_DOWNSTREAM_CONNECTIONS`)
and the extranonce1 space (64-bit after PR #475) must be designed with sub-pool
aggregation in mind — a sub-pool does not exhaust one extranonce1 slot per
end-miner.

**Touches:** `stratum.rs` — connection accept loop; extranonce1 assignment
(PR #472 mechanism).
