'use strict';

/**
 * retry.js — Retry policy with exponential backoff calculation.
 */

const BASE_DELAY = 500;    // ms
const MAX_DELAY  = 10000;  // ms

class RetryPolicy {
  /**
   * @param {number} maxRetries - Number of additional attempts after initial attempt.
   */
  constructor(maxRetries) {
    this.maxRetries     = maxRetries;
    this.attemptNumber  = 0;
  }

  /**
   * Records that an attempt has started.
   */
  attempt() {
    this.attemptNumber++;
  }

  /**
   * Returns true if another retry attempt is permitted.
   *
   * @returns {boolean}
   */
  canRetry() {
    return this.attemptNumber <= this.maxRetries;
  }

  /**
   * Computes the delay before the next attempt using exponential backoff:
   * delay = min(BASE_DELAY * 2^(attempt - 1), MAX_DELAY)
   *
   * @returns {number} Delay in milliseconds
   */
  nextDelay() {
    const delay = BASE_DELAY * Math.pow(2, this.attemptNumber - 1);
    return Math.min(delay, MAX_DELAY);
  }

  /**
   * Returns total attempts allowed (initial attempt + retries).
   *
   * @returns {number}
   */
  totalAttempts() {
    return this.maxRetries + 1;
  }

  /**
   * Formatted attempt progress string for logs (e.g. "attempt 2/4").
   *
   * @returns {string}
   */
  progressLabel() {
    return `attempt ${this.attemptNumber}/${this.totalAttempts()}`;
  }
}

/**
 * Pauses execution for specified milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { RetryPolicy, sleep, BASE_DELAY, MAX_DELAY };
