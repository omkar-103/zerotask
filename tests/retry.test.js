'use strict';

/**
 * tests/retry.test.js
 *
 * Tests for retry.js: backoff formula, retry exhaustion, timing verification.
 * Also tests the retry loop in the scheduler (end-to-end retry behavior).
 */

const { test, describe } = require('node:test');
const assert             = require('node:assert/strict');

const { RetryPolicy, sleep, BASE_DELAY, MAX_DELAY } = require('../src/retry');
const { runSingleTask } = require('../src/scheduler');

// ---------------------------------------------------------------------------
// Unit tests — RetryPolicy
// ---------------------------------------------------------------------------

describe('RetryPolicy — construction', () => {
  test('"retries": 3 → 4 total attempts', () => {
    const p = new RetryPolicy(3);
    assert.equal(p.totalAttempts(), 4);
    assert.equal(p.maxRetries, 3);
  });

  test('"retries": 0 → 1 total attempt (no retries)', () => {
    const p = new RetryPolicy(0);
    assert.equal(p.totalAttempts(), 1);
  });
});

describe('RetryPolicy — canRetry', () => {
  test('canRetry() is true while attempts < maxRetries + 1', () => {
    const p = new RetryPolicy(2); // 3 total
    p.attempt(); // attempt 1
    assert.ok(p.canRetry()); // can retry: 2 attempts left
    p.attempt(); // attempt 2
    assert.ok(p.canRetry()); // can retry: 1 attempt left
    p.attempt(); // attempt 3
    assert.ok(!p.canRetry()); // exhausted
  });

  test('canRetry() is false immediately with retries=0 after first attempt', () => {
    const p = new RetryPolicy(0);
    p.attempt();
    assert.ok(!p.canRetry());
  });
});

describe('RetryPolicy — backoff formula', () => {
  test('attempt 1 → 500ms', () => {
    const p = new RetryPolicy(5);
    p.attempt(); // attempt 1
    assert.equal(p.nextDelay(), 500);
  });

  test('attempt 2 → 1000ms', () => {
    const p = new RetryPolicy(5);
    p.attempt(); p.attempt();
    assert.equal(p.nextDelay(), 1000);
  });

  test('attempt 3 → 2000ms', () => {
    const p = new RetryPolicy(5);
    p.attempt(); p.attempt(); p.attempt();
    assert.equal(p.nextDelay(), 2000);
  });

  test('attempt 4 → 4000ms', () => {
    const p = new RetryPolicy(5);
    p.attempt(); p.attempt(); p.attempt(); p.attempt();
    assert.equal(p.nextDelay(), 4000);
  });

  test('attempt 5 → 8000ms', () => {
    const p = new RetryPolicy(5);
    for (let i = 0; i < 5; i++) p.attempt();
    assert.equal(p.nextDelay(), 8000);
  });

  test('attempt 6 → 10000ms (capped at maxDelay)', () => {
    const p = new RetryPolicy(10);
    for (let i = 0; i < 6; i++) p.attempt();
    assert.equal(p.nextDelay(), 10000);
  });

  test('attempt 10 → 10000ms (still capped)', () => {
    const p = new RetryPolicy(20);
    for (let i = 0; i < 10; i++) p.attempt();
    assert.equal(p.nextDelay(), MAX_DELAY);
  });

  test('formula constants: BASE_DELAY=500, MAX_DELAY=10000', () => {
    assert.equal(BASE_DELAY, 500);
    assert.equal(MAX_DELAY, 10000);
  });
});

describe('RetryPolicy — progressLabel', () => {
  test('label reflects current attempt and total', () => {
    const p = new RetryPolicy(3); // 4 total
    p.attempt();
    assert.equal(p.progressLabel(), 'attempt 1/4');
    p.attempt();
    assert.equal(p.progressLabel(), 'attempt 2/4');
  });
});

describe('RetryPolicy — sleep utility', () => {
  test('sleep resolves after approximately the given duration', async () => {
    const ms    = 100;
    const start = Date.now();
    await sleep(ms);
    const elapsed = Date.now() - start;
    // Allow ±50ms tolerance
    assert.ok(elapsed >= ms - 10, `Expected >= ${ms}ms, got ${elapsed}ms`);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — retry loop via scheduler
// ---------------------------------------------------------------------------

function makeConfig(taskOverrides) {
  const task = {
    name:      'task',
    command:   'node -e "process.exit(1)"',
    env:       {},
    dependsOn: [],
    retries:   0,
    timeout:   null,
    ...taskOverrides,
  };
  return {
    tasks: { [task.name]: task },
    groups: {},
    shutdownTimeout: 5000,
  };
}

describe('retry integration — scheduler', () => {
  test('task with retries=0 fails on first attempt', async () => {
    const config = makeConfig({ retries: 0 });
    const code   = await runSingleTask(config.tasks.task, config);
    assert.equal(code, 1);
  });

  test('task with retries=1 makes exactly 2 attempts', async () => {
    // We measure timing: 1 retry delay = 500ms → elapsed should be ≥ 500ms
    const t0     = Date.now();
    const config = makeConfig({ retries: 1 });
    const code   = await runSingleTask(config.tasks.task, config);
    const elapsed = Date.now() - t0;
    assert.equal(code, 1);
    assert.ok(elapsed >= 450, `Expected >= 450ms for 1 retry, got ${elapsed}ms`);
  });

  test('task with retries=2: backoff timing ~ 500 + 1000 = 1500ms', async () => {
    const t0     = Date.now();
    const config = makeConfig({ retries: 2 });
    const code   = await runSingleTask(config.tasks.task, config);
    const elapsed = Date.now() - t0;
    assert.equal(code, 1);
    assert.ok(elapsed >= 1400, `Expected >= 1400ms for 2 retries, got ${elapsed}ms`);
  });

  test('timeout counts as a failure that consumes a retry attempt', async () => {
    // Task runs "forever" but has a short timeout + 1 retry.
    // Expect: attempt 1 times out (500ms), waits 500ms, attempt 2 times out (500ms).
    // Total: ~1500ms + overheads. Exit code = 6.
    const t0 = Date.now();
    const config = makeConfig({
      name:    'timeout-retry',
      command: 'node -e "setTimeout(()=>{},30000)"',
      timeout: 500,
      retries: 1,
    });
    const code = await runSingleTask(config.tasks['timeout-retry'], config);
    const elapsed = Date.now() - t0;
    // Exit code 6 = timeout caused the failure
    assert.equal(code, 6);
    // Should take at least 500+500+500 = 1500ms (two timeouts + one backoff)
    assert.ok(elapsed >= 1200, `Expected >= 1200ms, got ${elapsed}ms`);
  });

  test('retry exhaustion → final state FAILED (exit code 1)', async () => {
    const config = makeConfig({ retries: 2 });
    const code   = await runSingleTask(config.tasks.task, config);
    assert.equal(code, 1);
  });
});
