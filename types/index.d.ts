/**
 * Type definitions for ZeroTask
 * Zero-dependency task runner and process orchestrator for Node.js
 */

import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';

export type TaskColor = 'cyan' | 'magenta' | 'yellow' | 'blue' | 'green' | 'red' | 'white' | 'gray';

export interface TaskDefinition {
  command: string;
  cwd?: string;
  dependsOn?: string[];
  retries?: number;
  timeout?: number;
  env?: Record<string, string>;
  color?: TaskColor;
}

export interface ZeroConfig {
  $schema?: string;
  version?: string;
  defaultTimeout?: number;
  tasks: Record<string, TaskDefinition>;
}

export interface TaskGraphNode {
  name: string;
  task: TaskDefinition;
  dependencies: string[];
  dependents: string[];
}

export declare class TaskGraph {
  constructor(tasks: Record<string, TaskDefinition>);
  nodes: Map<string, TaskGraphNode>;
  buildGraph(): void;
  detectCycles(): string[][] | null;
  getExecutionLevels(): string[][];
  getDependencies(taskName: string): string[];
}

export declare class RetryPolicy {
  constructor(retries?: number, baseDelayMs?: number, maxDelayMs?: number);
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  canRetry(attempt: number): boolean;
  getDelay(attempt: number): number;
  sleep(ms: number): Promise<void>;
  getProgressLabel(attempt: number): string;
}

export declare class ShutdownController extends EventEmitter {
  constructor(shutdownTimeoutMs?: number);
  isShuttingDown: boolean;
  registerProcess(name: string, proc: ChildProcess): void;
  unregisterProcess(name: string): void;
  initiateShutdown(signal?: string): Promise<void>;
}

export declare class Scheduler extends EventEmitter {
  constructor(config: ZeroConfig, options?: SchedulerOptions);
  run(): Promise<SchedulerResult>;
}

export interface SchedulerOptions {
  concurrency?: number;
  dryRun?: boolean;
  filterTasks?: string[];
}

export interface SchedulerResult {
  success: boolean;
  durationMs: number;
  taskResults: Record<string, TaskResult>;
}

export interface TaskResult {
  name: string;
  exitCode: number | null;
  attempts: number;
  durationMs: number;
  status: 'SUCCESS' | 'FAILURE' | 'KILLED' | 'SKIPPED';
}
