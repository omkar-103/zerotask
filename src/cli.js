#!/usr/bin/env node
'use strict';

/**
 * cli.js — CLI argument parsing, command dispatch, and entry point.
 */

const path = require('path');
const { loadConfig }              = require('./config');
const { buildGraph, detectCycle } = require('./taskgraph');
const logger                      = require('./logger');
const { runSingleTask, runGroup } = require('./scheduler');

const VERSION = '1.0.0';

const HELP_TEXT = `
ZeroTask — zero-dependency task runner and process orchestrator for Node.js
Hackathon Raptors · Zero Dependency 2026

Usage:
  zero run <task>              Run a single task by name
  zero group <group>           Run a named group, respecting the dependency graph
  zero list                    List all tasks and groups defined in zero.json
  zero build                   Produce the deterministic bundle at dist/zerotask.js
  zero --help                  Show this help message
  zero --version               Show version number

Options (on "run" and "group"):
  --shutdown-timeout <ms>      Override shutdownTimeout from zero.json
  --config <path>              Path to config file (default: zero.json)

Exit codes:
  0  All selected tasks succeeded
  1  One or more tasks failed
  2  Configuration error
  3  Dependency graph error (cycle detected)
  4  Task or group not found
  5  CLI usage error (bad flags/args)
  6  Task timeout (if it caused overall failure)
  7  Shutdown failure (child unresponsive after escalation)

Examples:
  zero list
  zero run api
  zero group dev
  zero group dev --shutdown-timeout 3000
`.trimStart();

const VALID_COMMANDS = ['run', 'group', 'list', 'build'];

/**
 * Parses process.argv.slice(2) into a structured args object.
 *
 * @param {string[]} argv
 * @returns {{ command: string|null, target: string|null, configPath: string, shutdownTimeout: number|null, errors: string[] }}
 */
function parseArgs(argv) {
  const args = {
    command:         null,
    target:          null,
    configPath:      'zero.json',
    shutdownTimeout: null,
    errors:          [],
  };

  if (argv.length === 0) {
    args.command = 'help';
    return args;
  }

  // Top-level flags
  if (argv[0] === '--help' || argv[0] === '-h') {
    args.command = 'help';
    return args;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    args.command = 'version';
    return args;
  }

  // Command
  if (!VALID_COMMANDS.includes(argv[0])) {
    args.errors.push(`Unknown command "${argv[0]}". Valid commands: ${VALID_COMMANDS.join(', ')}.`);
    return args;
  }
  args.command = argv[0];

  let i = 1;

  // Target argument (required for run/group)
  if (args.command === 'run' || args.command === 'group') {
    if (!argv[i] || argv[i].startsWith('--')) {
      args.errors.push(`"zero ${args.command}" requires a name argument.`);
      return args;
    }
    args.target = argv[i];
    i++;
  }

  // Optional flags
  while (i < argv.length) {
    const flag = argv[i];

    if (flag === '--shutdown-timeout') {
      i++;
      const raw = argv[i];
      if (raw === undefined) {
        args.errors.push('--shutdown-timeout requires a value (milliseconds).');
        break;
      }
      const val = Number(raw);
      if (!Number.isInteger(val) || val <= 0) {
        args.errors.push(`--shutdown-timeout must be a positive integer, got "${raw}".`);
      } else {
        args.shutdownTimeout = val;
      }
      i++;

    } else if (flag === '--config') {
      i++;
      if (!argv[i]) {
        args.errors.push('--config requires a file path argument.');
        break;
      }
      args.configPath = argv[i];
      i++;

    } else {
      args.errors.push(`Unknown flag "${flag}".`);
      i++;
    }
  }

  return args;
}

/**
 * Writes standard error message and exit code to stderr.
 *
 * @param {string} message
 * @param {number} code
 */
function exitWithError(message, code) {
  process.stderr.write(`${message}\n\nExit code: ${code}\n`);
  process.exitCode = code;
}

/** List all tasks and groups */
function cmdList(config) {
  const taskNames  = Object.keys(config.tasks);
  const groupNames = Object.keys(config.groups);

  let out = 'Tasks:\n';
  for (const name of taskNames) {
    out += `  ${name}\n`;
  }
  out += '\nGroups:\n';
  if (groupNames.length === 0) {
    out += '  (none)\n';
  } else {
    for (const name of groupNames) {
      out += `  ${name}\n`;
    }
  }
  process.stdout.write(out);
}

/** Run bundler to generate dist/zerotask.js */
function cmdBuild() {
  const buildScript = path.join(__dirname, '..', 'build.js');
  try {
    delete require.cache[require.resolve(buildScript)];
    require(buildScript);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      exitWithError('Error: build.js not found.', 1);
    } else {
      exitWithError(`Error: build failed — ${e.message}`, 1);
    }
  }
}

/** Run a single task by name */
async function cmdRun(args, config) {
  const { target } = args;

  if (!config.tasks[target]) {
    const taskList = Object.keys(config.tasks).map(t => `  ${t}`).join('\n');
    exitWithError(
      `Error: task "${target}" was not found.\n\nAvailable tasks:\n${taskList}`,
      4
    );
    return;
  }

  try {
    const exitCode = await runSingleTask(config.tasks[target], config);
    process.exitCode = exitCode;
  } catch (e) {
    exitWithError(`Error: ${e.message}`, 1);
  }
}

/** Run a task group by name */
async function cmdGroup(args, config) {
  const { target } = args;

  if (!config.groups[target]) {
    const groupList = Object.keys(config.groups).map(g => `  ${g}`).join('\n');
    exitWithError(
      `Error: group "${target}" was not found.\n\nAvailable groups:\n${groupList}`,
      4
    );
    return;
  }

  try {
    const exitCode = await runGroup(config.groups[target], config);
    process.exitCode = exitCode;
  } catch (e) {
    exitWithError(`Error: ${e.message}`, 1);
  }
}

/** CLI Entry point */
async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.errors.length > 0) {
    const messages = args.errors.join('\n');
    exitWithError(
      `Error: ${messages}\n\nRun "zero --help" for usage information.`,
      5
    );
    return;
  }

  if (args.command === 'help') {
    process.stdout.write(HELP_TEXT);
    return;
  }
  if (args.command === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  // Load configuration
  let config;
  try {
    config = loadConfig(args.configPath);
  } catch (e) {
    exitWithError(`Error: ${e.message}`, e.exitCode ?? 2);
    return;
  }

  // Validate dependency graph for cycles
  const graph = buildGraph(config.tasks);
  const cycle = detectCycle(graph);
  if (cycle) {
    exitWithError(
      `Error: dependency graph error — cyclic dependency detected.\n  Cycle: ${cycle.join(' \u2192 ')}`,
      3
    );
    return;
  }

  // Apply CLI overrides
  if (args.shutdownTimeout !== null) {
    config.shutdownTimeout = args.shutdownTimeout;
  }

  // Dispatch command
  switch (args.command) {
    case 'list':
      cmdList(config);
      break;

    case 'build':
      cmdBuild();
      break;

    case 'run':
      await cmdRun(args, config);
      break;

    case 'group':
      await cmdGroup(args, config);
      break;

    default:
      exitWithError(`Error: unhandled command "${args.command}".`, 5);
  }
}

main().catch(e => {
  exitWithError(`Error: unexpected error — ${e.message}`, 1);
});
