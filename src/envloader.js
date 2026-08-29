'use strict';

/**
 * envloader.js — .env file parsing and child process environment composition.
 */

const fs   = require('fs');
const path = require('path');

/**
 * Parses a .env file into a key-value object.
 * Returns {} if the file does not exist.
 *
 * @param {string} envFilePath - Absolute or relative path to .env file.
 * @returns {Object<string, string>}
 */
function parseEnvFile(envFilePath) {
  const resolved = path.resolve(envFilePath);

  if (!fs.existsSync(resolved)) {
    return {};
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const result  = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key   = line.slice(0, eqIndex).trim();
    let   value = line.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"')  && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

/**
 * Merges process.env, .env file variables, and task-specific environment variables.
 *
 * @param {Object<string, string>} taskEnv - Per-task env overrides.
 * @param {string} [dotEnvPath='.env']     - Path to .env file.
 * @returns {Object<string, string>}
 */
function buildChildEnv(taskEnv, dotEnvPath = '.env') {
  const fileEnv = parseEnvFile(dotEnvPath);
  return Object.assign({}, process.env, fileEnv, taskEnv);
}

module.exports = { parseEnvFile, buildChildEnv };
