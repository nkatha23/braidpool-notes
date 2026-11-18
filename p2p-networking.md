# Braidpool P2P Networking (libp2p)

> How Braidpool nodes find each other, prove who they are, and gossip beads.
> Covers the implemented code on `dev` plus the in-flight network-isolation
> work in PR #534

---

## 0. The goal, in one paragraph

Braidpool is a **decentralized** mining pool. There is no central server that
holds "the" share chain, instead every node keeps its own copy of the braid (a
DAG of beads/shares) and nodes **gossip beads to each other** so everyone
converges on the same view. That gossip runs over **libp2p**, the same
peer-to-peer toolkit used by IPFS and Ethereum. The networking layer has to do
four jobs: (1) **find** other nodes, (2) **authenticate** them (know you're
talking to the same node next time), (3) **isolate** networks so a mainnet node
never talks to a cpunet node, and (4) **move beads** — both the steady drip of
new beads and the bulk catch-up when a node first joins.

---

## 1. Key terms (the layman version first)

### PeerId — a node's fingerprint
A **PeerId** is a node's permanent network identity: a hash of its public key,
shown as something like `12D3KooWG9z8TziaNuYyEcc9FeUC3FTtrEf2XSnSdDpLvx4Jh2w3`.

- **Layman:** It's like a phone number that you *prove you own* every time you
  pick up. Nobody can impersonate it, because answering as that PeerId requires
  the matching private key.
- **Low-level:** Braidpool uses Ed25519. The node generates a keypair; the
  PeerId is derived from the public key (`local_key.public().to_peer_id()`).
  When two nodes connect, the libp2p transport (QUIC+TLS/Noise) does a handshake
  that cryptographically proves each side holds the private key behind its
  advertised PeerId. So a PeerId is *self-certifying* — no central registry.
- **Use cases in Braidpool:**
  - Key for the Kademlia DHT (who to ask for "who else is out there").
  - Key for the `PeerManager` tables — latency, score, geo-group, inbound/outbound (`peer_manager/mod.rs` `PeerInfo`).
  - Addressing for `bead_sync` request/response (`request_beads(peer_id, ...)`).
  - Floodsub mesh membership (`add_node_to_partial_view(peer_id)`).

### Keystore — where the fingerprint's private half lives
The **keystore** is a single file on disk holding the node's Ed25519 private key
(protobuf-encoded). Load it → same PeerId across restarts. Lose it → new PeerId.

- **Location (dev):** `<datadir>/keystore` (`main.rs:851`).
  **Under PR #534:** `<datadir>/<network>/keystore` (moves into the per-network subdir).
- **Lifecycle (`main.rs:851-887`):**
  1. `fs::read(keystore_path)` → if present, `Keypair::from_protobuf_encoding` (reuse identity).
  2. If absent → `Keypair::generate_ed25519()`, write it, `chmod 0400` on Unix.
- **Layman:** It's the node's passport. The passport *number* is the PeerId;
  the passport *booklet* is the keystore file. Delete the booklet and the
  government issues you a brand-new number — nobody who knew the old you
  recognizes you anymore.
- **Why 0400 perms:** anyone who reads this file can impersonate the node.

### Bootstrap / boot node — the first phone number you already know
A brand-new node knows *nobody*. To join a P2P network you need at least one
known starting contact — a **boot node** (a.k.a. bootstrap / seed node) — a
long-lived, well-known node whose address is baked into the software.

- **Layman:** Moving to a new city, you call the one person whose number you
  already have; they introduce you to everyone else. The boot node is that one
  person. After the introductions, you don't need them anymore.
- **Low-level (dev, `main.rs:58-63, 944-976`):**
  - `BOOTNODES` = hardcoded PeerId `12D3KooW...Jh2w3`.
  - `SEED_DNS` = `/dnsaddr/french.braidpool.net` (DNS-based address, so the IP
    can change without a code release).
  - `ADDR_REFRENCE` = the combined `/dnsaddr/.../p2p/<PeerId>` multiaddr.
  - On startup a non-audit node adds the seed to Kademlia and `swarm.dial()`s it,
    then relies on Kademlia's periodic bootstrap (`set_periodic_bootstrap_interval(600s)`)
    to discover the rest of the mesh.
- **Under PR #534 (`main.rs` diff):** the hardcoded PeerId is dropped; the node
  just `dial`s `/dnsaddr/french.braidpool.net` directly. The boot node is then
  subject to the same protocol-negotiation gate as any peer (see §4).

### Multiaddr — a self-describing address
libp2p addresses are **multiaddrs**: `/ip4/1.2.3.4/udp/6680/quic-v1`. They stack
the full path (IP → transport → port → protocol), optionally ending in
`/p2p/<PeerId>`. Braidpool listens on QUIC: `/ip4/<ip>/udp/<port>/quic-v1`
(`main.rs:924`).

---

## 2. The libp2p stack in Braidpool

libp2p is a **Swarm** (the event loop that owns connections) driving a
**NetworkBehaviour** (what the node actually *does* on the network). Braidpool's
behaviour is a composite of five sub-behaviours (`behaviour/mod.rs:37-45`):

| Sub-behaviour | Crate | Job in Braidpool |
|---|---|---|
| `kademlia` | `kad` | DHT — peer **discovery** ("who else is out there?") |
| `identify` | `identify` | On connect, peers swap public key + listen addrs + **supported protocols** |
| `ping` | `ping` | Liveness + latency measurement (feeds peer scoring) |
| `bead_sync` | `request_response` | **Pull** beads/tips/genesis on demand (IBD + gap-fill) |
| `bead_announce` | `floodsub` | **Push** newly found beads to the mesh (gossip) |

**Transport:** QUIC (`udp/quic-v1`) with DNS resolution and tokio. Built via
`SwarmBuilder::with_existing_identity(keypair)` (`main.rs:896`).

### The two bead-movement paths (important mental model)
- **Floodsub (push, steady state):** when this node finds/accepts a new bead it
  `publish`es it to the `braidpool_channel` topic; subscribed peers receive it
  (`main.rs:1918`). This is the real-time gossip.
- **bead_sync (pull, catch-up):** request/response protocol for Initial Block
  Download (IBD). A joining node asks peers for `GetTips` → `GetBeads` in
  batches of `IBD_BATCH_SIZE=500` until caught up (`ibd_manager/`,
  `main.rs:1665+`). Used whenever the node is behind, not just at first start.

---

## 3. Protocol IDs — the strings that gate everything

Every libp2p sub-protocol negotiates a **protocol ID string** when a substream
opens. If two peers don't share the exact string, that substream can't form.

**dev (global, un-scoped — `behaviour/mod.rs:15-20`):**
```
/braidpool/kad/1.0.0
/braidpool/identify/1.0.0
/braidpool/bead-sync/1.0.0
/floodsub/1.0.0           (bead_announce)
braidpool_channel         (floodsub topic)
```

**The bug this causes:** every network (mainnet/signet/regtest/cpunet) uses the
*same* strings. A cpunet node and a mainnet node recognize each other as
"braidpool peers," negotiate substreams, and exchange beads that are invalid for
each other's chain → silent bead/hash divergence → mesh breakdown. See #462, #533.

---

## 4. Network isolation — PR #534 (`multi-network-persistance`)

**Idea:** make the protocol IDs and on-disk paths *functions of the network*, so
cross-network peers physically cannot negotiate a substream.

### 4a. Scoped protocol IDs (`behaviour/mod.rs` diff)
Constants become functions of `PoolNetwork`:
```
/braidpool/<network>/kad/1.0.0
/braidpool/<network>/bead-sync/1.0.0
/braidpool/<network>/identify/1.0.0
braidpool_channel/<network>
```
`BraidPoolBehaviour::new(local_key, network)` now threads the network through
every sub-protocol. Two different networks → different strings → no substream.

### 4b. The "pending peer" bouncer (`peer_manager/` + `main.rs` diff)
Because a foreign-network peer can still open a *transport* connection (QUIC
handshake succeeds; it's the application substreams that fail), #534 adds a
waiting room so foreign peers never pollute peer scoring/selection:

1. `ConnectionEstablished` → `add_pending_peer(peer_id, remote_addr, is_dialer)`.
   The peer is parked, **not** yet in the mesh or `PeerManager`.
2. `Identify::Received` → inspect the peer's advertised protocols:
   - If it advertises **our** `bead_sync` protocol → `promote_pending_peer`
     (moves it into `PeerManager` via `add_peer`), add routable addrs to the DHT,
     add to floodsub mesh.
   - Else → `drop_pending_peer` + `swarm.disconnect_peer_id` (foreign network).
3. `ConnectionClosed` → `remove_peer` (also clears any pending entry).

So the **real isolation** is the scoped protocol ID (substreams can't form); the
pending mechanism is hygiene so foreign peers don't sit in scoring tables.

### 4c. DHT routability filter (`utils/mod.rs` diff)
`is_routable_multiaddr` filters out loopback/private/link-local/CGNAT/multicast
addresses before inserting into the Kademlia DHT, so nodes don't advertise
unreachable addresses that waste `FIND_NODE` hops.

### 4d. Network-scoped persistence
- DB: `<datadir>/<network>/braidpool.db` (`init_db(datadir, network)`).
- Keystore: `<datadir>/<network>/keystore`.
- `warn_on_legacy_db` logs a one-time warning if a pre-scoping DB exists at the
  old path; nothing is migrated automatically.

---

## 5. Lifecycle of a peer connection (end to end)

```
           dial seed (/dnsaddr/french.braidpool.net)   [main.rs, non-audit]
                         │
      QUIC + TLS/Noise handshake  ──►  proves both PeerIds (crypto)
                         │
            ConnectionEstablished
         dev: add_peer immediately
       #534: add_pending_peer (parked)
                         │
             Identify exchange (swap protocols + addrs)
                 ┌───────┴────────┐
     supports our bead_sync?    no → drop_pending_peer + disconnect  [#534]
                 │ yes
     promote_pending_peer → PeerManager
     add routable addrs → Kademlia DHT
     add_node_to_partial_view → floodsub mesh
                         │
         ┌───────────────┼────────────────┐
   ping (latency)   floodsub (new beads)   bead_sync (IBD catch-up)
                         │
            scoring in PeerManager (latency bonus, idle penalty, geo-group)
            get_top_k_peers_for_propagation(k) picks who to gossip to
```

---

## 6. PeerManager — who we keep and who we gossip to

`peer_manager/mod.rs`. Tracks every known peer's `PeerInfo`: latency, score
(starts at 100), inbound/outbound, `geo_group` (first 2 octets of IP, like
Bitcoin's netgroup for diversity), connected flag, IP.

- **Scoring:** low latency → bonus; idle → penalty (`idle_penalty` per sec);
  bad behavior → score decremented with a doubling `score_penalty_multiplier`;
  below `min_acceptable_score` (-100) → eviction candidate.
- **Selection:** `get_top_k_peers_for_propagation(k)` ranks peers for bead
  gossip so we push to the best-connected, most-diverse set rather than everyone.
- **#534 adds:** `pending_peers` map + promote/drop, keeping unverified/foreign
  peers out of all of the above until Identify passes.

---

## 7. Open gaps / things to watch (as of 2026-11-18)

These came out of reviewing #534 — track them:

1. **Keystore identity reset on upgrade (gap).** Scoping the datadir moves the
   keystore to `<datadir>/<network>/keystore`. Existing nodes won't find the old
   `<datadir>/keystore`, so they silently generate a **new PeerId**. The DB has a
   legacy warning + migration note; the keystore has neither. Sansh agreed to
   extend the legacy warning to cover the keystore (warning only, no migration —
   acceptable since a new PeerId just means the node rejoins like a fresh one).

2. **Boot-node redeploy is coupled to the merge (ordering).** With scoped
   protocols, a fresh node that dials the seed will **drop it** on Identify if
   the seed still advertises the old un-scoped `/braidpool/kad/1.0.0` — leaving
   the new node with no peers to bootstrap from. The seed infra must run
   per-network scoped instances *with or before* #534 lands, or discovery is dead
   on arrival. Sansh is aware ("bootstrap nodes not pushed for the segregation").

3. **IPv6 ULA not filtered** in `is_routable_multiaddr` (IPv4 checks `is_private`,
   IPv6 misses `fc00::/7`). **Pending-peer map keyed by PeerId** can drop a valid
   peer under multiple simultaneous connections. **Deleted `resolve_datadir`
   tests** with no replacement. **No tests** for `is_routable_multiaddr`. (Full
   list in the #534 review findings.)

---

## 8. Eventual direction

- **Full network segregation** end-to-end (wire + disk) — #534 is the first cut.
- **Authenticated, scored peer mesh** where foreign/misbehaving peers are kept
  out of propagation and scoring (pending mechanism is a step toward this).
- Relationship to **SV2**: the P2P/libp2p layer is node↔node (bead gossip). It is
  *separate* from the miner↔pool path (Stratum V1 today, SV2 in progress — see
  `sv2-integration.md`). Beads gossiped here are the shares that the stratum/SV2
  side produces. Don't conflate the two layers.

---

## File map (quick reference)

| Concern | File | Key symbols |
|---|---|---|
| Composite behaviour + protocol IDs | `node/src/behaviour/mod.rs` | `BraidPoolBehaviour`, `KADPROTOCOLNAME`, `request_beads` |
| Swarm setup, keystore, boot nodes, event loop | `node/src/main.rs` | `BOOTNODES`, `SEED_DNS`, keystore load (851-887), swarm loop |
| Peer tracking + scoring | `node/src/peer_manager/mod.rs` | `PeerManager`, `PeerInfo`, `get_top_k_peers_for_propagation` |
| IBD / bulk bead catch-up | `node/src/ibd_manager/` | `IBDCommands`, `IBD_BATCH_SIZE` |
| DHT routability filter (#534) | `node/src/utils/mod.rs` | `is_routable_multiaddr` |
| Network-scoped DB (#534) | `node/src/db/init_db.rs` | `init_db(datadir, network)`, `warn_on_legacy_db` |
