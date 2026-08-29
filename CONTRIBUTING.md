# Contributing to ZeroTask

Thank you for your interest in contributing to ZeroTask!

## Zero-Dependency Constraint

ZeroTask has a strict zero-dependency policy for runtime code:
- **`dependencies` must always remain empty `{}`.**
- All features must be implemented using Node.js built-in modules (`child_process`, `fs`, `path`, `events`, `readline`, `process`, `os`).

## Development Workflow

1. Clone the repository:
   ```bash
   git clone https://github.com/omkar-103/zerotask.git
   cd zerotask
   ```

2. Run the test suite:
   ```bash
   npm test
   ```

3. Run benchmarks:
   ```bash
   npm run bench
   ```

4. Build the standalone bundle:
   ```bash
   npm run build
   ```

5. Verify all pre-release checks:
   ```bash
   npm run verify
   ```

## Coding Guidelines

- Write clean, well-tested JavaScript (Node >= 18 syntax).
- Maintain 100% test coverage for new features using `node:test` and `node:assert`.
- Follow standard camelCase for variables/functions and PascalCase for classes.
- Ensure cross-platform compatibility across Windows, Linux, and macOS.
