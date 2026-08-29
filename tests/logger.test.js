'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ANSI, STATE_COLORS, taskStdout, taskStderr, stateChange, info, warn, error } = require('../src/logger.js');

test('logger — ANSI color definitions', (t) => {
  assert.ok(ANSI.reset, 'ANSI.reset should exist');
  assert.ok(ANSI.cyan, 'ANSI.cyan should exist');
  assert.ok(ANSI.green, 'ANSI.green should exist');
  assert.ok(ANSI.yellow, 'ANSI.yellow should exist');
  assert.ok(ANSI.red, 'ANSI.red should exist');
});

test('logger — STATE_COLORS mapping', (t) => {
  assert.strictEqual(STATE_COLORS.SUCCESS, ANSI.green);
  assert.strictEqual(STATE_COLORS.FAILED, ANSI.red);
  assert.strictEqual(STATE_COLORS.RUNNING, ANSI.cyan);
  assert.strictEqual(STATE_COLORS.QUEUED, ANSI.dim);
});

test('logger — output stream methods exist and execute without throw', (t) => {
  assert.strictEqual(typeof taskStdout, 'function');
  assert.strictEqual(typeof taskStderr, 'function');
  assert.strictEqual(typeof stateChange, 'function');
  assert.strictEqual(typeof info, 'function');
  assert.strictEqual(typeof warn, 'function');
  assert.strictEqual(typeof error, 'function');

  // Check calls
  assert.doesNotThrow(() => {
    info('Test info message');
    warn('Test warning message');
    error('Test error message');
    stateChange('test-task', 'RUNNING');
    stateChange('test-task', 'SUCCESS', 'completed in 12ms');
    taskStdout('test-task', 'sample stdout');
    taskStderr('test-task', 'sample stderr');
  });
});
