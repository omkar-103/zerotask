'use strict';

/**
 * tests/graph.test.js
 *
 * Tests for taskgraph.js: cycle detection, topological ordering, adjacency list.
 */

const { test, describe } = require('node:test');
const assert             = require('node:assert/strict');

const { buildGraph, detectCycle, topoSort, allDependencies } = require('../src/taskgraph');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a normalized task map from a simple { name: [deps] } object. */
function makeTasks(spec) {
  const tasks = {};
  for (const [name, deps] of Object.entries(spec)) {
    tasks[name] = { name, command: `node ${name}.js`, env: {}, dependsOn: deps, retries: 0, timeout: null };
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('taskgraph — acyclic graphs', () => {
  test('single task with no deps', () => {
    const graph = buildGraph(makeTasks({ a: [] }));
    assert.equal(detectCycle(graph), null);
    assert.deepEqual(topoSort(graph), ['a']);
  });

  test('linear chain: a → b → c', () => {
    // b depends on a, c depends on b
    const graph = buildGraph(makeTasks({ a: [], b: ['a'], c: ['b'] }));
    assert.equal(detectCycle(graph), null);
    const order = topoSort(graph);
    // a must come before b, b before c
    assert.ok(order.indexOf('a') < order.indexOf('b'));
    assert.ok(order.indexOf('b') < order.indexOf('c'));
  });

  test('parallel tasks (no deps between them)', () => {
    const graph = buildGraph(makeTasks({ a: [], b: [], c: [] }));
    assert.equal(detectCycle(graph), null);
    const order = topoSort(graph);
    assert.equal(order.length, 3);
    assert.ok(order.includes('a') && order.includes('b') && order.includes('c'));
  });

  test('diamond DAG: a → b, a → c, b → d, c → d', () => {
    const tasks = makeTasks({ a: [], b: ['a'], c: ['a'], d: ['b', 'c'] });
    const graph = buildGraph(tasks);
    assert.equal(detectCycle(graph), null);
    const order = topoSort(graph);
    assert.ok(order.indexOf('a') < order.indexOf('b'));
    assert.ok(order.indexOf('a') < order.indexOf('c'));
    assert.ok(order.indexOf('b') < order.indexOf('d'));
    assert.ok(order.indexOf('c') < order.indexOf('d'));
  });

  test('multiple independent chains', () => {
    const graph = buildGraph(makeTasks({ a: [], b: ['a'], x: [], y: ['x'] }));
    assert.equal(detectCycle(graph), null);
    const order = topoSort(graph);
    assert.ok(order.indexOf('a') < order.indexOf('b'));
    assert.ok(order.indexOf('x') < order.indexOf('y'));
  });
});

describe('taskgraph — cycle detection', () => {
  test('self-loop (a depends on itself)', () => {
    const graph = buildGraph(makeTasks({ a: ['a'] }));
    const cycle = detectCycle(graph);
    assert.notEqual(cycle, null);
    assert.ok(Array.isArray(cycle));
    assert.ok(cycle.includes('a'));
  });

  test('simple 2-node cycle: a → b → a', () => {
    const graph = buildGraph(makeTasks({ a: ['b'], b: ['a'] }));
    const cycle = detectCycle(graph);
    assert.notEqual(cycle, null);
    assert.ok(cycle.includes('a') && cycle.includes('b'));
    // Cycle path should start and end with the same node
    assert.equal(cycle[0], cycle[cycle.length - 1]);
  });

  test('3-node cycle: a → b → c → a', () => {
    const graph = buildGraph(makeTasks({ a: ['c'], b: ['a'], c: ['b'] }));
    const cycle = detectCycle(graph);
    assert.notEqual(cycle, null);
    assert.ok(cycle.length >= 4); // at least [x, y, z, x]
    assert.equal(cycle[0], cycle[cycle.length - 1]);
  });

  test('cycle with innocent bystander (d has no deps, a→b→c→a)', () => {
    const graph = buildGraph(makeTasks({ a: ['c'], b: ['a'], c: ['b'], d: [] }));
    const cycle = detectCycle(graph);
    assert.notEqual(cycle, null);
    assert.ok(!cycle.includes('d')); // d is not part of the cycle
  });

  test('acyclic graph returns null (not an empty array)', () => {
    const graph = buildGraph(makeTasks({ a: [], b: ['a'] }));
    assert.equal(detectCycle(graph), null);
  });
});

describe('taskgraph — allDependencies', () => {
  test('no deps returns empty set', () => {
    const graph = buildGraph(makeTasks({ a: [], b: [], c: [] }));
    assert.equal(allDependencies(graph, 'a').size, 0);
  });

  test('direct dep is included', () => {
    const graph = buildGraph(makeTasks({ a: [], b: ['a'] }));
    const deps = allDependencies(graph, 'b');
    assert.ok(deps.has('a'));
  });

  test('transitive deps are included', () => {
    const graph = buildGraph(makeTasks({ a: [], b: ['a'], c: ['b'] }));
    const deps = allDependencies(graph, 'c');
    assert.ok(deps.has('a') && deps.has('b'));
  });
});
