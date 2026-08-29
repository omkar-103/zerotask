'use strict';

/**
 * demo/worker.js — Fake worker for ZeroTask demo.
 *
 * Designed to reliably trigger crash + retry scenarios.
 *
 * Environment variables:
 *   CRASH_ON_START=1        — exit with code 1 immediately (for retry demo)
 *   CRASH_AFTER_MS=<ms>     — exit with code 1 after N ms (default: unset = runs forever)
 *   WORKER_ID=<id>          — identifier printed in output (useful when retrying)
 */

const CRASH_ON_START  = process.env.CRASH_ON_START  === '1';
const CRASH_AFTER_MS  = process.env.CRASH_AFTER_MS ? parseInt(process.env.CRASH_AFTER_MS, 10) : null;
const WORKER_ID       = process.env.WORKER_ID || '1';

process.stdout.write(`Worker #${WORKER_ID} starting\n`);

if (CRASH_ON_START) {
  process.stderr.write(`Worker #${WORKER_ID} crash on start (CRASH_ON_START=1)\n`);
  process.exit(1);
}

if (CRASH_AFTER_MS !== null) {
  process.stdout.write(`Worker #${WORKER_ID} will crash after ${CRASH_AFTER_MS}ms\n`);
  setTimeout(() => {
    process.stderr.write(`Worker #${WORKER_ID} simulated crash after ${CRASH_AFTER_MS}ms\n`);
    process.exit(1);
  }, CRASH_AFTER_MS);
} else {
  process.stdout.write(`Worker #${WORKER_ID} running (no crash configured)\n`);
}

// Periodic progress output
let tick = 0;
const interval = setInterval(() => {
  tick++;
  process.stdout.write(`Worker #${WORKER_ID} tick #${tick}\n`);
}, 2000);

function shutdown() {
  clearInterval(interval);
  process.stdout.write(`Worker #${WORKER_ID} shutting down\n`);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
