# Braidpool Core Concepts

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

A **cohort** is a group of beads between two graph cuts — all beads
that happened between two points of global consensus.

```
cohort N-1  |  cohort N  |  cohort N+1
    ●───●   |   ●─●─●   |    ●───●
     ╲  │   |    ╲ │    |     ╲  │
      ● ●   |     ●●    |      ● ●
```

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

## How these fit together

```
Miner submits share (bead)
  └─ extranonce1 (unique per miner, PR #472/#475) identifies the miner
  └─ bead enters the DAG, assigned to a cohort
      └─ EDCA computes payout weight from cohort position and decay
          └─ UHPO updated: miner's balance increases
```

See also: [EDCA notes](../payout/edca-notes.md)
