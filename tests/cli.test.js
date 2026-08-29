'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '../src/cli.js');

test('cli — flag handling', async (t) => {
  await t.test('--help outputs usage guide', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, '--help'], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0);
    assert.ok(res.stdout.includes('Usage: zero') || res.stdout.includes('ZeroTask'));
  });

  await t.test('--version outputs package version', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, '--version'], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0);
    assert.ok(res.stdout.includes('1.0.0'));
  });

  await t.test('--config with nonexistent file exits with error', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, '--config', 'nonexistent_file.json'], { encoding: 'utf8' });
    assert.notStrictEqual(res.status, 0);
  });
});
