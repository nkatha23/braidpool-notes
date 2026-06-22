# Braidpool Core Concepts

Sources: [braid_consensus.md](https://github.com/braidpool/braidpool/blob/dev/docs/braid_consensus.md),
[general_considerations.md](https://github.com/braidpool/braidpool/blob/dev/docs/general_considerations.md)

## Nonce → Extranonce → Bead

Bitcoin mining iterates through a 4-byte nonce field in the block header.
Modern ASICs exhaust 4 billion values in milliseconds.

Extranonce extends the search space via the coinbase transaction:
- `extranonce1`: assigned by pool, unique per miner connection (8 bytes)
- `extranonce2`: rolled by miner, fresh search space per job (8 bytes)
- Total: 16 bytes = 2^128 combinations

A **bead** is a weak block — meets pool difficulty but not Bitcoin difficulty.
It proves the miner did real SHA256 work. Contains:
- `blockheader` — standard Bitcoin header
- **committed metadata** (parents, payout address, pubkey) — hashed into coinbase
- **uncommitted metadata** (timestamps, signature, extranonce) — communicated to peers

## DAG / Braid Structure

Multiple beads can arrive simultaneously — no single chain.
Each bead references its parents (other beads it has seen).
The full structure is a Directed Acyclic Graph (DAG).

**No-incest rule:** a bead cannot name an ancestor-of-a-parent as a direct parent.
This eliminates triangles in the graph — there's no new information in naming a
higher-order ancestor since it's already implied by the parent reference.

A **cohort** is a group of beads between two graph cuts — all beads
that happened between two points of global consensus.

```
cohort N-1  |  cohort N  |  cohort N+1
    ●───●   |   ●─●─●   |    ●───●
     ╲  │   |    ╲ │    |     ╲  │
      ● ●   |     ●●    |      ● ●
```

A **graph cut** is a point where all beads on the right have all beads on
the left as ancestors. Graph cuts are found with a depth-first search using
the Lowest Common Ancestor algorithm (linear time).

## Braid Mathematics

Share production is a Poisson process. For hashrate λ (hashes/sec),
difficulty target x, and time t:

```
P(t,k) = ((λ/x · t)^k · e^(-λ/x · t)) / k!
```

Defining:
- `N_B` = number of beads in window T
- `N_C` = number of cohorts in window T
- `T_B` = T / N_B (avg time per bead)
- `T_C` = T / N_C (avg time per cohort)

Cohort time formula (sum of two limits):

```
T_C = 1/(λx) + a · e^(a·λx)
```

where `a` is the global network latency parameter (≈ 40ms minimum,
the light-speed propagation time between maximally separated nodes on Earth).

## Target Bead Rate

At the minimum of the T_C curve, the optimal ratio is:

```
N_B / N_C ≈ 2.42 beads per cohort
```

This is independent of latency, hashrate, and observation window — it's
a universal constant of the DAG structure. The difficulty adjustment algorithm
targets this ratio.

**Implication for stratum:** at 10k miners with D_bp targeting NB/NC = 2.42,
bead time T_C is approximately 150ms–1000ms. Stratum must push new jobs at
this cadence when the DAG tip changes — not just when a new Bitcoin block arrives.

## Per-Bead Difficulty Adjustment

Each bead's required difficulty x is computed from the DAG's recent history:

```
x₀ = 2·W(1/2) / (a · λ̄)     -- optimal target
x  = (x₀ + (x̄₁ - x₀) · e^(-π·a/T)) · 2^(-max(0, N_PC - 4))
```

where W is the Lambert W function, x̄₁ is the average parental target,
and N_PC is the size of the parent cohort (exponential falloff kicks in
if the parent cohort grows beyond 4 beads, signalling too-high bead rate).

Critical damping is applied with τ = T/π so the system returns to the true
hashrate quickly without oscillating.

**This is independent of Bitcoin's 2-week difficulty window.** Stratum must
send `set_difficulty` based on the bead-layer difficulty, not Bitcoin difficulty.

## IBD

**Initial Block Download** — when a node starts fresh it downloads
all historical blocks before mining. During IBD, Braidpool skips
sending mining templates (`WARN Node in IBD`).

## UHPO

**Unspent Hasher Payment Output** — running tally of what each miner
is owed. Updated with each block, only broadcast to Bitcoin on
pool failure (like Lightning's optimistic protocols).

The UHPO commitment lives in the coinbase output so it is anchored to
Bitcoin without requiring an on-chain transaction per payout.

UHPO is represented as a transaction: inputs = all unspent coinbases
mined by the pool; outputs = one output per miner, sized by share contribution.
This transaction is fully signed and valid, broadcast only on pool failure.

## How these fit together

```
Miner submits share (bead)
  └─ extranonce1 (unique per miner, PR #472/#475) identifies the miner
  └─ bead enters the DAG, assigned to a cohort
  └─ graph cut closes the cohort → Δc_i increments for all older beads
      └─ EDCA computes payout weight: W_i = S_i × r^(Δc_i)
          └─ UHPO updated: miner's weighted balance increases
              └─ on Bitcoin block: P_m = U_m / U_total settled to coinbase
```

See also:
- [EDCA notes](../payout/edca-notes.md)
- [Stratum protocol requirements analysis](../stratum/protocol-requirements-analysis.md)
