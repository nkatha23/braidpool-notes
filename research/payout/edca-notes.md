# Block-Settled EDCA — Research Notes

Source: [github.com/zaidmstrr/braidpool-edca-research](https://github.com/zaidmstrr/braidpool-edca-research)  
Paper: [PAPER.md](https://github.com/zaidmstrr/braidpool-edca-research/blob/main/PAPER.md)

## What is EDCA?

Exponentially Decayed Cohort Average. The payout algorithm Braidpool
will use instead of PPLNS.

Traditional pools use PPLNS (Pay Per Last N Shares) — a sliding window
over the last N shares submitted. PPLNS was designed for linear chains
where shares are ordered sequentially. It creates incentives for pool
hopping (miners leave before a block is found, rejoin after).

Braidpool uses a DAG — shares arrive concurrently in cohorts. PPLNS
doesn't map cleanly to a DAG because there's no single linear ordering
of shares within a cohort.

## What EDCA does differently

Instead of a sliding window over N shares, EDCA uses an exponential
decay function applied per cohort. Older cohorts contribute less to
the payout calculation. The decay is deterministic from the DAG
structure — every node computes the same result independently.

## Formal Equations

### Equation 1 — Fee Amplifier

Miners construct their own block templates and lock in the total fee `F_i`.
The amplified block reward for bead `i` is:

```
A_i = B_base + F_i
```

`B_base` = current halving epoch subsidy (e.g. 3.125 BTC), `F_i` = total
transaction fees in the miner's committed template.

### Equation 2 — Raw Score

Braidpool uses a uniform pool difficulty `D_bp` for all miners (no vardiff).
The Expected Value of one bead:

```
S_i = (D_bp / D_network) × A_i
```

`D_bp / D_network` is the probability that one Braidpool bead is a valid
Bitcoin block. Multiplying by `A_i` gives the bead's exact EV anchored to
current market conditions.

A miner with higher hashrate submits more beads at the same `D_bp`, not
heavier beads.

### Equation 3 — EDCA Weight

`r` = retention multiplier (e.g. 0.80; production suggests r > 0.9).  
`Δc_i` = topological age measured in elapsed cohorts (not wall-clock time).

```
W_i = S_i × r^(Δc_i)
```

As new cohorts close, `Δc_i` increases, exponentially diluting historical
weight. A miner absent from the pool accelerates the decay of their past work.

### Equation 4 — UHPO Settlement

Total score for miner `m` across all their beads:

```
U_m = Σ W_i   (for all beads i submitted by miner m)
```

Payout percentage:

```
P_m = U_m / U_total
```

Every node derives `P_m` independently from the immutable DAG — no central
server needed.

## Simulated Game Theory (from the paper)

Parameters: r = 0.80, B_base = 3.125 BTC.  
Miners: Alice (loyal), Bob (fee sniper), Charlie (latecomer). Each 500 difficulty when active.

| Cohort | Age | r^age | Alice | Bob | Charlie |
|--------|-----|-------|-------|-----|---------|
| C1 (fee spike, F=1.25) | 4 | 0.4096 | 896.0 | 896.0 | 0.0 |
| C2 (quiet, F=0.10) | 3 | 0.5120 | 825.6 | 0.0 | 0.0 |
| C3 (quiet, F=0.15) | 2 | 0.6400 | 1048.0 | 0.0 | 0.0 |
| C4 (rising, F=0.40) | 1 | 0.8000 | 1410.0 | 0.0 | 0.0 |
| C5 (spike, F=1.50) | 0 | 1.0000 | 2312.5 | 2312.5 | 2312.5 |
| **Total** | | | **6492.1** | **3208.5** | **2312.5** |

Block reward: 4.625 BTC.  
Alice: 54% → 2.500 BTC. Bob: 26.7% → 1.235 BTC. Charlie: 19.25% → 0.890 BTC.

Bob's fee-snipe failed. Alice was rewarded for loyalty through the low-fee periods.

## Core Protocol Guarantees

1. **Sybil Resistance (N-Split Linearity)** — splitting hashrate across
   multiple node identities yields zero mathematical advantage. Forces
   attackers to absorb maximum network fee friction.

2. **MEV "Fee Sniper" Defense** — abandoning the pool to solo-mine a
   high-fee block scales with amplified MEV cost. Pool-hopping is a
   negative Expected Value action mathematically.

3. **Selfish Mining Nullification** — withholding a share artificially
   increases its topological age in the DAG. The exponential decay
   penalizes artificially aged shares.

## EDCA vs. Rosenfeld's Geometric Method

Both use exponential decay to kill pool-hopping. Key differences:

| | Rosenfeld Geometric | Block-Settled EDCA |
|---|---|---|
| Coordinate space | linear share index `s` | DAG cohort index `Δc_i` |
| Total ordering | required (linear chain) | not required (DAG) |
| Round boundaries | per Bitcoin block (reset) | none — decay runs continuously |
| Risk bearer | pool operator absorbs variance | no counterparty needed |
| State bloat | `s` grows exponentially per round | bounded by truncation window `k` |

The critical insight: Rosenfeld decays per share in a sequence. EDCA decays
per cohort boundary (graph cut). Because all parallel beads within a cohort
share the same `Δc_i`, the decay is DAG-compatible without a global ordering.

## Systems Architecture Notes

### O(1) Memory Bound

A truncation window `k` (e.g. 5000 cohorts) prunes beads older than `k`.
At `k = 5000` the decay multiplier is cryptographic dust. This bounds the
active UHPO state to O(1) memory — prevents state-bloat DoS attacks.

### Fixed-Point Arithmetic

Floating-point is prohibited in Braidpool consensus (chain splits across
architectures). EDCA decay is pre-computed into a lookup table using fixed-
point bitwise shifts (e.g. `1u128 << 64`). Intermediate products use a
distributive split-shift to avoid u128 overflow on extreme fee spikes.

### Dust Redistribution

Sub-dust UHPO outputs (`O_m < L_dust`) are stripped, summed into `D_total`,
and proportionally redistributed to active qualifying miners:

```
O_q' = O_q + (O_q / Σ O_j) × D_total    (for j ∈ M_active)
```

100% of the block reward settles on-chain. No value is destroyed.

## Connection to my work

The payout calculation depends on share accounting. Share accounting
depends on extranonce uniqueness (PR #472) and correct extranonce
size (PR #475) — each share must be attributable to exactly one miner.
My stratum work is a prerequisite for correct EDCA payouts.

The Fee Amplifier (B1 in analysis doc) also requires stratum to pass
`F_i` from the block template into committed metadata — a future stratum task.

See: [stratum protocol requirements analysis](../stratum/protocol-requirements-analysis.md)

## Questions to research

- How does EDCA handle the case where two miners find shares in the
  same cohort with the same timestamp?
- What is the relationship between cohort time Tc and the decay parameter r?
- How does the UHPO set get updated after each EDCA settlement?
- Why is r > 0.9 suggested for production vs. 0.80 in the example?

## Relevant files in Braidpool

- `node/src/braid/mod.rs` — cohort computation
- `node/src/uncommitted_metadata/mod.rs` — extranonce fields per share
- `docs/braidpool_spec.md` — UHPO and payout commitment sections
- `docs/general_considerations.md` — UHPO design, payout authorization
