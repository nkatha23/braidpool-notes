# Block-Settled EDCA — Research Notes

Source: github.com/zaidmstrr/braidpool-edca-research

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

## Core Protocol Guarantees (from the paper)

1. **Sybil Resistance (N-Split Linearity)** — splitting hashrate across
   multiple node identities yields zero mathematical advantage. Forces
   attackers to absorb maximum network fee friction.

2. **MEV "Fee Sniper" Defense** — abandoning the pool to solo-mine a
   high-fee block scales with amplified MEV cost. Pool-hopping is a
   negative Expected Value action mathematically.

3. **Selfish Mining Nullification** — withholding a share artificially
   increases its topological age in the DAG. The exponential decay
   penalizes artificially aged shares.

## Connection to my work

The payout calculation depends on share accounting. Share accounting
depends on extranonce uniqueness (PR #472) and correct extranonce
size (PR #475) — each share must be attributable to exactly one miner.
My stratum work is a prerequisite for correct EDCA payouts.

## Questions to research

- How does EDCA handle the case where two miners find shares in the
  same cohort with the same timestamp?
- What is the relationship between cohort time Tc and the decay parameter?
- How does the UHPO set get updated after each EDCA settlement?

## Relevant files in Braidpool

- `node/src/braid/mod.rs` — cohort computation
- `node/src/uncommitted_metadata/mod.rs` — extranonce fields per share
- `docs/braidpool_spec.md` — UHPO and payout commitment sections
