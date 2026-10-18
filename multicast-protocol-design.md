# Stratum Scalability: Multicast Protocol Design

## 1. The Problem

The Stratum V1 notify loop sends `mining.notify` to each connected miner sequentially
over individual TCP connections. The dominant cost is JSON serialization, each miner's
`JobNotificationResponse` is serialized independently inside the loop:

```
for each miner:
    serialize JobNotificationResponse   ← ~1–5μs (alloc + JSON encode)
    try_send(json_string)               ← ~100–500ns (non-blocking post [#543](https://github.com/braidpool/braidpool/pull/543))
```

At Braidpool's 150ms bead rate, the window available for job delivery is narrow.
Serialization cost scales linearly with connected miners:

| Miners | Loop time (estimated) | % of 150ms bead window |
|--------|----------------------|------------------------|
| 1,000 | 1–5 ms | 0.7–3% |
| 10,000 | 10–50 ms | 7–33% |
| 40,000 | 40–200 ms | 27–133% |

At 40,000 miners the notify loop could consume more time than the entire bead window.
This is a correctness problem, not just a performance one. Miners hashing against stale
jobs contribute stale shares, which directly degrades EDCA payout accuracy.

### Bottleneck chain (post [#543](https://github.com/braidpool/braidpool/pull/543))

```
Template arrives via IPC
        │
        ▼
ipc_template_consumer (lib.rs)
   - updates shared BlockTemplate
   - captures template_ready_at      ← PR #528
   - sends NotifyCmd::SendToAll
        │
        ▼
Notifier::run_notifier (stratum/notifier.rs)
   for each miner in connection_snapshot:
       1. build JobNotificationResponse  ← alloc per miner
       2. serde_json::to_string          ← ~1–5μs per miner  ← bottleneck
       3. try_send(json)                 ← ~100–500ns, non-blocking
        │
        ▼
miner's mpsc channel (cap 1024)
        │
        ▼
TCP write task → miner TCP socket
```

Before [#543](https://github.com/braidpool/braidpool/pull/543): step 3 could block on a slow miner, stalling the entire loop for everyone.  
After [#543](https://github.com/braidpool/braidpool/pull/543): step 3 is non-blocking. Steps 1–2 are now the bottleneck.

---

## 2. Three Candidate Solutions

Solutions are listed in order of cost. The cheapest that solves the problem at the
target scale is the right answer.

### Option A: Serialize once, share the bytes

The payload is identical for all miners; the per-miner fields (extranonce1) are already
baked in before the notify loop. Serialize the JSON once, distribute an `Arc<String>` to
each miner's channel:

```rust
// Current (per-miner serialize - slow)
for (_, connection_info) in &connection_snapshot {
    let json = serde_json::to_string(&job_notification_response)?;
    connection_info.sender.try_send(json);
}

// Serialize-once (fast)
let json = Arc::new(serde_json::to_string(&job_notification_response)?);
for (_, connection_info) in &connection_snapshot {
    connection_info.sender.try_send(Arc::clone(&json));  // ~5ns Arc clone
}
```

Cost per miner drops to ~5ns (Arc clone) + ~200ns (try_send). At 40,000 miners: 8–24ms.
This is a ~20-line change with no protocol modifications and no new dependencies.

The channel type changes from `mpsc::Sender<String>` to `mpsc::Sender<Arc<String>>`.
That touches `ConnectionInfo`, channel creation in `Server`, and the TCP write task in
`server.rs`. Bounded, low-risk change.

### Option B: UDP multicast on LAN

Replace the per-miner TCP send for `mining.notify` with a single UDP multicast packet.
All miners on the same LAN segment receive it simultaneously, providing O(1) broadcast
regardless of miner count. TCP stays for `mining.subscribe`, `mining.authorize`, and
`mining.submit`.

IP multicast is viable on LAN and within datacenters running IGMP snooping on managed
switches. It does not cross ISP boundaries without PIM-SM routing, which is not deployed
at consumer level. This scopes multicast to datacenter deployments, not
internet-connected home miners.

Miners need a UDP receiver to participate. Existing proprietary firmware (S19, S21
series) does not have this. Open-source firmware does; see Section 3 below.

### Option C: SV2 tproxy fan-out

The SV2 Extended Channel already solves O(N) at the pool level. The pool sends one
`NewExtendedMiningJob` to each translator proxy (tproxy). Each tproxy fans out to its
local miners over LAN. At 40,000 miners across 10 datacenters, the pool sends 10
messages. The O(N) problem shifts to the tproxy→miner hop, where it happens on LAN at
low cost, and where Option B (multicast) applies trivially if needed.

```
Current TCP (O(N) at pool):
  Pool → miner_1   (mining.notify)  ─┐
  Pool → miner_2   (mining.notify)   │  40,000 sends
  ...                                 │
  Pool → miner_40k (mining.notify)  ─┘

SV2 tproxy (O(regions) at pool):
  Pool → tproxy_us_east (NewExtendedMiningJob)  ─┐
  Pool → tproxy_eu_west (NewExtendedMiningJob)   │  10 sends
  Pool → tproxy_asia    (NewExtendedMiningJob)  ─┘
      └─ each tproxy fans out to ~4,000 local miners on LAN
```

This is the production-scale architecture already being built (see `sv2-integration.md`).
Multicast, if needed, is better implemented in sv2-apps at the tproxy→miner hop rather
than in the pool node directly.

---

## 3. Firmware Adoption and Hardware Landscape

Most deployed Bitcoin mining hardware runs proprietary firmware. Bitmain's Antminer S19
and S21 series account for the majority of network hashrate. MicroBT's Whatsminer M30/M50
series is the second-largest segment. Both ship with locked firmware that cannot be
extended without manufacturer cooperation. Option B (UDP multicast) is not viable on
these machines without Bitmain/MicroBT shipping a firmware update, which is not a
realistic near-term dependency.

The open-source firmware ecosystem is smaller but growing:

**Braiins OS** has the broadest adoption among open-source options. It runs on S9 and S19
series hardware and has a commercially supported track record. No SV2 multicast receiver
exists today, but Braiins are the SV2 specification authors, so tproxy support is more
likely to land here first than anywhere else.

**Mujina** ([256foundation/mujina](https://github.com/256foundation/mujina)) is fully
open source under the 256 Foundation and designed for extensibility. It currently runs
on Bitaxe Gamma (single BM1370 ASIC) and provides a CPU backend. EmberOne00 (twelve
BM1362 ASICs) support is landing now. S19 series is a near-term target, not yet shipped.
Mujina speaks Stratum V1; SV2 is not in mainline. Commercial products like Nova are
built on it.

The CPU backend is directly relevant here: it can be used as a test miner against
Braidpool right now, without any hardware. That means the load generator and a multicast
receiver prototype can be validated against real Mujina instances in a fully software
environment before any ASIC hardware is involved.

Because it is open source, a UDP multicast receiver for Option B can be contributed
directly with no manufacturer approval required.

**What this means for implementation strategy**:

Option A (serialize-once) works for all hardware with no firmware changes; the pool
changes, not the miners. This is the right first step regardless of firmware landscape.

Option C (SV2 tproxy) is the production path at scale. Miners don't need individual
multicast support; they connect to a local tproxy over TCP as before. Firmware adoption
is irrelevant for Option C on the pool side. For Mujina hardware specifically, native
SV2 client support is in development, which makes the tproxy→miner hop faster still.

Option B (UDP multicast) is only worth building if measurements rule out Options A and C,
and only realistically deployable in datacenters where hardware is under operator control
(can flash Braiins OS or Mujina, or negotiate with Bitmain directly).

---

## 4. UDP Multicast Constraints

### Where it works

```
Deployment             Multicast viable?    Mechanism
────────────────────────────────────────────────────────────
Localhost (CPUNet)     Yes                  Loopback, no switch involved
Single LAN / DC        Yes                  IGMP join, managed switch
Multiple DCs           Conditional          Requires multicast VPN overlay
Across internet        No                   ISPs don't route multicast
```

### IGMP snooping

A managed switch with IGMP snooping forwards multicast only to ports that have sent IGMP
join reports. Without snooping, multicast floods all ports (wasted bandwidth at scale).
Production datacenters typically have IGMP snooping enabled by default, which works in
our favor. CPUNet testnet on a single host: IGMP snooping is irrelevant, loopback
multicast works natively.

### WAN multicast

ISPs do not route multicast across their backbone. Crossing AS boundaries requires
PIM-SM (Protocol Independent Multicast, Sparse Mode), which is not deployed at consumer
level. Home routers and most enterprise firewalls block IGMP. NAT breaks multicast source
address routing entirely.

**Conclusion**: multicast is a LAN/datacenter feature. TCP stays for internet-connected
miners. The `multicast_group_addr` field in `mining.subscribe` response is optional;
miners that can't join receive `mining.notify` via TCP as before. No breaking change.

---

## 5. Research Plan

```
Phase 1 (now)
  Build the load generator
  → Immediately useful for [#543](https://github.com/braidpool/braidpool/pull/543) benchmarks regardless of which solution ships
        │
        ▼
Phase 2 (measure)
  Run at N=100, 1000, 10000 miners on localhost
  → Baseline notify loop time with current code
        │
        ▼
Phase 3a (cheap fix)
  Implement serialize-once (~20 lines), re-measure
  → If <5ms at 10,000 miners: done for CPUNet scale, no protocol work needed
        │
        ▼
Phase 3b (only if measurements show more is needed)
  Design UDP multicast as LAN/datacenter extension
  → Frame as tproxy→miner optimization in sv2-apps, not pool-node replacement
        │
        ▼
Phase 4 (if Phase 3b proceeds)
  Implement multicast, contribute UDP receiver to Mujina
Phase 5
  FEC extension (v0.7)
```

### Files touched at each phase

| Phase | Files | Risk |
|-------|-------|------|
| Load generator | `tools/stratum-load-gen/` (new crate) | None |
| Serialize-once | `stratum/notifier.rs`, `stratum/connection.rs`, `stratum/server.rs` | Low |
| Multicast | `stratum/notifier.rs`, `stratum/server.rs`, `stratum/client.rs` | High |

---

## 6. Load Generator: Implementation Guide

New workspace crate. Uses only existing workspace deps (`tokio`, `clap`, `serde_json`,
`rand`).

```
tools/
└── stratum-load-gen/
    ├── Cargo.toml
    └── src/
        ├── main.rs      CLI entry, spawns simulate_miner tasks
        ├── miner.rs     subscribe → authorize → recv jobs → submit fake shares
        └── metrics.rs   Metrics, aggregation, CSV output
```

Add to workspace `Cargo.toml`:
```toml
members = ["node", "braidpool-cli", "braidpool-common", "dashboard/miner-api-rs",
           "tools/stratum-load-gen"]
```

### CLI

```
stratum-load-gen \
  --target 127.0.0.1:3333 \
  --miners 1000 \
  --submit-rate 0.05 \    # fraction of jobs to submit fake shares for
  --duration 60 \          # seconds
  --ramp-up 10 \           # seconds to reach full miner count (avoid thundering herd)
  --output bench.csv
```

`--submit-rate` is a probability per job, not every N jobs, which more closely matches
real miner behavior at varying difficulties.

### Core miner task

```rust
pub async fn simulate_miner(
    id: u64,
    target: SocketAddr,
    submit_rate: f64,
    metrics: Arc<Metrics>,
    shutdown: CancellationToken,
) {
    let connect_start = Instant::now();
    let stream = match TcpStream::connect(target).await {
        Ok(s) => s,
        Err(_) => { metrics.record_connect_failure(); return; }
    };
    metrics.record_connect_latency(connect_start.elapsed());

    // mining.subscribe → extract extranonce1 + extranonce2_size
    let sub_start = Instant::now();
    // ... send + read response ...
    metrics.record_subscribe_latency(sub_start.elapsed());

    // mining.authorize with dummy credentials
    // ...

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => break,
            line = reader.next_line() => {
                let recv_time = Instant::now();  // miner-side receive timestamp
                match parse_method(&line) {
                    "mining.notify" => {
                        metrics.record_job_received(recv_time);
                        if rand::random::<f64>() < submit_rate {
                            // send mining.submit with fake nonce (valid format, wrong PoW)
                            // record submit_rtt on response
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
```

**End-to-end latency note**: true pool-send to miner-receive requires synchronized clocks
(NTP gives ~1ms precision, too coarse for μs measurements). Run pool and load generator
on the same host. Loopback gives sub-microsecond clock accuracy, which is the right
setup for CPUNet benchmarks.

### Metrics

```rust
pub struct Metrics {
    connect_latency_us:   Histogram,
    subscribe_latency_us: Histogram,
    job_interval_ms:      Histogram,   // time between consecutive mining.notify
    job_recv_latency_us:  Histogram,   // pool send → miner receive (loopback only)
    submit_rtt_us:        Histogram,
    jobs_received:        Counter,
    shares_submitted:     Counter,
    connect_failures:     Counter,
}
```

### CSV output

```
ts_epoch_ms,miner_id,event,value_us
1729123456789,0042,subscribe_latency,1423
1729123456790,0042,job_recv,847
1729123456791,0042,submit_rtt,312
```

One row per event. Aggregate with `--analyze bench.csv` mode or externally in pandas.

---

## 7. If Multicast Proceeds: Protocol Design

Only proceed here if Phase 3a measurements at the target miner count are still
unacceptable.

### Subscribe extension

Optional `multicast_group_addr` field in `mining.subscribe` response. Miners that don't
understand it continue receiving `mining.notify` via TCP with no breaking change:

```json
{
  "id": 1,
  "result": [
    [["mining.set_difficulty", "..."], ["mining.subscribe", "..."]],
    "00000000deadbeef",
    8
  ],
  "multicast_group_addr": "239.0.0.1:3334",
  "error": null
}
```

Pool tracks miner presence via the existing TCP connection. No separate multicast-layer
bookkeeping. If TCP drops, the miner is gone.

### Binary packet format

UDP MTU on Ethernet: 1472 bytes (1500 − 20 IP − 8 UDP). Every job must fit in one
datagram. If it doesn't, fall back to TCP unicast for that job silently.

```
Offset  Size  Field
────────────────────────────────────────────────────────
0       4     sequence_number    u32 BE, monotonically increasing
4       1     version            u8 (currently 1)
5       1     flags              bit 0: clean_jobs
                                 bit 1: fec_reserved (always 0; extension point for v0.7)
                                 bits 2–7: reserved
6       8     job_id             u64 BE (matches GlobalJobStore numeric ID)
14      32    prev_hash          bytes, Bitcoin byte order
46      4     nbits              u32 BE
50      4     ntime              u32 BE
54      4     block_version      u32 BE
58      2     coinbase1_len      u16 BE
60      var   coinbase1
+2      2     coinbase2_len      u16 BE
+var    var   coinbase2
+2      1     merkle_branch_count  u8
+1      32×N  merkle_branches
────────────────────────────────────────────────────────
```

MTU check:
```
Fixed header:                        58 bytes
coinbase1 (typical):                ~100 bytes
coinbase2 (typical):                 ~50 bytes
merkle (13 branches, mainnet avg):  417 bytes  (1 + 13×32)
─────────────────────────────────────────────
Typical total:                      ~625 bytes  ✓
Worst case (32 branches):          ~1283 bytes  ✓
```

### Reliability: sequence + retransmit

**Miner side**: track last received `sequence_number`. On gap (N+2 received, N+1 missing):
send unicast TCP retransmit request on the existing control connection:
```json
{"method": "mining.get_job", "params": [missing_sequence_number]}
```

**Pool side**: ring buffer of last 20 multicast packets (~3 seconds at 150ms bead rate).
On `mining.get_job`: look up sequence in ring buffer, unicast TCP reply.

TCP for retransmit is the right call. The connection already exists, retransmits are
rare loss events, and there's nothing to gain from managing a separate UDP unicast socket.

**FEC extension point (v0.7)**: when `flags` bit 1 is set, FEC parity data is appended
after the merkle branches. The `version` byte bumps to 2 when FEC is active. Not
designed here, just the reserved bit and version bump mechanism to avoid a format break
when FEC ships.

---

## 8. Options Comparison

| Option | Code change | Scale benefit | Firmware required | Use when |
|--------|------------|--------------|------------------|----------|
| Status quo (post [#543](https://github.com/braidpool/braidpool/pull/543)) | 0 | — | None | <500 miners |
| Serialize-once | ~20 lines | 10–100× CPU | None | 500–10,000 miners |
| UDP multicast (LAN) | ~500 lines | O(1) broadcast | UDP receiver | >10,000 miners on LAN |
| SV2 tproxy | 0 at pool | O(regions) | SV2 tproxy | Production at any scale |

---

## 9. Resources

### RFCs
- RFC 1112: Host Extensions for IP Multicasting
- RFC 2236: IGMPv2
- RFC 3376: IGMPv3
- RFC 2365: Administratively Scoped IP Multicast (239.x.x.x)
- RFC 4607: Source-Specific Multicast

### SV2 / Stratum
- SV2 spec: https://stratumprotocol.org/specification/
- SRI stratum repo: https://github.com/stratum-mining/stratum
- Braidpool sv2-apps fork: https://github.com/braidpool/sv2-apps
- SV2 Extended Channel: spec §6.1

### Mujina / 256 Foundation
- Mujina firmware: https://github.com/256foundation/mujina
- 256 Foundation: https://256foundation.org

### Rust
- `tokio::net::UdpSocket` — pool-side multicast send
- `socket2` — `IP_ADD_MEMBERSHIP`, `IP_MULTICAST_TTL` (already in `node/Cargo.toml`)
- `bytes::Bytes` — zero-copy buffer for packet serializer

### Codebase entry points

| File | What to look for |
|------|-----------------|
| `node/src/stratum/notifier.rs` | The notify loop being optimized |
| `node/src/stratum/connection.rs` | `ConnectionInfo`, channel types |
| `node/src/stratum/server.rs` | Channel creation, TCP accept loop |
| `node/src/lib.rs` | `ipc_template_consumer`, `template_ready_at` capture |
| `node/src/stratum/client.rs` | `handle_subscribe`, where multicast addr would be sent |

---

## 10. Open Questions

1. At what miner count does serialize-once become insufficient? Measurements answer this.

2. Does the SV2 tproxy integration land before multicast would ship? If yes, design
   multicast for the tproxy→miner hop in sv2-apps, not the pool node.

3. Does Mujina's SV2 work include tproxy support? If yes, Option C is the path for
   Mujina hardware with no new protocol needed.

4. Does `socket2` (`features = ["all"]`, already in `node/Cargo.toml`) expose
   `IP_ADD_MEMBERSHIP` on Linux? Expected yes; verify before writing the multicast
   sender.

---

## 11. Decision Log

| Decision | Rationale |
|----------|-----------|
| No multicast until load generator measurements confirm need | Unknown if problem exists at CPUNet scale |
| Serialize-once is Phase 3a, before any protocol design | 20-line fix may be sufficient |
| Multicast scoped to LAN/datacenter only | WAN multicast not viable at ISP level |
| FEC deferred to v0.7, flags bit 1 reserved now | Avoids format break when FEC ships |
| Load generator as separate workspace crate in `tools/` | No server changes, usable immediately for [#543](https://github.com/braidpool/braidpool/pull/543) benchmarks |
