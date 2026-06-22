# Other Contribution Areas — Beyond Stratum

The stratum layer is the current focus, but Braidpool has open work across
several other subsystems. This note maps those areas, what's needed, and how
they connect to the stratum work already underway.

Sources: [roadmap.md](https://github.com/braidpool/braidpool/blob/dev/docs/roadmap.md),
[general_considerations.md](https://github.com/braidpool/braidpool/blob/dev/docs/general_considerations.md),
[braid_consensus.md](https://github.com/braidpool/braidpool/blob/dev/docs/braid_consensus.md)

---

## 1. Braid Consensus Implementation

**What it is:** The core DAG engine — finding graph cuts, computing cohorts,
running the difficulty adjustment formula.

**Current state:** Partially implemented in `node/src/braid/mod.rs`. The
difficulty adjustment formula (Lambert W, critical damping) exists in the spec
but needs verification against the mathematical derivation.

**Open work:**
- Verify the difficulty adjustment implementation against `braid_consensus.md`
  equations (Eq. 7–11). The critical damping factor `e^(-π·a/T)` is subtle.
- Implement the edge-case handling: blockchain-like DAG (NC = NB), thick DAG
  (NPC > 4 → exponential difficulty falloff).
- Observer timestamps: `median_bead_time` computation from 3 ancestor cohort
  observations per bead.
- Bead reward logic: which beads within a large cohort get rewards? (marked FIXME
  in the spec — unresolved).

**Connection to stratum:** The C1 (sub-second job updates) and C3 (`clean_jobs`
cohort coordination) items in the stratum roadmap require signals from
`braid/mod.rs`. Work here unblocks Month 5 stratum work.

---

## 2. EDCA Payout Implementation

**What it is:** Computing miner payout percentages from the DAG using the EDCA
equations (Equations 1–4 in the paper).

**Current state:** The algorithm is fully specified and formally verified in
Lean 4 (by Zaid). The Rust implementation is not complete.

**Open work:**
- Implement the fixed-point EDCA weight lookup table in Rust
  (`1u128 << 64` shifts, distributive split-shift to avoid overflow).
- Implement the truncation window `k` — prune beads older than k cohorts from
  the active UHPO state.
- Implement the dust redistribution sweep (Equations in Section 5.3 of the
  paper): strip sub-dust outputs, redistribute proportionally to M_active.
- Write integration tests: the Alice/Bob/Charlie simulation from the paper is a
  ready-made test case with known outputs.

**Connection to stratum:** EDCA requires correct `extranonce1` attribution per
bead (PRs #472, #475 provide this) and `F_i` in committed metadata (B1 in
stratum analysis). EDCA implementation can't be tested end-to-end until both
sides are done.

---

## 3. UHPO Set Management

**What it is:** The "UTXO set" of the mining pool — a transaction with all
unspent coinbases as inputs and one output per miner. Updated out-of-band,
broadcast only on pool failure.

**Current state:** Described in the spec, not yet implemented in the node.

**Open work:**
- Construct and maintain the UHPO transaction in memory as miners submit beads.
- Update it after each Bitcoin block (re-derive `P_m` for all miners, update
  output amounts).
- Implement miner withdrawal: remove a miner's output from the UHPO tx, create
  a new signed withdrawal tx, broadcast to Bitcoin.
- Sign the UHPO tx collaboratively (see FROST section below).

**Connection to stratum:** UHPO outputs are sized by `P_m` — which depends on
EDCA scores — which depend on correct share attribution from stratum. The UHPO
tx also needs to fit in a Bitcoin block, so the coinbase size constraint (A2 in
the stratum roadmap) directly bounds how many miners can be in the UHPO set at once.

---

## 4. FROST Threshold Signing

**What it is:** The mechanism by which a quorum of miners collaboratively signs
the UHPO transaction (and the coinbase output committing to it) without any
single party having unilateral control.

**Current state:** The spec identifies this as the biggest unsolved problem.
ROAST (a FROST variant) is the current candidate. Slots key-value store for
tracking FROST signers is planned for v0.3.

**Open work (v0.3+):**
- Implement the `slots` key-value store: tracks which miners have successfully
  mined a block (these are the eligible signers).
- Integrate ROAST for threshold Schnorr signing. The DKG phase must be
  fault-tolerant (current algorithms are not — a failed participant requires
  restarting with a different subset).
- Handle the nonce coordination problem: FROST requires a shared nonce `k`
  computed in a separate DKG round before signing.

**Why it matters:** Without signing, the UHPO tx can't be broadcast even in a
pool failure scenario — miners can't be paid. This is the "biggest unsolved
problem" quote from `general_considerations.md`.

**Connection to stratum:** The miner's pubkey must be in committed metadata
(already specified as a field in `CommittedMetadata` in the Lean types). The
stratum job needs to carry this correctly. Once the key is in the DAG, FROST
can find eligible signers without any other coordination.

---

## 5. Peer Discovery

**Current state:** v0.0 — peers specified via command line only. No automatic
discovery.

**Roadmap:** v0.2 introduces DHT or similar. Testnet first.

**Open work:**
- Design and implement a peer discovery mechanism (DHT, mDNS for local
  networks, or a bootstrap node list).
- Integrate with the existing p2p layer.
- Add peer discovery to the Docker image so nodes can connect without manual
  configuration.

**Why it matters for stratum:** Miner latency (A4 in the stratum analysis) is
partly a function of network topology — which is a function of how peers
discover each other. Better peer discovery → lower DAG latency → more of the
bead window available for actual mining.

---

## 6. Testing Infrastructure

**What it is:** End-to-end testing and load simulation that doesn't exist yet.

**Open work:**
- Simulated miner harness: a program that opens N connections to stratum,
  subscribes, submits fake shares at configurable rates. Needed for Month 5
  success criteria (10k simulated miners).
- Chaos tests: simulate miner panics, network drops, `kill -9`, and verify
  zero ghost connections (Month 2 success criteria).
- EDCA integration test using the Alice/Bob/Charlie simulation.
- Load benchmark: compare `Mutex<HashMap>` vs `DashMap` at 1k/10k concurrent
  submitters (Month 3 success criteria).

**Connection to stratum:** Most of the Month 3–6 success criteria require this
infrastructure. Without simulated load, the roadmap deliverables can't be
verified.

---

## 7. Docker and Deployment

**Current state:** Docker setup exists (PR #473 reviewed, health check issue
found). v0.1 goals require distributable images that operators can run to
participate in data gathering.

**Open work:**
- Fix the health check issue found during PR #473 review.
- Ensure the Docker image includes CPUNet configuration for v0.1.
- Document the data gathering setup for v0.1 participant operators.

---

## Priority Map

| Area | Blocks stratum? | Roadmap phase | Estimated size |
|------|----------------|---------------|----------------|
| Braid consensus (graph cuts, difficulty) | Yes — C1, C3 | v0.1 | Large |
| EDCA payout implementation | No (parallel) | v0.1 | Large |
| UHPO set management | No (parallel) | v0.1 | Medium |
| Testing infrastructure | Yes — Months 3–6 | v0.1 | Medium |
| FROST signing | No | v0.3 | Very large / research |
| Peer discovery | No | v0.2 | Medium |
| Docker / deployment | No | v0.1 | Small |

The most productive adjacent area is **testing infrastructure** — it directly
unblocks the second half of the stratum roadmap and has concrete, well-scoped
tasks.
