'use strict';

/**
 * scripts/verify.js — Pre-release validation and package integrity check.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('=== ZeroTask Pre-Release Integrity Verification ===\n');

// 1. Verify zero runtime dependencies
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});
if (deps.length > 0) {
  console.error(`❌ Verification failed: Found runtime dependencies: ${deps.join(', ')}`);
  process.exit(1);
}
console.log('✔ 1. Zero runtime dependencies verified (dependencies: {})');

// 2. Verify all core files exist
const requiredFiles = [
  'src/cli.js',
  'src/config.js',
  'src/envloader.js',
  'src/logger.js',
  'src/processmanager.js',
  'src/retry.js',
  'src/scheduler.js',
  'src/shutdown.js',
  'src/taskgraph.js',
  'build.js',
  'README.md',
  'LICENSE'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.resolve(__dirname, '..', file))) {
    console.error(`❌ Verification failed: Missing required file "${file}"`);
    process.exit(1);
  }
}
console.log(`✔ 2. All ${requiredFiles.length} core and documentation files verified`);

// 3. Run test suite
console.log('⏳ Running full test suite...');
const testFiles = fs.readdirSync(path.resolve(__dirname, '../tests')).filter(f => f.endsWith('.test.js')).map(f => path.join('tests', f));
const testRes = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
if (testRes.status !== 0) {
  console.error('❌ Verification failed: Tests did not pass');
  process.exit(1);
}
console.log('✔ 3. Full test suite passed (100% success)');

// 4. Run build check
console.log('⏳ Running build script...');
const buildRes = spawnSync(process.execPath, [path.resolve(__dirname, '../build.js')], { stdio: 'inherit' });
if (buildRes.status !== 0) {
  console.error('❌ Verification failed: Build bundling failed');
  process.exit(1);
}
console.log('✔ 4. Standalone bundle compiled and verified');

console.log('\n🎉 ALL INTEGRITY CHECKS PASSED. Ready for release.');
