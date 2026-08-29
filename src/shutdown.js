'use strict';

/**
 * shutdown.js — Graceful SIGINT/SIGTERM handling, process tracking, and SIGKILL escalation.
 *
 * Sequence:
 *   1. Stop scheduling new tasks / retries.
 *   2. Send SIGTERM to running child processes.
 *   3. Wait up to shutdownTimeout ms for processes to exit.
 *   4. Force kill (SIGKILL) any surviving processes.
 */

const logger = require('./logger');

class ShutdownController {
  /**
   * @param {number} shutdownTimeout - Milliseconds to wait before escalating to SIGKILL.
   */
  constructor(shutdownTimeout) {
    this.shutdownTimeout = shutdownTimeout;

    /** @type {Set<import('./processmanager').ProcessManager>} */
    this._running   = new Set();

    this._shuttingDown   = false;
    this._stopScheduling = null;
    this._exitCode       = 0;
  }

  /**
   * Registers a callback invoked to halt scheduling new tasks.
   *
   * @param {Function} fn
   */
  onStop(fn) {
    this._stopScheduling = fn;
  }

  /**
   * Tracks an active ProcessManager instance for cleanup during shutdown.
   *
   * @param {import('./processmanager').ProcessManager} pm
   */
  track(pm) {
    this._running.add(pm);
    pm.once('exit', () => this._running.delete(pm));
  }

  /**
   * Registers signal listeners for SIGINT and SIGTERM.
   */
  install() {
    const handler = (signal) => this._onSignal(signal);
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.on('SIGINT',  () => handler('SIGINT'));
    process.on('SIGTERM', () => handler('SIGTERM'));
  }

  /**
   * Triggers programmatic shutdown (e.g. at end of run or in tests).
   *
   * @param {number} exitCode
   */
  async initiateShutdown(exitCode) {
    if (this._shuttingDown) return;
    this._exitCode = exitCode;
    await this._shutdown('programmatic');
  }

  _onSignal(signal) {
    logger.info(`\nZeroTask received ${signal} — initiating graceful shutdown`);
    if (this._shuttingDown) {
      logger.warn('Shutdown already in progress; forcing SIGKILL on all children.');
      for (const pm of this._running) pm.kill();
      return;
    }
    this._exitCode = 1;
    this._shutdown(signal).then(() => {
      process.exit(this._exitCode);
    });
  }

  async _shutdown(reason) {
    this._shuttingDown = true;

    if (this._stopScheduling) {
      this._stopScheduling();
    }

    const alive = [...this._running].filter(pm => pm.isAlive());

    if (alive.length === 0) {
      logger.info('Shutdown: no running tasks to stop.');
      return;
    }

    logger.info(`Shutdown: sending SIGTERM to ${alive.length} running task(s)...`);

    // Send SIGTERM to all alive children
    const stopped = [];
    for (const pm of alive) {
      logger.info(`  → SIGTERM → [${pm.task.name}] (pid ${pm.pid})`);
      pm.terminate();
    }

    // Wait for graceful exit up to timeout
    await this._waitForAll(alive);

    // Escalate to SIGKILL for any survivors
    const survivors = alive.filter(pm => pm.isAlive());
    let forceKilled = false;
    for (const pm of survivors) {
      logger.warn(`  → SIGKILL → [${pm.task.name}] (pid ${pm.pid}) — did not exit in ${this.shutdownTimeout}ms`);
      pm.kill();
      forceKilled = true;
    }

    for (const pm of alive) {
      stopped.push(pm.task.name);
    }
    logger.info(`Shutdown: stopped [${stopped.join(', ')}].`);

    if (forceKilled) {
      this._exitCode = 7;
    }
  }

  /**
   * Waits up to shutdownTimeout for all given ProcessManagers to exit.
   *
   * @param {ProcessManager[]} pms
   * @returns {Promise<void>}
   */
  _waitForAll(pms) {
    return new Promise(resolve => {
      let remaining = pms.filter(pm => pm.isAlive()).length;
      if (remaining === 0) { resolve(); return; }

      const timer = setTimeout(() => {
        resolve();
      }, this.shutdownTimeout);

      for (const pm of pms) {
        pm.once('exit', () => {
          remaining--;
          if (remaining === 0) {
            clearTimeout(timer);
            resolve();
          }
        });
      }
    });
  }
}

module.exports = { ShutdownController };
