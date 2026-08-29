'use strict';

/**
 * processmanager.js — Process lifecycle, stdio piping, timeout handling, and PID tracking.
 *
 * State machine:
 *   QUEUED → SPAWNING → RUNNING → SUCCESS
 *                           │
 *                           └→ FAILURE → (handled by retry/scheduler)
 *
 *   RUNNING → (timeout) → TERMINATING → KILLED
 *   QUEUED  → SKIPPED   (when upstream dependency fails)
 */

const { spawn }        = require('child_process');
const { EventEmitter } = require('events');
const readline         = require('readline');
const logger           = require('./logger');

const STATES = Object.freeze({
  QUEUED:      'QUEUED',
  SPAWNING:    'SPAWNING',
  RUNNING:     'RUNNING',
  SUCCESS:     'SUCCESS',
  FAILURE:     'FAILURE',
  TERMINATING: 'TERMINATING',
  KILLED:      'KILLED',
  RETRYING:    'RETRYING',
  FAILED:      'FAILED',
  SKIPPED:     'SKIPPED',
});

class ProcessManager extends EventEmitter {
  /**
   * @param {object} task - Task definition: { name, command, env, dependsOn, retries, timeout }
   * @param {object} [parentEnv=process.env] - Environment to merge task env into.
   */
  constructor(task, parentEnv = process.env) {
    super();

    this.task       = task;
    this.parentEnv  = parentEnv;
    this.state      = STATES.QUEUED;

    this.pid        = null;
    this.exitCode   = null;
    this.signal     = null;
    this.startedAt  = null;
    this.stoppedAt  = null;

    /** @type {import('child_process').ChildProcess | null} */
    this._child         = null;
    this._timeoutHandle = null;
    this._timedOut      = false;
    this._resolved      = false;
  }

  /**
   * Spawns the child process and resolves with exit code upon process completion.
   * Negative exit codes: -1 (timeout killed), -2 (spawn error).
   *
   * @returns {Promise<number>}
   */
  start() {
    return new Promise((resolve) => {
      this._setState(STATES.SPAWNING);

      const [executable, ...args] = _splitCommand(this.task.command);
      const childEnv = Object.assign({}, this.parentEnv, this.task.env);

      let child;
      try {
        child = spawn(executable, args, {
          env:   childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (spawnErr) {
        this._setState(STATES.FAILURE, `spawn error: ${spawnErr.message}`);
        this.emit('exit', -2, null);
        resolve(-2);
        return;
      }

      this._child = child;
      this.pid    = child.pid;
      this.startedAt = Date.now();
      this._setState(STATES.RUNNING);

      // Setup task timeout
      if (this.task.timeout !== null) {
        this._timeoutHandle = setTimeout(() => {
          this._onTimeout(resolve);
        }, this.task.timeout);
      }

      // Pipe stdout
      const rl_out = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
      rl_out.on('line', (line) => {
        logger.taskStdout(this.task.name, line);
        this.emit('stdout', line);
      });

      // Pipe stderr
      const rl_err = readline.createInterface({ input: child.stderr, crlfDelay: Infinity });
      rl_err.on('line', (line) => {
        logger.taskStderr(this.task.name, line);
        this.emit('stderr', line);
      });

      child.on('error', (err) => {
        this._clearTimeout();
        this.stoppedAt = Date.now();
        this._setState(STATES.FAILURE, `spawn error: ${err.message}`);
        this.emit('exit', -2, null);
        resolve(-2);
      });

      child.on('close', (code, signal) => {
        if (this._resolved) return;

        this._clearTimeout();
        this.stoppedAt = Date.now();
        this.exitCode  = code;
        this.signal    = signal;

        if (this._timedOut) {
          this._resolved = true;
          if (this.state !== STATES.KILLED) {
            this._setState(STATES.KILLED, 'killed by timeout');
          }
          this.emit('exit', -1, 'timeout');
          resolve(-1);
          return;
        }

        this._resolved = true;

        if (code === 0) {
          this._setState(STATES.SUCCESS);
          this.emit('exit', 0, null);
          resolve(0);
        } else {
          this._setState(STATES.FAILURE, code !== null ? `exit ${code}` : `signal ${signal}`);
          this.emit('exit', code ?? -1, signal);
          resolve(code ?? -1);
        }
      });
    });
  }

  /**
   * Sends SIGTERM to the running child process.
   */
  terminate() {
    if (this._child && this.state === STATES.RUNNING) {
      this._setState(STATES.TERMINATING);
      try {
        process.kill(this._child.pid, 'SIGTERM');
      } catch (_) {
        // Process may have already exited
      }
    }
  }

  /**
   * Sends SIGKILL to the child process.
   */
  kill() {
    if (this._child) {
      try {
        process.kill(this._child.pid, 'SIGKILL');
      } catch (_) {
        // Process may have already exited
      }
    }
  }

  /**
   * Returns true if the child process is currently alive.
   *
   * @returns {boolean}
   */
  isAlive() {
    return (
      this.state === STATES.SPAWNING ||
      this.state === STATES.RUNNING  ||
      this.state === STATES.TERMINATING
    );
  }

  _setState(newState, detail) {
    this.state = newState;
    logger.stateChange(this.task.name, newState, detail);
    this.emit('state', newState, detail);
  }

  _clearTimeout() {
    if (this._timeoutHandle) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }
  }

  /**
   * Handles timeout: sends SIGTERM, waits for shutdown grace period, then escalates to SIGKILL.
   *
   * @param {Function} resolve
   */
  _onTimeout(resolve) {
    if (this.state !== STATES.RUNNING) return;

    this._timedOut = true;
    logger.info(`[${this.task.name}] timeout after ${this.task.timeout}ms — sending SIGTERM`);
    this._setState(STATES.TERMINATING, `timeout ${this.task.timeout}ms`);

    try {
      process.kill(this._child.pid, 'SIGTERM');
    } catch (_) { /* already exited */ }

    const escalationMs = this._shutdownTimeout || 5000;

    const killTimer = setTimeout(() => {
      if (!this._resolved) {
        logger.warn(`[${this.task.name}] did not exit after SIGTERM; sending SIGKILL`);
        this._setState(STATES.KILLED, 'SIGKILL after timeout escalation');
        try {
          process.kill(this._child.pid, 'SIGKILL');
        } catch (_) { /* already exited */ }
      }
    }, escalationMs);

    this._child.once('close', () => {
      clearTimeout(killTimer);
    });
  }
}

/**
 * Splits a command line string into [executable, ...args] with basic quoting support.
 *
 * @param {string} command
 * @returns {string[]}
 */
function _splitCommand(command) {
  const tokens = [];
  let current  = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

module.exports = { ProcessManager, STATES };
