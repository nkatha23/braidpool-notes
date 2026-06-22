/-!
# EDCA — Exponentially Decayed Cohort Average

This file models the EDCA payout algorithm in Lean 4.

EDCA replaces PPLNS for Braidpool because PPLNS assumes a linear ordering
of shares. Braidpool shares arrive concurrently in cohorts inside a DAG —
there is no single sequence to slide a window over.

Reference docs: [edca-notes.md](../payout/edca-notes.md)
Source paper: [github.com/zaidmstrr/braidpool-edca-research](https://github.com/zaidmstrr/braidpool-edca-research)
-/

import BraidpoolConcepts

/-!
## Core Idea

Instead of "last N shares", EDCA assigns a weight to each cohort
using an exponential decay function. The weight of cohort `k` steps
in the past is:

```
weight(k) = exp(-λ · k)
```

where `λ` is the decay parameter. Older cohorts contribute
exponentially less to the current payout calculation.

Because the DAG structure is deterministic, every node computes the
same weights independently — no coordination needed.
-/

/-- Decay parameter λ. Larger values make older cohorts decay faster. -/
abbrev DecayParam := Float

/--
Weight assigned to a cohort that is `age` steps before the current
cohort tip. Age 0 = the most recent cohort.
-/
def cohortWeight (λ : DecayParam) (age : Nat) : Float :=
  Float.exp (-λ * age.toFloat)

/-!
## Per-Miner Share Contribution

Each share (bead) in a cohort is attributed to exactly one miner via
`extranonce1`. This is why extranonce uniqueness (PRs #472, #475) is
a prerequisite for correct EDCA payouts.
-/

/-- A miner's share contribution within a single cohort. -/
structure ShareContribution where
  pubkey   : ByteArray  -- identifies the miner
  hashrate : Float      -- estimated from submitted shares

/--
EDCA weight for a single miner's contribution from a cohort at `age`
steps in the past.

  edcaCredit = hashrate · exp(-λ · age)

Older work is discounted; recent work counts more.
-/
def edcaCredit (λ : DecayParam) (age : Nat) (s : ShareContribution) : Float :=
  s.hashrate * cohortWeight λ age

/-!
## Protocol Security Guarantees

### Sybil Resistance — N-Split Linearity

Splitting hashrate H across N identities produces N shares, each credited
with H/N hashrate. The total credit is unchanged. An attacker gains nothing
from Sybil splitting and absorbs N times the network fee overhead.
-/

/--
Sybil split invariant: splitting one miner into N equal-hashrate identities
produces the same total EDCA credit as the original identity.

This is stated as a proposition to be proved; the proof would use the
linearity of multiplication over the sum.
-/
theorem sybilResistance (λ : DecayParam) (age : Nat) (h : Float) (n : Nat)
    (hn : n > 0) :
    let original := edcaCredit λ age ⟨#[], h⟩
    let splitTotal := n.toFloat * edcaCredit λ age ⟨#[], h / n.toFloat⟩
    original = splitTotal := by
  simp [edcaCredit, cohortWeight]
  ring

/-!
### Selfish Mining Nullification

A miner who withholds a bead delays including it in the DAG. The withheld
bead's topological age increases while being held — it appears older than
it should. The exponential decay function penalises older contributions,
so withholding strictly reduces the miner's expected payout.
-/

/--
Withholding penalty: a bead withheld for `delay` extra cohort steps
receives strictly less credit than one submitted immediately.
-/
theorem withholdingPenalty (λ : DecayParam) (age delay : Nat) (s : ShareContribution)
    (hλ : λ > 0) (hd : delay > 0) :
    edcaCredit λ (age + delay) s < edcaCredit λ age s := by
  simp [edcaCredit, cohortWeight]
  apply mul_lt_mul_of_pos_left _ (by linarith [s.hashrate])
  apply Float.exp_lt_exp.mpr
  linarith [Nat.cast_pos.mpr hd]

/-!
## UHPO Update

After each Bitcoin block, the UHPO set is updated: each miner's balance
increases by their weighted share of the block reward.

The UHPO output is committed in the coinbase so it is anchored to Bitcoin
without requiring an on-chain transaction per settlement.
-/

/-- Block reward in satoshis. -/
abbrev Satoshis := UInt64

/--
Compute each miner's share of a block reward given a list of
(miner, cohort_age, hashrate) tuples and a decay parameter.

Returns a list of (pubkey, satoshi_credit) pairs.
-/
def computePayouts
    (λ      : DecayParam)
    (reward : Float)
    (contributions : List (ByteArray × Nat × Float))
    : List (ByteArray × Float) :=
  let weighted := contributions.map fun ⟨pk, age, h⟩ =>
    ⟨pk, h * cohortWeight λ age⟩
  let totalWeight := weighted.foldl (· + ·.2) 0.0
  if totalWeight == 0.0 then []
  else weighted.map fun ⟨pk, w⟩ => ⟨pk, reward * w / totalWeight⟩
