'use strict';

/**
 * tests/process.test.js
 *
 * Tests for processmanager.js: spawn, stdio capture, exit codes, error handling.
 */

const { test, describe } = require('node:test');
const assert             = require('node:assert/strict');

const { ProcessManager, STATES } = require('../src/processmanager');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides = {}) {
  return {
    name:      overrides.name      ?? 'test-task',
    command:   overrides.command   ?? 'node -e "process.exit(0)"',
    env:       overrides.env       ?? {},
    dependsOn: overrides.dependsOn ?? [],
    retries:   overrides.retries   ?? 0,
    timeout:   overrides.timeout   ?? null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processmanager — successful execution', () => {
  test('exits with code 0 → SUCCESS state', async () => {
    const pm = new ProcessManager(makeTask({ command: 'node -e "process.exit(0)"' }));
    const code = await pm.start();
    assert.equal(code, 0);
    assert.equal(pm.state, STATES.SUCCESS);
  });

  test('stdout lines are emitted and prefixed', async () => {
    const lines = [];
    const pm = new ProcessManager(makeTask({ command: 'node -e "console.log(\'hello\')"', name: 'stdout-test' }));
    pm.on('stdout', l => lines.push(l));
    await pm.start();
    assert.equal(lines[0], 'hello');
  });

  test('multiple stdout lines all captured', async () => {
    const lines = [];
    const pm = new ProcessManager(makeTask({
      command: 'node -e "console.log(1); console.log(2); console.log(3)"',
      name: 'multi-line',
    }));
    pm.on('stdout', l => lines.push(l));
    await pm.start();
    assert.deepEqual(lines, ['1', '2', '3']);
  });

  test('per-task env is injected into child', async () => {
    const lines = [];
    const pm = new ProcessManager(makeTask({
      command: 'node -e "process.stdout.write(process.env.MY_VAR + \'\\n\')"',
      env:     { MY_VAR: 'injected_value' },
      name:    'env-test',
    }));
    pm.on('stdout', l => lines.push(l));
    await pm.start();
    assert.equal(lines[0], 'injected_value');
  });

  test('pid is tracked after spawn', async () => {
    const pm = new ProcessManager(makeTask({ command: 'node -e "process.exit(0)"', name: 'pid-test' }));
    await pm.start();
    assert.ok(typeof pm.pid === 'number');
    assert.ok(pm.pid > 0);
  });

  test('startedAt and stoppedAt are set', async () => {
    const pm = new ProcessManager(makeTask({ command: 'node -e "process.exit(0)"', name: 'timing-test' }));
    const before = Date.now();
    await pm.start();
    const after = Date.now();
    assert.ok(pm.startedAt >= before);
    assert.ok(pm.stoppedAt <= after);
    assert.ok(pm.stoppedAt >= pm.startedAt);
  });
});

describe('processmanager — failure handling', () => {
  test('non-zero exit → FAILURE state', async () => {
    const pm = new ProcessManager(makeTask({ command: 'node -e "process.exit(42)"', name: 'fail-42' }));
    const code = await pm.start();
    assert.equal(code, 42);
    assert.equal(pm.state, STATES.FAILURE);
  });

  test('exit code propagates correctly', async () => {
    for (const exitCode of [1, 2, 127]) {
      const pm = new ProcessManager(makeTask({
        command: `node -e "process.exit(${exitCode})"`,
        name: `exit-${exitCode}`,
      }));
      const code = await pm.start();
      assert.equal(code, exitCode, `Expected exit code ${exitCode}`);
    }
  });

  test('stderr lines are emitted on stderr (not stdout)', async () => {
    const errLines = [];
    const outLines = [];
    const pm = new ProcessManager(makeTask({
      command: 'node -e "process.stderr.write(\'err-line\\n\')"',
      name:    'stderr-test',
    }));
    pm.on('stdout', l => outLines.push(l));
    pm.on('stderr', l => errLines.push(l));
    await pm.start();
    assert.equal(errLines[0], 'err-line');
    assert.equal(outLines.length, 0); // stderr MUST NOT appear in stdout
  });

  test('command not found → FAILURE state', async () => {
    const pm = new ProcessManager(makeTask({
      command: 'this_executable_does_not_exist_zerotask_test',
      name:    'notfound',
    }));
    const code = await pm.start();
    assert.equal(pm.state, STATES.FAILURE);
    // Exit code is -2 (synthetic spawn error)
    assert.ok(code < 0);
  });

  test('instant exit (process.exit immediately) → correct exit code', async () => {
    const pm = new ProcessManager(makeTask({
      command: 'node -e "process.exit(3)"',
      name:    'instant',
    }));
    const code = await pm.start();
    assert.equal(code, 3);
    assert.equal(pm.state, STATES.FAILURE);
  });
});

describe('processmanager — large stdout', () => {
  test('very large stdout output does not drop lines', async () => {
    const lineCount = 500;
    const lines = [];
    // Write 500 lines to stdout
    const pm = new ProcessManager(makeTask({
      command: `node -e "for(let i=0;i<${lineCount};i++) console.log('line-' + i)"`,
      name:    'large-stdout',
    }));
    pm.on('stdout', l => lines.push(l));
    await pm.start();
    assert.equal(lines.length, lineCount);
    assert.equal(lines[0], 'line-0');
    assert.equal(lines[lineCount - 1], `line-${lineCount - 1}`);
  });
});

describe('processmanager — state transitions', () => {
  test('states are emitted in correct order', async () => {
    const states = [];
    const pm = new ProcessManager(makeTask({ command: 'node -e "process.exit(0)"', name: 'states-ok' }));
    pm.on('state', s => states.push(s));
    await pm.start();
    assert.deepEqual(states, [STATES.SPAWNING, STATES.RUNNING, STATES.SUCCESS]);
  });

  test('failure state is emitted before resolve', async () => {
    const states = [];
    const pm = new ProcessManager(makeTask({ command: 'node -e "process.exit(1)"', name: 'states-fail' }));
    pm.on('state', s => states.push(s));
    await pm.start();
    assert.ok(states.includes(STATES.FAILURE));
    assert.ok(!states.includes(STATES.SUCCESS));
  });
});
