# ADR 0001: Zero Third-Party Runtime Dependencies

## Status

Accepted

## Context

Most modern developer tooling and CLI utilities in the JavaScript/Node.js ecosystem depend on dozens to hundreds of transient packages (e.g. `chalk`, `commander`, `glob`, `dotenv`, `cross-spawn`, `p-queue`). While convenient, this creates significant supply chain risks, install latency, version drift, and dependency conflicts.

For the **Zero Dependency 2026** hackathon, we set an absolute constraint: zero third-party packages in `dependencies`.

## Decision

We implement all orchestration features using exclusively Node.js standard library modules (Node.js >= 18):
- `child_process`: Subprocess execution, streaming I/O, signals.
- `events`: Event-driven state machine and lifecycle hooks.
- `readline`: Line buffering for concurrent log demuxing.
- `fs` / `path`: Configuration parsing and `.env` parsing.
- `process`: Signal traps, exit handling, standard I/O control.

We implemented:
1. **DAG Resolution & Cycle Detection**: Kahn's algorithm and topological sort from scratch.
2. **Exponential Backoff**: Jittered / geometric backoff with zero dependencies.
3. **Log Formatter & ANSI Engine**: Standard terminal escape sequence mapping.
4. **Environment Parser**: RFC-compliant `.env` tokenizer.
5. **Standalone Bundler**: Single-file artifact generator in `build.js`.

## Consequences

### Positive
- **Instant Installation**: Zero download overhead, instant startup.
- **Zero Supply Chain Vulnerability**: Immune to npm ecosystem supply chain hijacking.
- **Ultra-Portable**: Runs anywhere Node.js >= 18 is installed.
- **Lightweight**: Bundle footprint < 50KB.

### Negative
- All utilities and algorithms must be maintained in-house with comprehensive unit test coverage.
