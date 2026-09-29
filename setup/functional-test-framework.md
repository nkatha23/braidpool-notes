# Functional Test Framework — Setup & Run Guide

Reference for running `tests/functional/` in the braidpool repo.
First written while reviewing PR #566 (commit `7e58c7a`).

---

## Prerequisites

### 1. braidpool-node binary

Build from the repo root:

```bash
cd ~/braidpool/node
cargo build
```

Binary lands at `~/braidpool/target/debug/node` (not `braidpool-node` — the env var name is misleading).

### 2. bitcoin-node with cpunet + IPC support

Standard `bitcoind` or the IPC-only build (`bitcoin-307825cfa6b0`) will NOT work —
`feature_node_startup.py` requires `-cpunet` AND `-ipcbind`, which only exist in the
braidpool bitcoin fork.

**Clone and build:**

```bash
git clone --branch cpunet --depth 1 git@github.com:braidpool/bitcoin.git ~/braidpool-bitcoin
cd ~/braidpool-bitcoin
cmake -B build -DENABLE_IPC=ON
cmake --build build -j$(nproc)
```

Build takes ~30–40 minutes. Verify both flags are present after:

```bash
~/braidpool-bitcoin/build/bin/bitcoin-node -help 2>&1 | grep -E "cpunet|ipcbind"
```

Expected output includes:
```
  -cpunet
       Use the CPU-mined test chain...
  -ipcbind=<address>
```

**Branch note:** The correct branch is `braidpool/bitcoin:cpunet`.
`cmempool` is an older branch that has IPC but not cpunet — don't use it.
There are no pre-built releases as of September 2026 — you must build from source.

---

## Running the framework tests

All commands from `tests/functional/`:

```bash
cd ~/braidpool/tests/functional
```

### Framework unit/lifecycle tests (no binaries needed)

```bash
python3 test_runner.py feature_framework_lifecycle.py feature_framework_skip.py feature_framework_unit_tests.py
```

Expected:
```
feature_framework_lifecycle.py  | Passed
feature_framework_unit_tests.py | Passed
feature_framework_skip.py       | Skipped
ALL                             | Passed
```

### Node startup test (requires both binaries)

```bash
python3 feature_node_startup.py \
  --bitcoin-bin ~/braidpool-bitcoin/build/bin/bitcoin-node \
  --braidpool-bin ~/braidpool/target/debug/node \
  --network cpunet \
  --nocleanup
```

On success: silent exit with code 0.
On failure: logs preserved in `/tmp/bp_func_test_<suffix>/test_framework.log`.

Check exit code and find latest log dir:

```bash
echo "exit: $?" && ls -td /tmp/bp_func_test_*/ | head -3
cat /tmp/bp_func_test_<suffix>/test_framework.log | grep -E "ERROR|failed"
```

---

## Bugs found during review of PR #566

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | `feature_node_startup.py` | `LogManager()` called with spurious `keep_on_success=` kwarg | Fixed in 7e58c7a |
| 2 | `feature_framework_unit_tests.py` | Expected list in `test_runner_default_selection_and_filters` had 2 entries, BASE_SCRIPTS had 4 | Fixed in 7e58c7a |
| 3 | `network_config.py` | `keep_logs_on_success` field missing from `NetworkConfig` dataclass | Fixed in 7e58c7a |
| 4 | `feature_node_startup.py` | Requires cpunet bitcoin binary — standard bitcoind gives `Invalid parameter -cpunet` | Doc gap |
| 5 | `feature_framework_unit_tests.py:704` | `test_test_node_addnode_extra_arg` asserts old `host:port` format, code now uses libp2p multiaddr | Open (as of 7e58c7a) |

**Bug 5 fix** — update line 704:
```python
# Before (stale)
assert "--addnode=127.0.0.1:1000" in all_extra_args[1]

# After (correct)
assert "--addnode=/ip4/127.0.0.1/udp/1000/quic-v1" in all_extra_args[1]
```

---

## Doc gaps in running_tests.md (as of PR #566)

1. No mention of which bitcoin fork is required or where to get it
2. Binary name is `node` not `braidpool-node` — env var `BRAIDPOOL_BIN_PATH` implies the latter
3. No pre-built binary available — build from source takes 30–40 min, not mentioned
