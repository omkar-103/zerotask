'use strict';

/**
 * config.js — Configuration loader and validator for zero.json.
 */

const fs   = require('fs');
const path = require('path');

const DEFAULT_SHUTDOWN_TIMEOUT = 5000;

/**
 * Creates an Error with an attached exitCode for CLI reporting.
 *
 * @param {string} message
 * @param {number} [exitCode=2]
 * @returns {Error}
 */
function configError(message, exitCode = 2) {
  const err = new Error(message);
  err.exitCode = exitCode;
  return err;
}

/**
 * Loads and validates zero.json from the specified path.
 *
 * @param {string} configPath - Path to config file (relative to cwd).
 * @returns {{ tasks: object, groups: object, shutdownTimeout: number }}
 * @throws {Error} With .exitCode set on validation failure.
 */
function loadConfig(configPath) {
  const resolved = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolved)) {
    throw configError(`Configuration file not found: ${resolved}`);
  }

  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (e) {
    throw configError(`Cannot read configuration file "${resolved}": ${e.message}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    throw configError(`Malformed JSON in "${resolved}": ${e.message}`);
  }

  if (
    config.tasks === undefined ||
    typeof config.tasks !== 'object' ||
    Array.isArray(config.tasks)
  ) {
    throw configError('Configuration must have a "tasks" object at the top level.');
  }

  const taskNames = Object.keys(config.tasks);

  if (taskNames.length === 0) {
    throw configError('Configuration "tasks" object must not be empty.');
  }

  // Validate tasks
  for (const name of taskNames) {
    const task = config.tasks[name];

    if (typeof task !== 'object' || Array.isArray(task) || task === null) {
      throw configError(`Task "${name}" must be an object.`);
    }

    if (!task.command || typeof task.command !== 'string') {
      throw configError(`Task "${name}" must have a "command" string.`);
    }

    if (task.dependsOn !== undefined) {
      if (!Array.isArray(task.dependsOn)) {
        throw configError(`Task "${name}" "dependsOn" must be an array.`);
      }
      for (const dep of task.dependsOn) {
        if (typeof dep !== 'string') {
          throw configError(`Task "${name}" "dependsOn" entries must be strings.`);
        }
        if (!config.tasks[dep]) {
          throw configError(
            `Task "${name}" dependsOn unknown task "${dep}".\n\nAvailable tasks:\n` +
            taskNames.map(t => `  ${t}`).join('\n')
          );
        }
      }
    }

    if (task.retries !== undefined) {
      if (
        typeof task.retries !== 'number' ||
        !Number.isInteger(task.retries) ||
        task.retries < 0
      ) {
        throw configError(`Task "${name}" "retries" must be a non-negative integer.`);
      }
    }

    if (task.timeout !== undefined) {
      if (typeof task.timeout !== 'number' || task.timeout <= 0) {
        throw configError(`Task "${name}" "timeout" must be a positive number (milliseconds).`);
      }
    }

    if (task.env !== undefined) {
      if (typeof task.env !== 'object' || Array.isArray(task.env) || task.env === null) {
        throw configError(`Task "${name}" "env" must be a key-value object.`);
      }
      for (const [k, v] of Object.entries(task.env)) {
        if (typeof v !== 'string') {
          throw configError(`Task "${name}" env["${k}"] must be a string.`);
        }
      }
    }
  }

  // Validate groups
  const rawGroups = config.groups || {};

  if (typeof rawGroups !== 'object' || Array.isArray(rawGroups)) {
    throw configError('Configuration "groups" must be an object.');
  }

  for (const [groupName, group] of Object.entries(rawGroups)) {
    if (typeof group !== 'object' || Array.isArray(group) || group === null) {
      throw configError(`Group "${groupName}" must be an object.`);
    }

    if (!Array.isArray(group.tasks)) {
      throw configError(`Group "${groupName}" must have a "tasks" array.`);
    }

    for (const ref of group.tasks) {
      if (typeof ref !== 'string') {
        throw configError(`Group "${groupName}" task references must be strings.`);
      }
      if (!config.tasks[ref]) {
        throw configError(
          `Group "${groupName}" references unknown task "${ref}".\n\nAvailable tasks:\n` +
          taskNames.map(t => `  ${t}`).join('\n')
        );
      }
    }

    if (
      group.concurrencyLimit !== undefined &&
      (!Number.isInteger(group.concurrencyLimit) || group.concurrencyLimit < 1)
    ) {
      throw configError(`Group "${groupName}" "concurrencyLimit" must be a positive integer.`);
    }
  }

  // Validate shutdownTimeout
  if (
    config.shutdownTimeout !== undefined &&
    (typeof config.shutdownTimeout !== 'number' || config.shutdownTimeout <= 0)
  ) {
    throw configError('"shutdownTimeout" must be a positive number (milliseconds).');
  }

  // Normalize configuration
  const tasks = {};
  for (const [name, task] of Object.entries(config.tasks)) {
    tasks[name] = {
      name,
      command:    task.command,
      env:        task.env       ?? {},
      dependsOn:  task.dependsOn ?? [],
      retries:    task.retries   ?? 0,
      timeout:    task.timeout   ?? null,
    };
  }

  const groups = {};
  for (const [name, group] of Object.entries(rawGroups)) {
    groups[name] = {
      name,
      tasks:            group.tasks,
      concurrencyLimit: group.concurrencyLimit ?? Infinity,
    };
  }

  return {
    tasks,
    groups,
    shutdownTimeout: config.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT,
  };
}

module.exports = { loadConfig };
