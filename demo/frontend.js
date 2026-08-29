'use strict';

/**
 * demo/frontend.js — Fake frontend for ZeroTask demo.
 *
 * Simulates a frontend bundler/dev-server that depends on the API being up
 * before it can connect. In zero.json, this task has "dependsOn": ["api"],
 * so ZeroTask will not start it until api reaches SUCCESS.
 *
 * (In reality, a frontend process might poll an API endpoint; here we just
 * print a message to make the dependency visible in demo output.)
 */

process.stdout.write(`Frontend starting (API should already be running)...\n`);

setTimeout(() => {
  process.stdout.write(`Frontend connected to API\n`);
  process.stdout.write(`Frontend dev server ready at http://localhost:3000\n`);
}, 800);

// Periodic output
let tick = 0;
const interval = setInterval(() => {
  tick++;
  process.stdout.write(`Frontend rebuild #${tick} complete\n`);
}, 4000);

function shutdown() {
  clearInterval(interval);
  process.stdout.write(`Frontend shutting down\n`);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
