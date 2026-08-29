'use strict';

/**
 * scheduler.js — Bounded concurrency task queue and dependency execution engine.
 */

const { EventEmitter }   = require('events');
const { ProcessManager, STATES } = require('./processmanager');
const { buildGraph }     = require('./taskgraph');
const { RetryPolicy, sleep } = require('./retry');
const { ShutdownController } = require('./shutdown');
const logger             = require('./logger');

/**
 * @typedef {object} RunResult
 * @property {string}  name      - Task name
 * @property {string}  state     - Final state (STATES enum)
 * @property {number}  exitCode  - Final process exit code
 * @property {number}  attempts  - Number of attempts made
 * @property {boolean} timedOut  - True if failure was due to timeout
 */

/**
 * Runs a single task with retries and timeout handling.
 *
 * @param {object} task   - Task definition
 * @param {object} config - Full configuration
 * @returns {Promise<number>} - Exit code
 */
async function runSingleTask(task, config) {
  const shutdown = new ShutdownController(config.shutdownTimeout);
  shutdown.install();

  const result = await _runTaskWithRetry(task, config, shutdown);

  if (result.state === STATES.SUCCESS) return 0;
  if (result.timedOut)                 return 6;
  return 1;
}

/**
 * Runs all tasks in a group respecting dependencies and concurrency limits.
 *
 * @param {object} group   - Group definition: { name, tasks, concurrencyLimit }
 * @param {object} config  - Full configuration
 * @returns {Promise<number>} - Overall exit code
 */
async function runGroup(group, config) {
  const shutdown = new ShutdownController(config.shutdownTimeout);
  shutdown.install();

  // Restrict dependency graph to tasks present in this group
  const groupTaskMap = {};
  for (const name of group.tasks) {
    groupTaskMap[name] = config.tasks[name];
  }
  const graph = buildGraph(groupTaskMap);

  const taskStates = new Map();
  for (const name of group.tasks) {
    taskStates.set(name, STATES.QUEUED);
  }

  /** @type {Map<string, RunResult>} */
  const results = new Map();
  const bus = new EventEmitter();

  let runningCount = 0;
  let shuttingDown = false;

  shutdown.onStop(() => { shuttingDown = true; });

  /**
   * Identifies tasks eligible to run based on completed dependencies.
   * Marks tasks as SKIPPED if any upstream dependency failed.
   */
  function getEligible() {
    const eligible = [];
    for (const name of group.tasks) {
      if (taskStates.get(name) !== STATES.QUEUED) continue;

      const deps = graph.get(name) || [];
      const allDepsDone = deps.every(dep => taskStates.get(dep) === STATES.SUCCESS);
      const anyDepFailed = deps.some(dep => {
        const s = taskStates.get(dep);
        return s === STATES.FAILED || s === STATES.FAILURE || s === STATES.SKIPPED;
      });

      if (anyDepFailed) {
        taskStates.set(name, STATES.SKIPPED);
        results.set(name, {
          name,
          state:    STATES.SKIPPED,
          exitCode: null,
          attempts: 0,
          timedOut: false,
          skipped:  true,
        });
        logger.info(`[${name}] SKIPPED — dependency failed`);
        continue;
      }

      if (allDepsDone) eligible.push(name);
    }
    return eligible;
  }

  /**
   * Checks whether all group tasks have reached a terminal state.
   */
  function allDone() {
    for (const name of group.tasks) {
      const s = taskStates.get(name);
      if (s !== STATES.SUCCESS && s !== STATES.FAILED && s !== STATES.SKIPPED && s !== STATES.FAILURE) {
        if (s === STATES.QUEUED) {
          const deps = graph.get(name) || [];
          const blocked = deps.some(dep => {
            const ds = taskStates.get(dep);
            return ds === STATES.FAILED || ds === STATES.FAILURE || ds === STATES.SKIPPED;
          });
          if (!blocked) return false;
        } else {
          return false;
        }
      }
    }
    return true;
  }

  return new Promise((resolve) => {
    function tick() {
      if (shuttingDown) return;

      getEligible();

      if (allDone()) {
        resolve(_groupExitCode(results, group.tasks));
        return;
      }

      const eligible = getEligible().filter(
        name => taskStates.get(name) === STATES.QUEUED
      );

      const slots = group.concurrencyLimit - runningCount;
      const toStart = eligible.slice(0, slots);

      for (const name of toStart) {
        taskStates.set(name, STATES.RUNNING);
        runningCount++;

        _runTaskWithRetry(config.tasks[name], config, shutdown)
          .then(result => {
            results.set(name, result);
            taskStates.set(name, result.state);
            runningCount--;
            bus.emit('done', name);
          });
      }
    }

    bus.on('done', () => tick());
    tick();
  });
}

/**
 * Executes a single task with retries and exponential backoff.
 *
 * @param {object} task
 * @param {object} config
 * @param {ShutdownController} shutdown
 * @returns {Promise<RunResult>}
 */
async function _runTaskWithRetry(task, config, shutdown) {
  const policy = new RetryPolicy(task.retries);
  let lastExitCode = null;
  let timedOut     = false;

  while (true) {
    policy.attempt();
    const label = policy.progressLabel();

    if (policy.attemptNumber > 1) {
      logger.stateChange(task.name, STATES.RETRYING, label);
    }

    const pm = new ProcessManager(task, process.env);
    pm._shutdownTimeout = config.shutdownTimeout;
    shutdown.track(pm);

    const exitCode = await pm.start();
    lastExitCode = exitCode;

    if (exitCode === -1) timedOut = true;

    if (pm.state === STATES.SUCCESS) {
      return { name: task.name, state: STATES.SUCCESS, exitCode: 0, attempts: policy.attemptNumber, timedOut: false };
    }

    // Check if retries are exhausted
    if (!policy.canRetry()) {
      logger.stateChange(task.name, STATES.FAILED, `after ${policy.attemptNumber} attempt(s)`);
      return {
        name:     task.name,
        state:    STATES.FAILED,
        exitCode: lastExitCode,
        attempts: policy.attemptNumber,
        timedOut,
      };
    }

    // Exponential backoff before next attempt
    const delay = policy.nextDelay();
    logger.info(`[${task.name}] ${policy.progressLabel()} failed — retrying in ${delay}ms`);
    await sleep(delay);
  }
}

/**
 * Computes overall exit code from task execution results.
 * Precedence: timeout (6) > failure (1) > success (0).
 *
 * @param {Map<string, RunResult>} results
 * @param {string[]} taskNames
 * @returns {number}
 */
function _groupExitCode(results, taskNames) {
  let anyTimeout = false;
  let anyFailure = false;

  for (const name of taskNames) {
    const r = results.get(name);
    if (!r) continue;
    if (r.state === STATES.FAILED || r.state === STATES.FAILURE) {
      anyFailure = true;
      if (r.timedOut) anyTimeout = true;
    }
    if (r.state === STATES.SKIPPED) {
      anyFailure = true;
    }
  }

  if (anyTimeout) return 6;
  if (anyFailure) return 1;
  return 0;
}

module.exports = { runSingleTask, runGroup };
