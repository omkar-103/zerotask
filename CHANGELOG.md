# Changelog

All notable changes to **ZeroTask** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-29

### Added
- **Zero-Dependency Architecture**: 100% standard library implementation relying strictly on Node.js core modules.
- **DAG Task Graph**: Directed Acyclic Graph engine with Kahn's algorithm cycle detection and topological ordering.
- **Process Orchestration**: Real-time concurrent subprocess management with piped I/O demuxing.
- **Exponential Backoff**: Jittered exponential retry mechanism with per-task configurable retry count.
- **Graceful Shutdown Controller**: Clean SIGINT/SIGTERM trapping with configurable timeout and SIGKILL escalation.
- **Environment Loader**: RFC-compliant `.env` tokenizer and environment composition.
- **JSON Schema**: Editor completion and schema validation for `zero.json`.
- **Standalone Bundler**: Single-file bundler in `build.js` producing sub-50KB zero-dependency artifact `dist/zerotask.js`.
- **Test Suite**: 87 comprehensive unit and integration tests across 22 test suites with 100% pass rate.
- **CI/CD Integration**: Matrix testing workflow on Ubuntu, macOS, and Windows across Node.js 18, 20, and 22.
