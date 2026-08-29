'use strict';

/**
 * taskgraph.js — Dependency resolution, cycle detection, and topological ordering.
 */

/**
 * Builds a dependency adjacency list from the normalized task map.
 *
 * @param {Object<string, {dependsOn: string[]}>} tasks
 * @returns {Map<string, string[]>}
 */
function buildGraph(tasks) {
  const graph = new Map();
  for (const [name, task] of Object.entries(tasks)) {
    graph.set(name, task.dependsOn.slice());
  }
  return graph;
}

/**
 * Detects cycles in the dependency graph using Kahn's algorithm.
 * Returns array representing cycle path (e.g. ['a','b','a']) or null if acyclic.
 *
 * @param {Map<string, string[]>} graph
 * @returns {string[] | null}
 */
function detectCycle(graph) {
  const inDegree = new Map();
  for (const node of graph.keys()) {
    inDegree.set(node, graph.get(node).length);
  }

  const queue = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }

  let processed = 0;

  while (queue.length > 0) {
    const node = queue.shift();
    processed++;

    for (const [dependent, deps] of graph) {
      if (deps.includes(node)) {
        const newDeg = inDegree.get(dependent) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }
  }

  if (processed === graph.size) {
    return null;
  }

  return _findCyclePath(graph);
}

/**
 * Returns a valid topological execution order (dependencies before dependents).
 *
 * @param {Map<string, string[]>} graph
 * @returns {string[]}
 */
function topoSort(graph) {
  const inDegree = new Map();
  for (const node of graph.keys()) {
    inDegree.set(node, graph.get(node).length);
  }

  const queue = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }

  const result = [];

  while (queue.length > 0) {
    const node = queue.shift();
    result.push(node);

    for (const [dependent, deps] of graph) {
      if (deps.includes(node)) {
        const newDeg = inDegree.get(dependent) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }
  }

  return result;
}

/**
 * Returns all transitive dependencies required before taskName can execute.
 *
 * @param {Map<string, string[]>} graph
 * @param {string} taskName
 * @returns {Set<string>}
 */
function allDependencies(graph, taskName) {
  const visited = new Set();
  const stack = [...(graph.get(taskName) || [])];
  while (stack.length > 0) {
    const dep = stack.pop();
    if (!visited.has(dep)) {
      visited.add(dep);
      for (const transitive of (graph.get(dep) || [])) {
        stack.push(transitive);
      }
    }
  }
  return visited;
}

/**
 * DFS helper to reconstruct the cycle path when Kahn's algorithm confirms a cycle exists.
 *
 * @param {Map<string, string[]>} graph
 * @returns {string[]}
 */
function _findCyclePath(graph) {
  const visited  = new Set();
  const inStack  = new Set();
  const parent   = new Map();

  function dfs(node) {
    visited.add(node);
    inStack.add(node);

    for (const dep of (graph.get(node) || [])) {
      if (!visited.has(dep)) {
        parent.set(dep, node);
        const cycle = dfs(dep);
        if (cycle) return cycle;
      } else if (inStack.has(dep)) {
        const cycle = [dep];
        let cur = node;
        while (cur !== dep) {
          cycle.unshift(cur);
          cur = parent.get(cur);
          if (cur === undefined) break;
        }
        cycle.unshift(dep);
        return cycle;
      }
    }

    inStack.delete(node);
    return null;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }

  return null;
}

module.exports = { buildGraph, detectCycle, topoSort, allDependencies };
