# STDLIB.md

## Section 1 — Package Killer: `concurrently`

```
Normally: concurrently "node demo/api.js" "node demo/worker.js" "node demo/frontend.js"
ZeroTask:  zero group dev
```

**Implemented via:** `child_process.spawn`, `process`, `events.EventEmitter`, `readline`

**Feature parity with concurrently:**
- Parallel execution of multiple processes
- Prefixed stdout/stderr output per task (`[taskname]`)
- Process lifecycle tracking (QUEUED → RUNNING → SUCCESS/FAILED)
- Exit-code aggregation across all tasks
- Graceful shutdown on SIGINT (Ctrl+C) with SIGTERM propagation
- Restart-on-failure (`retries` field in zero.json)

**What ZeroTask adds that concurrently does not have:**

- **Dependency-aware execution ordering** — concurrently has no dependency graph; all processes start immediately. ZeroTask's `dependsOn` field ensures a task only starts after all its named dependencies have reached `SUCCESS`.
- **Exponential backoff on retry** — concurrently's `restartTries` is a flat counter with no delay between attempts. ZeroTask uses `delay = min(500ms × 2^(attempt−1), 10000ms)`, giving progressively longer pauses before each retry.
- **Per-task timeout with SIGTERM→SIGKILL escalation** — concurrently has no per-task timeout mechanism. ZeroTask's `timeout` field starts a clock the moment the process enters `RUNNING`; on expiry it sends `SIGTERM`, waits up to `shutdownTimeout` ms, then sends `SIGKILL`. A timeout counts as a failure and consumes a retry attempt.

---

## Section 2 — STDLIB Substitution Log

| Normally you'd reach for | ZeroTask uses instead | Why |
|---|---|---|
| `commander` | `process.argv` (manual parse in `src/cli.js`) | Fixed, small command surface — 4 commands and 2 flags — doesn't justify a library |
| `dotenv` | Custom line-by-line parser in `src/envloader.js` using `fs` | `.env` format is trivial: split on `\n`, skip `#` lines, split on first `=` |
| `concurrently` | `child_process.spawn` + dependency graph + `events.EventEmitter` | See Package Killer above |
| `execa` | `child_process.spawn` directly | `spawn` already streams stdio, exposes exit codes, and accepts env — execa adds no value here |
| `chalk` | Raw ANSI escape codes (`\x1b[32m` etc.) in `src/logger.js` | Fixed palette of ~8 colors; embedding a 200-line library for color output is disproportionate |
| `cross-env` | Per-task child environment built at spawn time (`Object.assign({}, process.env, task.env)`) | We construct the child's `env` object directly in `processmanager.js` — no wrapper binary needed |
| `p-limit` | Custom bounded-concurrency event queue in `src/scheduler.js` | Queue is ~30 lines built on `EventEmitter`; importing a library for this would be circular irony given the project's purpose |
| `ora` | `readline` for line-buffered output with `[taskname]` prefix | No spinner state needed — prefixed line output is sufficient and integrates naturally with `readline.createInterface` |
