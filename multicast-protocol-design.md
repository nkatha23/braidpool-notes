# Stratum Scalability Research — Multicast Protocol Design

**Author**: nkatha23  
**Date**: 2026-10-18  
**Status**: Research phase — no implementation until measurements confirm need  
**Branch**: local fork only until decision is made

---

## 1. What We're Actually Solving

The roadmap frames this as "TCP doesn't scale at 40,000 miners." That number needs
scrutiny before designing anything. CPUNet today has tens of miners. Bitshoka lab has a
handful. The v0.1 data gathering goal is latency measurement, not scale testing.

The real question is: **at what realistic miner count does the notify loop become a
measurable problem, and what's the cheapest fix?**

That question determines whether multicast is the right solution at all, or whether a
5-line code change (serialize-once) solves the problem first.

### The actual bottleneck chain

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
Notifier::run_notifier (stratum.rs)
   for each miner in connection_snapshot:
       1. build JobNotificationResponse  ← serialize per miner (SLOW)
       2. serde_json::to_string          ← alloc + encode per miner (SLOW)
       3. try_send(json)                 ← ~100-500ns, non-blocking post #543
        │
        ▼
miner's mpsc channel (cap 1024)
        │
        ▼
TCP write task → miner TCP socket
```

Before #543: step 3 could block on a slow miner, stalling the entire loop.  
After #543: step 3 is non-blocking. Steps 1–2 are now the bottleneck.

---

## 2. Cost Model — What the Numbers Actually Say

### Per-miner cost breakdown (post #543)

| Operation | Cost (estimate) | Source |
|-----------|----------------|--------|
| Loop overhead + HashMap lookup | ~10–50 ns | CPU cache miss on connection_snapshot |
| `serde_json::to_string` (per miner) | ~1–5 μs | JSON alloc + encode, ~300 byte payload |
| `try_send` (non-blocking) | ~100–500 ns | tokio mpsc, no contention |
| **Total per miner** | **~1–6 μs** | dominated by serialization |

### Projected notify loop time at scale

| Miners | Per-miner serialize | Total loop time | % of 150ms bead window |
|--------|-------------------|----------------|------------------------|
| 100 | ~1–5 μs | 0.1–0.5 ms | <1% |
| 1,000 | ~1–5 μs | 1–5 ms | 0.7–3% |
| 10,000 | ~1–5 μs | 10–50 ms | 7–33% |
| 40,000 | ~1–5 μs | 40–200 ms | 27–133% |

### After "serialize once" optimization

Serialize the JSON payload once, clone the `Arc<String>` per miner:

| Miners | Cost (Arc clone + try_send) | Total | % of 150ms |
|--------|---------------------------|-------|------------|
| 10,000 | ~200–600 ns | 2–6 ms | 1–4% |
| 40,000 | ~200–600 ns | 8–24 ms | 5–16% |

**Conclusion**: serialize-once may eliminate the problem entirely at CPUNet scale and
reduce it to acceptable levels at 10,000 miners. This is a 5-line change. It must be
measured before designing a new protocol.

---

## 3. Three Research Questions — In Order

### Question 1: Does serialize-once solve the problem?

This is the first thing to measure, not design. The optimization:

```rust
// Current (per-miner serialize — slow)
for (peer_adr, connection_info) in &connection_snapshot {
    let job_notification_json = serde_json::to_string(&job_notification_response)?;
    connection_info.sender.try_send(job_notification_json);
}

// Serialize-once (fast)
let job_notification_json = Arc::new(serde_json::to_string(&job_notification_response)?);
for (peer_adr, connection_info) in &connection_snapshot {
    connection_info.sender.try_send(Arc::clone(&job_notification_json));
    //                                ^^^^^ Arc clone: ~5ns
}
```

Note: this requires changing the channel type from `mpsc::Sender<String>` to
`mpsc::Sender<Arc<String>>`. That touches `ConnectionInfo`, the channel creation in
`Server`, and the TCP write task in `server.rs`. Moderate but bounded change.

**Measure with the load generator** (see Section 5). Run at N=100, 1000, 10000 miners.
Record notify loop time before and after. If the result is <5ms at 10,000 miners,
multicast is not needed for CPUNet scale.

---

### Question 2: What are the real constraints on UDP multicast?

The roadmap assumes multicast is straightforward. It isn't on WANs.

**IP multicast works on LAN (CPUNet testnet):**
- Miners on localhost or same switch: trivial, no router involvement
- Multicast address `239.0.0.1` (administratively scoped, RFC 2365)
- IGMP join from each miner: managed by OS when `IP_ADD_MEMBERSHIP` is called
- Pool sends one UDP packet, switch replicates to all IGMP-joined ports

**IP multicast breaks on WAN (production):**
- Most ISPs do not route multicast across their backbone (BGP-level multicast is
  uncommon)
- Home routers and most enterprise firewalls block IGMP
- NAT breaks multicast source address routing entirely
- Crossing an AS boundary requires PIM-SM (Protocol Independent Multicast — Sparse Mode)
  which is not deployed at consumer ISP level

**IGMP snooping on managed switches:**
- A managed switch with IGMP snooping only forwards multicast frames to ports that have
  sent IGMP join reports for that group
- Without snooping: multicast floods all ports (like broadcast) — fine for small
  deployments, wasted bandwidth at scale
- CPUNet testnet (single host or small LAN): IGMP snooping irrelevant, loopback
  multicast works without any switch involvement
- Production data center: IGMP snooping required and usually enabled by default on
  managed switches — this works in our favor

**Practical scope:**

```
Deployment          Multicast viable?    Mechanism
──────────────────────────────────────────────────────────
Localhost (CPUNet)  Yes                  Loopback multicast
Single LAN/DC       Yes                  IGMP, managed switch
Multiple DCs        Conditional          Requires multicast VPN overlay
Across internet     No                   ISPs don't route multicast
```

**Decision**: multicast is a datacenter/LAN feature. TCP stays for internet miners.
The `multicast_group_addr` in `mining.subscribe` response is optional — miners that
can't join fall back to receiving jobs via TCP.

---

### Question 3: Is SV2 tproxy a better architectural answer?

SV2 Extended Channel already solves O(N) at the pool level without any new protocol:

```
Current TCP (O(N) at pool):
  Pool → miner_1 (mining.notify)   ─┐
  Pool → miner_2 (mining.notify)    │  40,000 sends
  ...                                │
  Pool → miner_40000               ─┘

SV2 tproxy (O(regions) at pool):
  Pool → tproxy_us_east (NewExtendedMiningJob)  ─┐
  Pool → tproxy_eu_west (NewExtendedMiningJob)   │  10 sends
  ...                                             │
  Pool → tproxy_asia    (NewExtendedMiningJob)   ─┘
     each tproxy fans out to ~4000 local miners via LAN
```

With SV2 tproxy in place, the pool sends O(regions) messages. The tproxy-to-miner
fan-out happens on LAN where both TCP and multicast work fine — and at LAN speeds
the O(N) problem at the tproxy level is much cheaper.

**This means**: multicast might be better implemented in sv2-apps (tproxy→miner path)
rather than in the pool node directly. The pool node's notify loop handles tproxy
connections, which will be far fewer than raw miner connections.

The SV2 integration plan (see `sv2-integration.md`) already targets this architecture.
The multicast design should be evaluated in that context, not independently.

---

## 4. Implementation Roadmap — Slowbut Steady

```
Phase 1 (now):     Build load generator
                        │
                        ▼
Phase 2 (measure): Run at 100 / 1000 / 10000 miners, record notify loop time
                        │
                        ▼
Phase 3a (cheap):  Implement serialize-once, re-measure
                   → If <5ms at 10,000: done for CPUNet scale
                        │
                        ▼
Phase 3b (if needed): Design multicast
                   → Only if measurements show it's necessary
                   → Frame as tproxy optimization, not pool replacement
                        │
                        ▼
Phase 4:           Implement multicast (Month 5 original roadmap)
Phase 5:           FEC extension point (v0.7 roadmap)
```

### What changes at each phase

| Phase | Files changed | Risk |
|-------|--------------|------|
| Load generator | `tools/stratum-load-gen/` (new crate) | None — new code only |
| Serialize-once | `stratum/notifier.rs`, `stratum/connection.rs`, `stratum/server.rs` | Low — bounded change |
| Multicast (if needed) | `stratum/notifier.rs`, `stratum/server.rs`, `stratum/client.rs` | High — new protocol |

---

## 5. Load Generator — Implementation Guide

### Structure

New workspace member. Uses only existing workspace deps.

```
tools/
└── stratum-load-gen/
    ├── Cargo.toml
    └── src/
        ├── main.rs      CLI entry, spawns simulate_miner tasks
        ├── miner.rs     simulate_miner: subscribe → authorize → recv jobs → submit
        └── metrics.rs   Metrics struct, aggregation, CSV output
```

Add to `Cargo.toml` workspace members:
```toml
members = ["node", "braidpool-cli", "braidpool-common", "dashboard/miner-api-rs",
           "tools/stratum-load-gen"]
```

### CLI interface

```
stratum-load-gen \
  --target 127.0.0.1:3333 \
  --miners 1000 \
  --submit-rate 0.05 \      # fraction of jobs to submit fake shares for
  --duration 60 \            # seconds
  --ramp-up 10 \             # seconds to reach full miner count (avoid thundering herd)
  --output bench.csv
```

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
        Err(e) => { metrics.record_connect_failure(); return; }
    };
    metrics.record_connect_latency(connect_start.elapsed());

    // mining.subscribe
    let sub_start = Instant::now();
    // send subscribe, read response, extract extranonce1 + extranonce2_size
    metrics.record_subscribe_latency(sub_start.elapsed());

    // mining.authorize
    // send authorize with dummy credentials

    // job loop
    loop {
        tokio::select! {
            _ = shutdown.cancelled() => break,
            line = reader.next_line() => {
                let recv_time = Instant::now();   // ← miner-side receive time
                let msg = parse_stratum_message(line);
                match msg.method.as_str() {
                    "mining.notify" => {
                        // job_id embedded in the notify params carries the
                        // pool-side send_time if we encode it (or measure separately
                        // by correlating with pool logs)
                        metrics.record_job_received(recv_time);

                        if rand::random::<f64>() < submit_rate {
                            let submit_start = Instant::now();
                            // send mining.submit with fake nonce (valid format, wrong PoW)
                            // record submit_rtt when we get the response
                        }
                    }
                    "mining.set_difficulty" => { /* ignore */ }
                    _ => {}
                }
            }
        }
    }
}
```

### Metrics to collect

```rust
pub struct Metrics {
    connect_latency_us:   Histogram,   // time to TCP connect
    subscribe_latency_us: Histogram,   // time from connect to subscribe response
    job_interval_ms:      Histogram,   // time between consecutive mining.notify
    job_recv_latency_us:  Histogram,   // end-to-end: pool send → miner receive (requires clock sync)
    submit_rtt_us:        Histogram,   // time from submit to pool response
    jobs_received:        Counter,
    shares_submitted:     Counter,
    connect_failures:     Counter,
}
```

**Note on end-to-end latency**: true pool-send → miner-receive measurement requires
either synchronized clocks (NTP precision: ~1ms, too coarse for μs measurements) or
running pool and miners on the same host (loopback). For CPUNet testnet on localhost,
loopback gives sub-microsecond clock accuracy — this is the right measurement setup.

### CSV output format

```
ts_epoch_ms,miner_id,event,value_us
1729123456789,0042,subscribe_latency,1423
1729123456790,0042,job_recv,847
1729123456791,0042,submit_rtt,312
```

One row per event. Aggregate in post-processing (Python/pandas or a simple Rust
analysis mode with `--analyze bench.csv`).

---

## 6. If Multicast: Protocol Design

Only proceed here if measurements in Phase 2–3 show it's needed.

### Subscribe extension

Add optional `multicast_group_addr` field to `mining.subscribe` response:

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

Miners that understand this field join the UDP multicast group. Miners that don't
(old firmware) continue receiving `mining.notify` via TCP — no breaking change.

Pool tracks miner presence via the existing TCP connection. If TCP drops, pool removes
the miner from its connection map — no separate multicast-layer bookkeeping. The miner
OS will eventually time out the IGMP membership.

### Job packet binary format

UDP practical MTU on Ethernet: 1472 bytes (1500 IP - 20 IP header - 8 UDP header).
Every mining.notify must fit in one datagram. If it doesn't, fall back to TCP unicast
for that job only.

```
Offset  Size  Field                 Notes
──────────────────────────────────────────────────────────────
0       4     sequence_number       u32 big-endian, monotonically increasing
4       1     version               u8, protocol version (currently 1)
5       1     flags                 bit 0: clean_jobs
                                    bit 1: fec_enabled (reserved, always 0 for now)
                                    bits 2–7: reserved
6       8     job_id                u64 big-endian (matches GlobalJobStore numeric ID)
14      32    prev_hash             bytes, Bitcoin byte order
46      4     nbits                 u32 big-endian (Bitcoin compact target)
50      4     ntime                 u32 big-endian (Unix timestamp)
54      4     version               u32 big-endian (Bitcoin block version)
58      2     coinbase1_len         u16 big-endian
60      var   coinbase1             bytes
+2      2     coinbase2_len         u16 big-endian
+var    var   coinbase2             bytes
+2      1     merkle_branch_count   u8 (max 255 branches)
+1      32×N  merkle_branches       N × 32 bytes
──────────────────────────────────────────────────────────────
```

**Changes from original roadmap sketch:**
- `job_id` reduced from 32 bytes to 8 bytes (matches `GlobalJobStore` u64 numeric ID)
- `flags` bit 1 reserved for FEC to leave a clean v0.7 extension point
- `merkle_branch_count` is u8 not embedded in a length prefix

**MTU budget check:**
```
Fixed header:   58 bytes
coinbase1:      ~100 bytes typical (varies)
coinbase2:      ~50 bytes typical
merkle (13 branches, mainnet typical): 1 + 13×32 = 417 bytes
──────────────────────────────────────
Total typical:  ~625 bytes  ✓ fits in 1472
Worst case (32 branches): 58 + 150 + 50 + 1 + 32×32 = 1283 bytes  ✓ fits
```

### Reliability layer — sequence + retransmit

UDP has no delivery guarantee. The design:

**Miner side:**
- Track last received `sequence_number`
- If gap detected (received N+2 without N+1): send unicast TCP retransmit request to
  pool on the existing TCP control connection
- Request format: `{"method": "mining.get_job", "params": [sequence_number]}`

**Pool side:**
- Keep a ring buffer of last 20 multicast packets (at 150ms bead rate: 3 seconds of
  history — enough to cover typical WAN jitter if multicast were used on WAN, and
  more than enough for LAN)
- On receiving `mining.get_job`: look up the sequence number in the ring buffer, send
  unicast TCP reply with the job

**Why TCP for retransmit rather than UDP unicast:**
- The TCP connection already exists (used for subscribe/authorize/submit)
- No new socket management needed
- Retransmits are rare (loss events, not normal path) — blocking TCP is fine here

**FEC extension point (v0.7):**
When `flags` bit 1 is set, the packet carries FEC parity data appended after the
merkle branches. The receiver uses the parity to reconstruct lost packets without a
retransmit round-trip. The `version` byte bumps to 2 when FEC is active. This is not
designed here — just the reserved bit and the version bump mechanism.

---

## 7. Comparison Table — Options at Each Scale

| Option | Lines of code | Scale benefit | Firmware changes | When to use |
|--------|--------------|--------------|-----------------|-------------|
| Status quo (post #543) | 0 | None | None | <500 miners |
| Serialize-once | ~20 | 10–100× CPU reduction | None | 500–10,000 miners |
| UDP multicast (LAN) | ~500 | O(1) broadcast | Need UDP receiver | >10,000 miners on LAN |
| SV2 tproxy fan-out | 0 (at pool) | O(regions) | Need SV2 tproxy | Production at any scale |

The SV2 tproxy path is the cleanest long-term answer for production. The pool handles
O(regions) connections, each tproxy handles O(miners/region) on LAN. Multicast becomes
relevant only at the tproxy→miner hop where it's trivially viable (all on same LAN).

---

## 8. Resources

### RFCs

- **RFC 1112** — Host Extensions for IP Multicasting (base spec)
- **RFC 2236** — IGMPv2
- **RFC 3376** — IGMPv3 (source-specific filtering)
- **RFC 2365** — Administratively Scoped IP Multicast (239.x.x.x range)
- **RFC 4607** — Source-Specific Multicast for IP

### SV2 / Stratum

- SV2 spec: https://stratumprotocol.org/specification/
- SRI sv2-apps (check for multicast work): https://github.com/stratum-mining/stratum
- Braidpool sv2-apps fork: https://github.com/braidpool/sv2-apps
- Extended Channel design: SV2 spec §6.1 (pool→tproxy job distribution)

### Tokio / Rust

- `tokio::net::UdpSocket` — for pool-side multicast send
- `socket2` crate — for `IP_ADD_MEMBERSHIP`, `IP_MULTICAST_TTL` socket options
  (already in `node/Cargo.toml` as `socket2 = { version = "0.5", features = ["all"] }`)
- `bytes::Bytes` — zero-copy buffer for the multicast packet serializer

### Existing braidpool code to understand first

| File | Why |
|------|-----|
| `node/src/stratum/notifier.rs` | The notify loop being optimized |
| `node/src/stratum/connection.rs` | `ConnectionInfo`, channel types |
| `node/src/stratum/server.rs` | Channel creation, TCP accept loop |
| `node/src/lib.rs` | `ipc_template_consumer`, where `template_ready_at` is captured |
| `node/src/stratum/client.rs` | `handle_subscribe` — where multicast addr would be sent |

---

## 9. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-18 | No multicast implementation until load generator measurements | Can't know if needed at CPUNet scale |
| 2026-10-18 | Serialize-once is Phase 3a, measured before multicast design | 5-line fix may be sufficient |
| 2026-10-18 | Multicast scoped to LAN/datacenter only | WAN multicast not viable without ISP support |
| 2026-10-18 | FEC deferred to v0.7, extension point reserved in flags byte | Complexity not justified until reliability baseline established |
| 2026-10-18 | Load generator built as separate workspace crate in `tools/` | No server changes needed, immediately usable for #543 benchmarks |

---

## 10. Open Questions

These need answers before implementation, not before the load generator:

1. At what miner count does Braidpool realistically expect to operate in the first 12
   months? The answer determines whether this research matters at all for the near term.

2. Does the SV2 integration plan (sv2-integration.md) change the pool→miner topology
   before the multicast work would ship? If yes, design multicast for tproxy→miner, not
   pool→miner.

3. Does `socket2` (already in `node/Cargo.toml`) support `IP_ADD_MEMBERSHIP`
   on Linux for the pool-side send socket? Verify before writing the multicast sender.
   (Expected: yes — `socket2` with `features = ["all"]` exposes this on all platforms.)

4. What is the Bitshoka hardware firmware update path? If Bitshoka miners can receive
   firmware OTA, the UDP receiver can be shipped there. If not, multicast only works for
   software miners (cpuminer, load generator) in the near term.
