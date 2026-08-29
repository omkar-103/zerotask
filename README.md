# ZeroTask

> Zero-dependency task runner and process orchestrator for Node.js.  
> Built for the **Zero Dependency 2026** hackathon — Hackathon Raptors.

---

## Table of Contents

1. [What is ZeroTask?](#1-what-is-zerotask)
2. [Why does it exist?](#2-why-does-it-exist)
3. [Installation](#3-installation)
4. [Quick Start](#4-quick-start)
5. [Configuration Reference](#5-configuration-reference-zerojson)
6. [CLI Reference](#6-cli-reference)
7. [Task Dependencies](#7-task-dependencies)
8. [Retries and Backoff](#8-retries-and-backoff)
9. [Timeouts](#9-timeouts)
10. [Shutdown Behavior](#10-shutdown-behavior)
11. [Architecture](#11-architecture)
12. [Examples](#12-examples)
13. [Testing](#13-testing)
14. [Reproducible Build](#14-reproducible-build)
15. [Zero-Dependency Proof](#15-zero-dependency-proof)
16. [Limitations](#16-limitations)
17. [Package Killer Comparison](#17-package-killer-comparison)

---

## 1. What is ZeroTask?

ZeroTask is a process orchestrator for Node.js that runs multiple tasks in parallel or in a dependency-defined order — with no third-party runtime dependencies whatsoever. It uses only Node.js built-in modules: `child_process`, `fs`, `path`, `process`, `events`, `readline`.

Think of it as `concurrently` with three things it's missing: a dependency graph, exponential backoff on retries, and per-task timeouts with SIGTERM→SIGKILL escalation.

---

## 2. Why Does It Exist?

`concurrently` is excellent at running processes in parallel. But it doesn't support:

- **Dependency-aware ordering** — there is no way to say "start `frontend` only after `api` is ready."
- **Exponential backoff** — `restartTries` retries immediately with no delay.
- **Per-task timeouts** — there is no way to kill a hung process after N seconds and retry it.

ZeroTask fills these three gaps with zero third-party code. See [STDLIB.md §1](./STDLIB.md) for the full side-by-side comparison.

---

## 3. Installation

**Requirements:** Node.js ≥ 18

```bash
# From the project directory
npm install   # nothing to install — dependencies: {}

# Run directly
node src/cli.js --help

# Or link globally
npm link
zero --help
```

---

## 4. Quick Start

```bash
# List everything defined in zero.json
zero list

# Run a single task
zero run api

# Run a whole group (respects dependency graph)
zero group dev
```

---

## 5. Configuration Reference (`zero.json`)

```json
{
  "tasks": {
    "api": {
      "command": "node demo/api.js",
      "env": { "PORT": "4000" }
    },
    "worker": {
      "command": "node demo/worker.js",
      "retries": 3,
      "timeout": 5000
    },
    "frontend": {
      "command": "node demo/frontend.js",
      "dependsOn": ["api"]
    }
  },
  "groups": {
    "dev": {
      "tasks": ["api", "worker", "frontend"],
      "concurrencyLimit": 3
    }
  },
  "shutdownTimeout": 5000
}
```

### Task fields

| Field | Type | Default | Description |
|---|---|---|---|
| `command` | `string` | **required** | Shell command to run |
| `env` | `object` | `{}` | Extra env vars merged into the child's environment |
| `dependsOn` | `string[]` | `[]` | Task names that must reach `SUCCESS` before this task starts |
| `retries` | `integer ≥ 0` | `0` | Additional attempts after the initial one (3 = 4 total) |
| `timeout` | `number` (ms) | `null` | Kill the task after this many milliseconds |

### Group fields

| Field | Type | Default | Description |
|---|---|---|---|
| `tasks` | `string[]` | **required** | Names of tasks to include in this group |
| `concurrencyLimit` | `integer ≥ 1` | `Infinity` | Max tasks in `RUNNING` state simultaneously |

### Top-level fields

| Field | Type | Default | Description |
|---|---|---|---|
| `shutdownTimeout` | `number` (ms) | `5000` | Wait this long for SIGTERM before escalating to SIGKILL |

---

## 6. CLI Reference

```
zero run <task>              Run a single task by name
zero group <group>           Run a named group, respecting the dependency graph
zero list                    List all tasks and groups defined in zero.json
zero build                   Produce the deterministic bundle at dist/zerotask.js
zero --help
zero --version
```

**Optional flags (on `run` and `group`):**

| Flag | Description |
|---|---|
| `--shutdown-timeout <ms>` | Override `shutdownTimeout` from zero.json |
| `--config <path>` | Load a different config file (default: `zero.json`) |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | All selected tasks succeeded |
| `1` | One or more tasks failed |
| `2` | Configuration error |
| `3` | Dependency graph error (cycle detected) |
| `4` | Task or group not found |
| `5` | CLI usage error (bad flags/args) |
| `6` | Task timeout (if it caused overall failure) |
| `7` | Shutdown failure (child unresponsive after escalation) |

### Error message format

```
Error: task "database" was not found.

Available tasks:
  api
  worker
  frontend

Exit code: 4
```

---

## 7. Task Dependencies

The `dependsOn` field creates a directed acyclic graph of tasks. ZeroTask uses Kahn's algorithm to compute a valid execution order at startup and rejects cyclic configurations before any task runs.

```json
{
  "tasks": {
    "db":       { "command": "node db.js" },
    "api":      { "command": "node api.js",      "dependsOn": ["db"] },
    "frontend": { "command": "node frontend.js", "dependsOn": ["api"] }
  }
}
```

In the above config, `zero group dev` will start `db` first, then `api` once `db` exits with code 0 (`SUCCESS`), then `frontend` once `api` succeeds.

**Important:** `dependsOn` refers to task-level success only. If a dependency fails (and exhausts retries), any task that depended on it enters the `SKIPPED` state and never runs. A group run containing any `SKIPPED` task exits with code `1`.

---

## 8. Retries and Backoff

```json
{ "command": "node worker.js", "retries": 3 }
```

- `"retries": 3` means **three additional attempts** after the initial attempt = **4 total maximum**.
- Backoff formula: `delay = min(500ms × 2^(attempt − 1), 10000ms)`

| Attempt | Delay before this attempt |
|---|---|
| 1 (initial) | — |
| 2 | 500 ms |
| 3 | 1 000 ms |
| 4 | 2 000 ms |
| 5 | 4 000 ms |
| 6 | 8 000 ms |
| 7+ | 10 000 ms (capped) |

A task that times out (see §9) counts as a **failure** and **consumes a retry attempt** — timeout is not exempt from the retry budget.

---

## 9. Timeouts

```json
{ "command": "node worker.js", "timeout": 5000, "retries": 2 }
```

- The timeout clock starts the moment the task enters `RUNNING`.
- On expiry: `SIGTERM` is sent to the child.
- If the child has not exited within `shutdownTimeout` ms: `SIGKILL` is sent.
- The task is then treated as a `FAILURE` and retry logic applies (if retries remain).
- If the final attempt times out, the overall exit code is `6`.

---

## 10. Shutdown Behavior

On `SIGINT` (Ctrl+C) or `SIGTERM` received by the ZeroTask process:

1. Stop scheduling any new tasks (including pending retries).
2. Send `SIGTERM` to all currently running child processes.
3. Wait up to `shutdownTimeout` ms for them to exit.
4. Any child still alive after that → send `SIGKILL`.
5. Print a summary of what was stopped.
6. Exit with: `0` if everything had already succeeded, `1` if something was mid-run, `7` if a child had to be force-killed.

> **Note:** ZeroTask attempts graceful termination (SIGTERM, then SIGKILL after `shutdownTimeout`) of directly managed child processes. Process-tree semantics for further descendants (grandchild processes) differ across operating systems and are not guaranteed beyond the directly spawned process.

---

## 11. Architecture

| Module | Responsibility |
|---|---|
| `src/cli.js` | `process.argv` parsing, command dispatch, exit code plumbing. Substitutes: `commander`. |
| `src/config.js` | `zero.json` loading, structural validation, normalization. Substitutes: no library. |
| `src/taskgraph.js` | Dependency graph construction, Kahn's cycle detection, topological sort. Substitutes: no library. |
| `src/processmanager.js` | `child_process.spawn` wrapper, §9 state machine (see below), stdio piping, timeout, `EventEmitter` events. Substitutes: `execa`. |
| `src/retry.js` | `RetryPolicy` class: attempt counting, backoff formula, `sleep()` utility. |
| `src/scheduler.js` | Bounded-concurrency event queue, dependency eligibility checks, retry loop, exit code aggregation. Substitutes: `p-limit`. |
| `src/shutdown.js` | `ShutdownController`: SIGINT/SIGTERM handlers, SIGTERM→SIGKILL escalation, child tracking. |
| `src/logger.js` | ANSI color codes, `[taskname]` prefixed output, strict stdout/stderr routing per §6. Substitutes: `chalk`. |
| `src/envloader.js` | `.env` file parser (P2 — optional), per-task env injection. Substitutes: `dotenv`. |
| `build.js` | Deterministic single-file bundler: static `require()` analysis, topo sort of module graph, CJS shim. Substitutes: `webpack`/`esbuild`. |

**State machine** (`src/processmanager.js` + `src/scheduler.js`):

```
QUEUED → SPAWNING → RUNNING → SUCCESS
                        │
                        └→ FAILURE ──→ retries remaining? ──yes──→ RETRYING → SPAWNING
                                                            ──no───→ FAILED

RUNNING → (timeout expires) → TERMINATING → KILLED  (counts as FAILURE for retry purposes)

QUEUED → SKIPPED  (dependency reached FAILED or SKIPPED; this task never spawns)
```

A group run containing any `FAILED` or `SKIPPED` task exits with code `1`.
A group run where a timeout caused the final failure exits with code `6`.

---

## 12. Examples

### Run a single task

```bash
zero run api
```
```
[api] SPAWNING
[api] RUNNING
[api] API listening on :4000
[api] API heartbeat #1
```

### Run a group with dependency ordering

```bash
zero group dev
```
```
[api]      SPAWNING
[api]      RUNNING
[worker]   SPAWNING
[worker]   RUNNING
[api]      API listening on :4000
[api]      SUCCESS
[frontend] SPAWNING        ← starts ONLY after api succeeds
[frontend] RUNNING
[frontend] Frontend connected to API
```

### Demo: worker crash → retry with backoff

```bash
CRASH_AFTER_MS=1000 zero run worker
```
```
[worker] SPAWNING
[worker] RUNNING
[worker] Worker #1 tick #1
[worker] simulated crash after 1000ms
[worker] FAILURE exit 1
[worker] attempt 1/4 failed — retrying in 500ms
[worker] RETRYING attempt 2/4
[worker] SPAWNING
[worker] RUNNING
...
```

### Demo: timeout → retry → exhausted

```bash
zero run worker   # worker has timeout: 5000, retries: 3
```

Each attempt runs for 5 s then receives SIGTERM → KILLED. After 4 attempts, exits with code `6`.

### Graceful Ctrl+C

```bash
zero group dev
# ... tasks running ...
^C
# ZeroTask received SIGINT — initiating graceful shutdown
# Shutdown: sending SIGTERM to 3 running task(s)...
#   → SIGTERM → [api] (pid 12345)
#   → SIGTERM → [worker] (pid 12346)
#   → SIGTERM → [frontend] (pid 12347)
# Shutdown: stopped [api, worker, frontend].
```

---

## 13. Testing

```bash
npm test
```

The test suite uses **Node's built-in test runner** (`node:test` + `node:assert/strict`) — zero additional dependencies. 70 named test cases across 5 files:

| File | What it covers |
|---|---|
| `tests/config.test.js` | JSON loading, structural validation, normalization, defaults |
| `tests/graph.test.js` | Cycle detection, topological ordering, diamond DAG, transitive deps |
| `tests/process.test.js` | Spawn, stdout/stderr capture, env injection, large output, state machine |
| `tests/retry.test.js` | RetryPolicy unit tests, backoff formula, timing verification, timeout+retry |
| `tests/shutdown.test.js` | ShutdownController, SIGTERM clean exit, SIGKILL escalation, CLI end-to-end |

---

## 14. Reproducible Build

```bash
node build.js
node build.js
# Both runs produce identical dist/zerotask.js

# Verify on Linux/macOS:
sha256sum dist/zerotask.js

# Verify on Windows (PowerShell):
Get-FileHash dist/zerotask.js -Algorithm SHA256
```

The bundle is deterministic because:
- No timestamps or `Date.now()` are embedded.
- No random values or UUIDs appear in the output.
- No machine-specific paths are written to the file.
- Module ordering is stable (Kahn's algorithm, deterministic given the same input graph).

---

## 15. Zero-Dependency Proof

```bash
# Show the dependency tree — should list nothing
npm ls

# Or simply inspect package.json:
cat package.json | grep -A2 '"dependencies"'
# "dependencies": {}
```

At runtime, ZeroTask uses only:
- `child_process` — spawn
- `fs` — config loading, build output
- `path` — path resolution
- `process` — signals, env, exit codes
- `events` (EventEmitter) — state machine events
- `readline` — line-splitting child stdio

No third-party source is vendored or copied in.

---

## 16. Limitations

- **Process-tree orphans:** ZeroTask sends signals to directly spawned children only. If a child itself spawns grandchildren, those grandchildren may survive after ZeroTask exits. This behavior varies across operating systems and is not guaranteed either way.
- **Signal handling on Windows:** `process.kill(pid, signal)` is used directly. On Windows, `SIGTERM` causes immediate termination (not a graceful Unix-style signal delivery). `SIGKILL` behaves the same as `SIGTERM` on Windows. The SIGTERM→SIGKILL escalation therefore still works, but the "graceful" window is effectively zero on Windows. This has not been exhaustively tested across all Windows process-tree edge cases.
- **Command parsing:** ZeroTask splits command strings on whitespace with basic single/double-quote handling. It does **not** support shell features like pipes (`|`), redirects (`>`), subshells (`$()`), or environment variable expansion (`$VAR`) in the `command` field. Wrap complex commands in a script file.
- **Duplicate task names in JSON:** JavaScript's `JSON.parse` silently keeps the last value for duplicate keys. If your `zero.json` contains two tasks with the same name, no error is reported — the second definition wins.
- **Node.js version:** Requires Node 18 or later. `node:test` (built-in test runner) and `crypto.randomUUID()` are not available in older versions.
- **`.env` file loading:** The `src/envloader.js` module is implemented but not wired into the default spawn path. Per-task `env` from `zero.json` is fully supported; loading a `.env` file from disk is a P2 feature.

---

## 17. Package Killer Comparison

See [STDLIB.md](./STDLIB.md) for the full comparison.

**In summary:**

| Feature | `concurrently` | ZeroTask |
|---|---|---|
| Parallel execution | ✅ | ✅ |
| Prefixed output | ✅ | ✅ |
| Restart on failure | ✅ (`restartTries`) | ✅ (`retries`) |
| **Dependency graph** | ❌ | ✅ |
| **Exponential backoff** | ❌ (flat retry) | ✅ |
| **Per-task timeout + escalation** | ❌ | ✅ |
| Third-party dependencies | several | **zero** |
