/-!
# Braidpool Core Concepts — Lean 4

This file models the core Braidpool protocol types in Lean 4.
Writing the types forces precision: if the definition compiles,
the invariant is stated unambiguously.

Reference docs: [bead-concepts.md](../specs/bead-concepts.md)
-/

/-!
## Nonce and Extranonce

Bitcoin mining exhausts a 4-byte nonce in milliseconds on modern ASICs.
Extranonce extends the search space through the coinbase transaction.
-/

/-- A standard 32-byte hash, used for block headers and bead IDs. -/
abbrev Hash256 := ByteArray

/-- The standard Bitcoin block header. -/
structure BlockHeader where
  version    : UInt32
  prevBlock  : Hash256
  merkleRoot : Hash256
  time       : UInt32
  bits       : UInt32
  nonce      : UInt32

/--
Extranonce fields embedded in the coinbase transaction.
- `extranonce1`: assigned by the pool, unique per miner connection (8 bytes).
- `extranonce2`: rolled by the miner to generate fresh search space per job (8 bytes).
Together they provide 2^128 hash combinations.
-/
structure Extranonce where
  extranonce1 : UInt64
  extranonce2 : UInt64

/-!
## Bead

A bead is a *weak block* — it meets pool difficulty but not Bitcoin network
difficulty. It proves the miner performed real SHA256d work.

Metadata splits into two categories:
- **Committed**: hashed into the coinbase (part of the Merkle root, cannot be changed).
- **Uncommitted**: broadcast to peers separately (not part of the PoW commitment).
-/

/-- Identity of a bead — its double-SHA256 hash. -/
abbrev BeadId := Hash256

/--
Committed metadata is hashed into the coinbase transaction and therefore
locked into the proof of work. Changing any field would invalidate the bead.
-/
structure CommittedMetadata where
  parents    : List BeadId  -- beads this bead has seen
  payoutAddr : ByteArray    -- miner's Bitcoin address for UHPO credits
  pubkey     : ByteArray    -- miner's public key

/--
Uncommitted metadata is communicated to peers but not committed into the PoW.
It carries attribution and ordering information without affecting the hash.
-/
structure UncommittedMetadata where
  extranonce : Extranonce
  timestamp  : UInt64
  signature  : ByteArray

/-- A complete bead. -/
structure Bead where
  header              : BlockHeader
  committedMetadata   : CommittedMetadata
  uncommittedMetadata : UncommittedMetadata

/-!
## DAG / Braid Structure

Multiple beads can arrive simultaneously — there is no single chain.
Each bead references its parents (other beads it has seen), forming a
Directed Acyclic Graph.
-/

/--
The Braidpool DAG: a collection of beads where each bead's parents
must also be present in the graph.

In production this is maintained by `node/src/braid/mod.rs`.
-/
structure BeadDag where
  beads : List Bead

/--
A cohort is the set of beads that falls between two consecutive
global-consensus cuts of the DAG — all the work that happened in
one "round" of mining.
-/
structure Cohort where
  index : Nat
  beads : List Bead

/-!
## UHPO

Unspent Hasher Payment Output — the running balance of what each miner is owed.
Only broadcast to Bitcoin on pool failure (analogous to Lightning channel closes).
-/

/-- A single entry in the UHPO set: miner pubkey → satoshi balance. -/
structure UhpoEntry where
  pubkey   : ByteArray
  satoshis : UInt64

/-- The full UHPO set, one entry per miner with an outstanding balance. -/
structure UHPO where
  entries : List UhpoEntry

/-!
## IBD Guard

During Initial Block Download, the node has not yet caught up to the chain tip.
Mining templates are suppressed until IBD completes.
-/

inductive NodeState where
  | IBD        -- downloading historical blocks, do not issue templates
  | Synced     -- caught up, ready to mine
