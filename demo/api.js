'use strict';

/**
 * demo/api.js — Fake API server for ZeroTask demo.
 *
 * Simulates a server that takes a moment to start, then runs indefinitely.
 * Exits cleanly on SIGTERM/SIGINT.
 *
 * Environment variables:
 *   PORT — which port to pretend to listen on (default: 4000)
 */

const PORT = process.env.PORT || '4000';

// Simulate startup delay (real servers take time to bind, load config, etc.)
setTimeout(() => {
  process.stdout.write(`API listening on :${PORT}\n`);
  process.stdout.write(`API ready to serve requests\n`);
}, 500);

// Emit periodic heartbeat so the demo shows ongoing output
let tick = 0;
const heartbeat = setInterval(() => {
  tick++;
  process.stdout.write(`API heartbeat #${tick}\n`);
}, 3000);

function shutdown() {
  clearInterval(heartbeat);
  process.stdout.write(`API shutting down gracefully\n`);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
