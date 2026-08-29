'use strict';

/**
 * logger.js — Prefixed terminal output, ANSI formatting, and stream routing.
 */

const ANSI = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
};

const STATE_COLORS = {
  QUEUED:      ANSI.dim,
  SPAWNING:    ANSI.cyan,
  RUNNING:     ANSI.cyan,
  SUCCESS:     ANSI.green,
  FAILURE:     ANSI.yellow,
  RETRYING:    ANSI.yellow,
  FAILED:      ANSI.red,
  TERMINATING: ANSI.yellow,
  KILLED:      ANSI.red,
};

const PREFIX_PALETTE = [
  ANSI.cyan,
  ANSI.magenta,
  ANSI.green,
  ANSI.yellow,
  ANSI.blue,
  '\x1b[96m',  // bright cyan
  '\x1b[95m',  // bright magenta
  '\x1b[93m',  // bright yellow
];

const _taskColors = new Map();
let _paletteIndex = 0;

/**
 * Returns a consistent ANSI color string for the given task name.
 *
 * @param {string} taskName
 * @returns {string}
 */
function _colorForTask(taskName) {
  if (!_taskColors.has(taskName)) {
    _taskColors.set(taskName, PREFIX_PALETTE[_paletteIndex % PREFIX_PALETTE.length]);
    _paletteIndex++;
  }
  return _taskColors.get(taskName);
}

/**
 * Formats the [taskname] prefix with its assigned color.
 *
 * @param {string} taskName
 * @returns {string}
 */
function _prefix(taskName) {
  const color = _colorForTask(taskName);
  return `${color}[${taskName}]${ANSI.reset} `;
}

/**
 * Writes a line from a task's stdout to process.stdout with prefix.
 *
 * @param {string} taskName
 * @param {string} line
 */
function taskStdout(taskName, line) {
  process.stdout.write(_prefix(taskName) + line + '\n');
}

/**
 * Writes a line from a task's stderr to process.stderr with prefix.
 *
 * @param {string} taskName
 * @param {string} line
 */
function taskStderr(taskName, line) {
  process.stderr.write(_prefix(taskName) + line + '\n');
}

/**
 * Logs a state transition event for a task to process.stdout.
 *
 * @param {string} taskName
 * @param {string} state
 * @param {string} [detail]
 */
function stateChange(taskName, state, detail) {
  const color = STATE_COLORS[state] || ANSI.reset;
  const suffix = detail ? ` ${ANSI.dim}${detail}${ANSI.reset}` : '';
  process.stdout.write(`${_prefix(taskName)}${color}${state}${ANSI.reset}${suffix}\n`);
}

/**
 * Logs an informational message to process.stdout.
 *
 * @param {string} message
 */
function info(message) {
  process.stdout.write(`${message}\n`);
}

/**
 * Logs a warning message to process.stderr.
 *
 * @param {string} message
 */
function warn(message) {
  process.stderr.write(`${ANSI.yellow}warn${ANSI.reset}  ${message}\n`);
}

/**
 * Logs an error message to process.stderr.
 *
 * @param {string} message
 */
function error(message) {
  process.stderr.write(`${ANSI.red}error${ANSI.reset} ${message}\n`);
}

module.exports = { taskStdout, taskStderr, stateChange, info, warn, error, ANSI, STATE_COLORS };
