'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parseEnvFile, buildChildEnv } = require('../src/envloader.js');

test('envloader — parseEnvFile', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-env-test-'));
  const envFile = path.join(tmpDir, '.env');

  await t.test('returns empty object when file does not exist', () => {
    const result = parseEnvFile(path.join(tmpDir, 'nonexistent.env'));
    assert.deepStrictEqual(result, {});
  });

  await t.test('parses simple key=value pairs', () => {
    fs.writeFileSync(envFile, 'FOO=bar\nBAZ=qux\n');
    const result = parseEnvFile(envFile);
    assert.strictEqual(result.FOO, 'bar');
    assert.strictEqual(result.BAZ, 'qux');
  });

  await t.test('strips double and single quotes', () => {
    fs.writeFileSync(envFile, 'KEY1="quoted value"\nKEY2=\'single quoted\'\n');
    const result = parseEnvFile(envFile);
    assert.strictEqual(result.KEY1, 'quoted value');
    assert.strictEqual(result.KEY2, 'single quoted');
  });

  await t.test('ignores comments and empty lines', () => {
    fs.writeFileSync(envFile, '# Comment line\n\n   # Another comment\nVALID=1\n');
    const result = parseEnvFile(envFile);
    assert.strictEqual(result.VALID, '1');
    assert.strictEqual(Object.keys(result).length, 1);
  });

  await t.test('handles equals signs inside values', () => {
    fs.writeFileSync(envFile, 'DB_URL=postgres://user:pass@host/db?sslmode=disable\n');
    const result = parseEnvFile(envFile);
    assert.strictEqual(result.DB_URL, 'postgres://user:pass@host/db?sslmode=disable');
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('envloader — buildChildEnv', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-env-merge-'));
  const envFile = path.join(tmpDir, '.env');
  fs.writeFileSync(envFile, 'FROM_FILE=file_val\nSHARED=file_shared\n');

  await t.test('merges process.env, file env, and task env with correct precedence', () => {
    const taskEnv = { SHARED: 'task_shared', TASK_ONLY: 'task_val' };
    const merged = buildChildEnv(taskEnv, envFile);

    assert.strictEqual(merged.FROM_FILE, 'file_val');
    assert.strictEqual(merged.SHARED, 'task_shared'); // task env overrides file env
    assert.strictEqual(merged.TASK_ONLY, 'task_val');
    assert.ok(merged.PATH !== undefined || merged.Path !== undefined); // inherited from process.env
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
