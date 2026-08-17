# Bitaxe + Braidpool Setup

**Hardware in hand:** Bitaxe (BM1370 ASIC, Noctua fan upgrade, OSMU board visible in photos)
**Status:** Planning; setup session scheduled this week

---

## Topology

```
Bitcoin Core (IPC)  ←→  Braidpool node  ←  Bitaxe (WiFi, SV1)
                              ↓
                         Dashboard (Vite dev server)
```

Two machines:
- **Node machine** — your laptop: runs `bitcoin-node`, `braidpool/node`, dashboard
- **Bitaxe** — on the same WiFi subnet, points its stratum config at the laptop's LAN IP

---

## CLI flags — what actually does what

From `node/src/cli.rs` and `node/src/main.rs`:

| Flag | Default | Controls |
|------|---------|---------|
| `--stratum-port` | `3333` | Stratum listener port (what the Bitaxe connects to) |
| `--bind` | `0.0.0.0:6680` | P2P listener — NOT stratum |
| `--rpc-bind` | `127.0.0.1:6682` | JSON-RPC server (braidpool-cli, dashboard API) |
| `--ipc-socket` | platform default | Path to Bitcoin Core IPC socket |
| `--network` | `mainnet` | Network (`cpunet`, `testnet4`, `signet`, `mainnet`) |

**Stratum already binds to `0.0.0.0:3333` by default** — `StratumServerConfig::hostname` defaults to `"0.0.0.0"`, so it listens on all interfaces without any extra flag. No `--bind` change is needed for the Bitaxe to reach it.

**Known gap:** `start_difficulty` and `minimum_difficulty` (both default to `1`) are NOT exposed as CLI args. For a Bitaxe at ~400+ GH/s, difficulty 1 means it finds valid shares near-instantly and will flood the node's stratum handler. This needs a code patch until VARDIFF (#issue TBD) ships — see "Difficulty problem" section below.

---

## SV1 vs SV2

Braidpool currently implements **Stratum V1 only** — newline-delimited JSON-RPC with the standard method set (`mining.subscribe`, `mining.configure`, `mining.authorize`, `mining.submit`, `mining.suggest_difficulty`).

Bitaxe firmware (AxeOS) speaks SV1 natively. No compatibility gap.

An upstream pool using SV1 is also already handled — that's what audit mode is for. `UpstreamPoolClient` speaks SV1 to the upstream (Ocean etc.), downstream miners connect via SV1 to Braidpool, which proxies. "Upstream pool uses SV1" is the existing, working design, not a gap.

SV2 is a roadmap item — bigger architectural lift (block assembly moves from pool to miner). Realistic path: SV1 stays as-is for ASICs/older firmware, SV2 gets a separate listener when prioritized.

---

## Step-by-step setup

### 1. Bitaxe hardware checks

Before powering on:
- **Power**: 5V DC barrel jack (right side of board). The USB-C port is data/flashing only on most Bitaxe variants — confirm with your specific model's docs before assuming USB-C powers the ASIC.
- **Fan**: Noctua retrofit looks correct. Confirm connector is seated.
- **OLED**: Optional. Bitaxe runs fine headless if the display isn't connected.

### 2. Bitaxe network config (AxeOS)

1. Power on. First boot creates a WiFi AP (`Bitaxe_XXXX` or similar).
2. Connect your phone/laptop to that AP, navigate to `http://192.168.4.1` (AxeOS captive portal).
3. Set WiFi credentials — same network as the node machine.
4. After reconnect, find the Bitaxe's new DHCP IP via your router or AxeOS status page.
5. In AxeOS → Stratum settings:
   ```
   Host: <node-machine-LAN-IP>
   Port: 3333
   User: anything, e.g. bitaxe.worker1
   Password: x   (Braidpool accepts any, not validated)
   ```

### 3. Bitcoin Core (IPC-enabled build)

Build prerequisites: `libmultiprocess`, Cap'n Proto. See [bitcoin multiprocess doc](https://github.com/bitcoin/bitcoin/blob/master/doc/multiprocess.md).

```bash
cd <bitcoin-source-dir>
cmake -B build -DENABLE_IPC=ON
cmake --build build
```

Run on CPUnet:
```bash
cd build/bin
./bitcoin-node -cpunet -ipcbind=unix:/tmp/bitcoin-cpunet.sock -printtoconsole
```

Generate blocks so templates are non-empty (Braidpool skips notification on empty templates):
```bash
./bitcoin-cli -cpunet createwallet cpunet
./contrib/cpunet/miner --cli=./bitcoin-cli --ongoing \
  --address `./bitcoin-cli -cpunet getnewaddress` \
  --grind-cmd="./bitcoin-util -cpunet -ntasks=1 grind"
```

### 4. Braidpool node

```bash
cd braidpool/node
cargo run -- \
  --ipc-socket /tmp/bitcoin-cpunet.sock \
  --network cpunet
```

That's it — stratum binds to `0.0.0.0:3333` automatically. No `--bind` override needed for the Bitaxe to reach it.

To also expose the RPC from localhost for the dashboard:
```bash
cargo run -- \
  --ipc-socket /tmp/bitcoin-cpunet.sock \
  --network cpunet \
  --rpc-bind 127.0.0.1:6682
```

(`127.0.0.1:6682` is already the default, so this flag is only needed if you're changing it.)

### 5. Dashboard

```bash
cd braidpool/dashboard
npm install
npm run dev   # Vite dev server
```

Dashboard connects to:
- `http://localhost:8999/api/v1` — Braidpool API
- `ws://localhost:5000` — main WebSocket
- `ws://localhost:65433/` — DAG WebSocket

These ports are in `dashboard/src/URLs.ts`. If any of them don't match what the node is actually serving, that file is where to update them.

### 6. Verify connection

```bash
cd braidpool-cli
cargo run -- gettips
```

Watch node logs for `"Miner connected"` (stratum layer) and then share submissions. Dashboard → Mining Inventory should show the Bitaxe as a connected device.

---

## Difficulty problem (real blocker for Bitaxe)

`StratumServerConfig` defaults:
```rust
start_difficulty: 1,
minimum_difficulty: 1,
```

These are NOT CLI-configurable today. A Bitaxe at ~400 GH/s with difficulty 1 will flood the stratum handler. Patch required before the session:

```rust
// node/src/main.rs, around line 265
let stratum_config = StratumServerConfig {
    audit_mode: args.audit,
    audit_miner_difficulty: args.miner_difficulty,
    start_difficulty: 100_000,     // raise for real ASIC hashrate
    minimum_difficulty: 100_000,
    ..Default::default()
};
```

Choose a value that gives ~10–60 second share intervals at your Bitaxe's actual hashrate. A 400 GH/s device at difficulty 100,000 submits roughly every 0.25ms — still too fast. For cpunet testing, try `start_difficulty: 1_000_000` (roughly 2.5s interval at 400 GH/s).

This is a known architectural gap — VARDIFF (#issue) would handle this dynamically. File an issue after the session if one doesn't already exist.

---

## Issue log

*(fill in as encountered during setup)*

- [ ] Difficulty not CLI-configurable — needs code patch before Bitaxe session
- [ ] Confirm which AxeOS version is on this Bitaxe (affects AP SSID format and UI layout)
- [ ] Confirm whether USB-C on this specific board model is data-only or can deliver power
- [ ] Verify Dashboard URL ports match what the running node serves

---

## What to test and observe

- **Unpadded nonce in practice**: The `unpadded_nonce_not_rejected_by_length_check` test was based on theoretical analysis. This is a chance to observe empirically whether AxeOS sends `"3"` vs `"00000003"` — check node logs for nonce values in submit params.
- **payout_address validation gap**: Worker name isn't checked for a valid address format. A typo fails silently. Note this behavior.
- **Share rate**: Observe the actual share interval at the patched difficulty to calibrate the VARDIFF starting point.
