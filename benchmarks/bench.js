'use strict';

/**
 * benchmarks/bench.js — Micro-benchmark measuring task graph resolution and config loading latency.
 */

const { buildGraph, detectCycle, topoSort } = require('../src/taskgraph.js');
const { loadConfig } = require('../src/config.js');

function benchmarkTaskGraph(iterations = 10000) {
  const dummyTasks = {};
  for (let i = 0; i < 20; i++) {
    dummyTasks[`task_${i}`] = {
      command: `echo ${i}`,
      dependsOn: i > 0 ? [`task_${i - 1}`] : []
    };
  }

  const start = performance.now();
  for (let iter = 0; iter < iterations; iter++) {
    const graph = buildGraph(dummyTasks);
    detectCycle(graph);
    topoSort(graph);
  }
  const duration = performance.now() - start;
  const opsPerSec = Math.round((iterations / (duration / 1000)));

  console.log(`[TaskGraph Benchmark] ${iterations} DAG builds with 20 nodes:`);
  console.log(`  Total time: ${duration.toFixed(2)} ms`);
  console.log(`  Throughput: ${opsPerSec.toLocaleString()} ops/sec\n`);
}

function benchmarkConfigLoading(iterations = 5000) {
  const start = performance.now();
  for (let iter = 0; iter < iterations; iter++) {
    loadConfig('zero.json');
  }
  const duration = performance.now() - start;
  const opsPerSec = Math.round((iterations / (duration / 1000)));

  console.log(`[Config Loader Benchmark] ${iterations} zero.json reads & validations:`);
  console.log(`  Total time: ${duration.toFixed(2)} ms`);
  console.log(`  Throughput: ${opsPerSec.toLocaleString()} ops/sec\n`);
}

console.log('--- ZeroTask Performance Benchmarks ---');
benchmarkTaskGraph();
benchmarkConfigLoading();
console.log('Benchmarks completed successfully.');
