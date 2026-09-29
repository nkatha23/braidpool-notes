# Bitcoin Multiprocess, IPC, Cap'n Proto — Explainer

Written as reference after setting up the functional test framework for Braidpool (PR #566).
Covers: what the binaries are, how they talk to each other, why IPC instead of HTTP/RPC,
and how Braidpool fits in.

---

## The Problem: Monolithic bitcoind

Traditional `bitcoind` is one giant process doing everything:
- Validating blocks and transactions
- Managing the mempool
- Serving the JSON-RPC API
- Connecting to peers over P2P
- Mining coordination (getblocktemplate)

One crash or bug in any part can take the whole node down. External tools (like Braidpool)
that need mining data have to go through the HTTP JSON-RPC API, which has overhead and
limited expressiveness.

---

## The Solution: Bitcoin Multiprocess

Bitcoin Core's multiprocess project splits `bitcoind` into separate processes, each
responsible for one concern. The key binary for Braidpool is:

| Binary | What it does |
|--------|-------------|
| `bitcoind` | The old monolithic node — still works, no IPC |
| `bitcoin-node` | The new process-separated node binary |
| `bitcoin-wallet` | Wallet process (separate from node) |
| `bitcoin-gui` | GUI process (separate from node) |

`bitcoin-node` is built only when you compile with `-DENABLE_IPC=ON`. Without that flag,
`cmake` produces `bitcoind` only.

The processes communicate over **Unix domain sockets** using **Cap'n Proto** serialization —
not HTTP, not JSON.

---

## Cap'n Proto

Cap'n Proto is a binary serialization format and RPC framework. Think of it as the
alternative to:

| Technology | Format | Transport |
|-----------|--------|-----------|
| JSON-RPC (bitcoind today) | JSON text | HTTP |
| Protocol Buffers (gRPC) | Binary | HTTP/2 |
| **Cap'n Proto** | **Binary** | **Unix socket / pipe** |

### Why Cap'n Proto over JSON-RPC

| | JSON-RPC | Cap'n Proto |
|--|---------|------------|
| Serialization | Text → parse → object | Binary → zero-copy read |
| Encoding overhead | High (field names repeated as strings) | Near zero |
| Batch support | No (one call per HTTP request) | Yes (multiple calls in one message) |
| Schema | None (duck typed) | Strict `.capnp` schema files |
| Transport | HTTP (TCP) | Unix socket (kernel buffer) |
| Latency | ~1ms+ (TCP stack) | ~microseconds (shared memory) |

For Braidpool, this matters at bead rate: a new block template every ~100ms means
`getblocktemplate` is called constantly. JSON-RPC over HTTP can't keep up at that rate;
Cap'n Proto over a Unix socket can.

### Cap'n Proto schema files

Interfaces are defined in `.capnp` files, similar to `.proto` files in gRPC:

```capnp
# mining.capnp
interface Mining {
  getBlockTemplate @0 (options :BlockTemplateRequest) -> (result :BlockTemplate);
  submitSolution   @1 (data :BlockData) -> ();
}
```

Braidpool's schemas live in `node/schema/mining.capnp` and `node/schema/init.capnp`.

---

## Unix Domain Sockets vs TCP

A Unix domain socket is a file on disk (e.g. `/tmp/bitcoin-cpunet.sock`). Two processes
on the same machine communicate through it via the kernel — no network stack involved.

| | TCP (localhost) | Unix socket |
|--|----------------|------------|
| Lives in | Network stack | Filesystem |
| Overhead | TCP headers, loopback | None (kernel buffer) |
| Addressable remotely | Yes | No (same machine only) |
| Use case | HTTP, RPC over network | IPC between local processes |

When you run:
```bash
bitcoin-node -cpunet -ipcbind=unix:/tmp/bitcoin-cpunet.sock
```
Bitcoin creates a Unix socket at that path and listens for Cap'n Proto connections.

When Braidpool starts with:
```bash
braidpool-node --ipc-socket /tmp/bitcoin-cpunet.sock
```
It connects to that socket and calls Cap'n Proto methods directly — no HTTP, no JSON.

---

## libmultiprocess

libmultiprocess is the library that implements the process separation plumbing in Bitcoin Core.
It:
- Generates Rust/C++ bindings from `.capnp` schema files
- Handles connection setup between processes
- Manages the event loop for async Cap'n Proto calls

It's a dependency you must install before building `bitcoin-node` with `-DENABLE_IPC=ON`.
Without it, cmake will error out during configure.

Repo: https://github.com/bitcoin-core/libmultiprocess

---

## The cpunet Fork

Standard Bitcoin Core supports: `mainnet`, `testnet4`, `signet`, `regtest`.

Braidpool needs `cpunet` — a custom test network with:
- A different block hash algorithm (not SHA256d)
- Lower difficulty for CPU mining
- Faster block times for testing bead DAG behaviour

This is not in upstream Bitcoin Core. The braidpool team maintains a fork:
`braidpool/bitcoin` branch `cpunet`.

You need this fork for `feature_node_startup.py` — standard `bitcoin-node` gives:
```
Error: Error parsing command line arguments: Invalid parameter -cpunet
```

### Building the cpunet fork

```bash
git clone --branch cpunet --depth 1 git@github.com:braidpool/bitcoin.git ~/braidpool-bitcoin
cd ~/braidpool-bitcoin
cmake -B build -DENABLE_IPC=ON   # requires libmultiprocess + Cap'n Proto installed
cmake --build build -j$(nproc)   # ~35 min
```

Verify both features present:
```bash
~/braidpool-bitcoin/build/bin/bitcoin-node -help 2>&1 | grep -E "cpunet|ipcbind"
```

---

## How Braidpool Uses IPC

```
┌─────────────────────────────────┐
│         bitcoin-node            │
│  (braidpool/bitcoin:cpunet)     │
│                                 │
│  Mining interface (Cap'n Proto) │
│  - getBlockTemplate()           │
│  - submitSolution()             │
│  - getMiningTipInfo()           │
└────────────┬────────────────────┘
             │  Unix socket
             │  /tmp/bitcoin-cpunet.sock
             │  (Cap'n Proto binary frames)
┌────────────▼────────────────────┐
│         braidpool-node          │
│  node/src/ipc/client.rs         │
│  SharedBitcoinClient            │
│                                 │
│  - fetches block templates      │
│  - submits found blocks         │
│  - listens for new chain tips   │
└─────────────────────────────────┘
```

Key files in Braidpool:

| File | Purpose |
|------|---------|
| `node/src/ipc.rs` | Block listener, template consumer |
| `node/src/ipc/client.rs` | `SharedBitcoinClient` — async Cap'n Proto client |
| `node/schema/mining.capnp` | Mining interface definition |
| `node/schema/init.capnp` | Init interface (bootstraps connection) |

---

## rust_cpunet_miner

Standard `cpuminer` (used for regtest/signet) uses SHA256d hashing — it won't produce
valid cpunet blocks because cpunet uses a different hash algorithm.

`braidpool/rust_cpunet_miner` is a CPU miner written in Rust that implements the cpunet
hash algorithm. Used when you want to actually mine beads on cpunet during development/testing.

Repo: https://github.com/braidpool/rust_cpunet_miner

---

## Summary: what you need and why

| Component | Why needed | Where to get it |
|-----------|-----------|-----------------|
| `libmultiprocess` | Required to build `bitcoin-node` with IPC | github.com/bitcoin-core/libmultiprocess |
| `Cap'n Proto` | Serialization library used by IPC | capnproto.org |
| `braidpool/bitcoin:cpunet` | bitcoin-node with both `-cpunet` and `-ipcbind` | git@github.com:braidpool/bitcoin.git branch cpunet |
| `braidpool/rust_cpunet_miner` | CPU miner that speaks cpunet hash algorithm | github.com/braidpool/rust_cpunet_miner |
| `target/debug/node` | Braidpool node (cargo builds as `node` not `braidpool-node`) | `cd ~/braidpool/node && cargo build` |
