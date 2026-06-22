# Braidpool Notes — Nkatha Kaburu (@nkatha23)

Research notes, contribution logs, and learning resources from my work
on Braidpool — a decentralized Bitcoin mining pool.

## About

I'm a software developer and Bitcoin OSS contributor working on Braidpool
full-time. These notes document my research, the problems I'm
investigating, and my understanding of the protocol as it develops.

Active contributions: [github.com/braidpool/braidpool](https://github.com/braidpool/braidpool) (PRs [#472](https://github.com/braidpool/braidpool/pull/472), [#475](https://github.com/braidpool/braidpool/pull/475), [#477](https://github.com/braidpool/braidpool/pull/477), [#479](https://github.com/braidpool/braidpool/pull/479))

## Structure

```
research/stratum/       — Stratum V1 layer analysis and scalability work
research/payout/        — Payout algorithm research (EDCA, UHPO, PPLNS)
research/specs/         — Notes on Braidpool spec, braid/bead concepts
research/lean/          — Protocol concepts modelled as Lean 4 types and proofs
contributions/          — Log of PRs, reviews, and issues
practice/rust/          — Rust experiments and learning code
```

## Quick links

- [Scalability roadmap](research/stratum/scalability-roadmap.md)
- [EDCA payout notes](research/payout/edca-notes.md)
- [Bead and DAG concepts](research/specs/bead-concepts.md)
- [Lean 4 — core types](research/lean/BraidpoolConcepts.lean)
- [Lean 4 — EDCA model](research/lean/EDCA.lean)
- [Contribution log](contributions/log.md)
