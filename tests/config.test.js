'use strict';

/**
 * tests/config.test.js
 *
 * Tests for config.js: loading, validation, error messages, exit codes.
 * Uses Node's built-in test runner (node --test, available since Node 18).
 */

const { test, describe }      = require('node:test');
const assert                  = require('node:assert/strict');
const fs                      = require('fs');
const path                    = require('path');
const os                      = require('os');

const { loadConfig } = require('../src/config');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a temporary zero.json and return the file path. */
function tmpConfig(content, dir) {
  const d    = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'zerotask-'));
  const file = path.join(d, 'zero.json');
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('config — file loading', () => {
  test('missing config file → exit code 2', () => {
    const err = assert.throws(
      () => loadConfig('/nonexistent/path/zero.json'),
      (e) => {
        assert.equal(e.exitCode, 2);
        assert.match(e.message, /not found/i);
        return true;
      }
    );
  });

  test('malformed JSON → exit code 2', () => {
    const file = tmpConfig('{ this is not json }');
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        assert.match(e.message, /malformed json/i);
        return true;
      }
    );
  });

  test('valid config loads successfully', () => {
    const file = tmpConfig({
      tasks: {
        api: { command: 'node api.js' },
      },
    });
    const config = loadConfig(file);
    assert.ok(config.tasks.api);
    assert.equal(config.tasks.api.command, 'node api.js');
    assert.deepEqual(config.tasks.api.dependsOn, []);
    assert.equal(config.tasks.api.retries, 0);
    assert.equal(config.tasks.api.timeout, null);
  });
});

describe('config — tasks validation', () => {
  test('missing tasks key → exit code 2', () => {
    const file = tmpConfig({ groups: {} });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        assert.match(e.message, /tasks/i);
        return true;
      }
    );
  });

  test('tasks is an array (not object) → exit code 2', () => {
    const file = tmpConfig({ tasks: [] });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        return true;
      }
    );
  });

  test('task missing command → exit code 2', () => {
    const file = tmpConfig({ tasks: { api: { env: {} } } });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        assert.match(e.message, /command/i);
        return true;
      }
    );
  });

  test('unknown dependsOn reference → exit code 2', () => {
    const file = tmpConfig({
      tasks: {
        frontend: { command: 'node f.js', dependsOn: ['nonexistent'] },
      },
    });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        assert.match(e.message, /nonexistent/);
        return true;
      }
    );
  });

  test('invalid retries (negative) → exit code 2', () => {
    const file = tmpConfig({ tasks: { t: { command: 'x', retries: -1 } } });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        return true;
      }
    );
  });

  test('invalid retries (float) → exit code 2', () => {
    const file = tmpConfig({ tasks: { t: { command: 'x', retries: 1.5 } } });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        return true;
      }
    );
  });

  test('invalid timeout (zero) → exit code 2', () => {
    const file = tmpConfig({ tasks: { t: { command: 'x', timeout: 0 } } });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        return true;
      }
    );
  });

  test('env value must be string → exit code 2', () => {
    const file = tmpConfig({ tasks: { t: { command: 'x', env: { PORT: 4000 } } } });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        return true;
      }
    );
  });
});

describe('config — groups validation', () => {
  test('group referencing unknown task → exit code 2', () => {
    const file = tmpConfig({
      tasks: { api: { command: 'node api.js' } },
      groups: { dev: { tasks: ['api', 'nonexistent'] } },
    });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        assert.match(e.message, /nonexistent/);
        return true;
      }
    );
  });

  test('group without tasks array → exit code 2', () => {
    const file = tmpConfig({
      tasks: { api: { command: 'node api.js' } },
      groups: { dev: { concurrencyLimit: 2 } }, // no tasks key
    });
    assert.throws(
      () => loadConfig(file),
      (e) => {
        assert.equal(e.exitCode, 2);
        return true;
      }
    );
  });
});

describe('config — duplicate task names (JSON.parse behavior)', () => {
  // JSON.parse silently collapses duplicate keys — the last value wins.
  // config.js sees a perfectly valid single-key object and cannot detect
  // the original duplication. Asserting an error here would be a false test.
  //
  // Instead, these tests document and assert the ACTUAL runtime behavior so
  // a reader knows exactly what happens and a regression will be caught if
  // the behavior ever changes (e.g. if a raw-text scan is added to config.js).

  test('duplicate task keys in raw JSON: last definition silently wins', () => {
    // Write raw JSON with two "api" keys — JSON.parse keeps the last one.
    const raw = JSON.stringify({
      tasks: {
        api: { command: 'node api.js' },
      },
    });
    // Manually inject a second "api" key before the closing brace of tasks
    const withDuplicate = raw.replace(
      '"api":{"command":"node api.js"}',
      '"api":{"command":"node api.js"},"api":{"command":"node SECOND.js"}'
    );
    const file = tmpConfig(withDuplicate);
    // loadConfig should NOT throw — JSON.parse already collapsed the duplicate.
    const config = loadConfig(file);
    // The SECOND definition wins (JSON.parse last-value-wins).
    assert.equal(config.tasks.api.command, 'node SECOND.js',
      'last duplicate key silently overwrites earlier one');
    // Only one task exists in the result
    assert.equal(Object.keys(config.tasks).length, 1);
  });

  test('no error is thrown for duplicate keys (current behavior is silent)', () => {
    // This is the documented limitation from README §16:
    // ZeroTask cannot detect duplicate task names because JSON.parse
    // removes them before any validation code sees the object.
    const raw = '{"tasks":{"a":{"command":"x"},"a":{"command":"y"}}}'
    const file = tmpConfig(raw);
    assert.doesNotThrow(() => loadConfig(file));
  });
});

describe('config — normalization', () => {
  test('defaults are applied correctly', () => {
    const file = tmpConfig({
      tasks: { t: { command: 'node t.js' } },
    });
    const config = loadConfig(file);
    assert.equal(config.tasks.t.retries,  0);
    assert.equal(config.tasks.t.timeout,  null);
    assert.deepEqual(config.tasks.t.env, {});
    assert.deepEqual(config.tasks.t.dependsOn, []);
    assert.equal(config.shutdownTimeout, 5000);
  });

  test('shutdownTimeout from config is used', () => {
    const file = tmpConfig({
      tasks:           { t: { command: 'x' } },
      shutdownTimeout: 3000,
    });
    const config = loadConfig(file);
    assert.equal(config.shutdownTimeout, 3000);
  });

  test('concurrencyLimit defaults to Infinity', () => {
    const file = tmpConfig({
      tasks:  { t: { command: 'x' } },
      groups: { g: { tasks: ['t'] } },
    });
    const config = loadConfig(file);
    assert.equal(config.groups.g.concurrencyLimit, Infinity);
  });
});

