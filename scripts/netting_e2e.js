#!/usr/bin/env node
'use strict';
/**
 * End-to-end netting test against the running backend, terminal only (no page).
 * Same scenarios as the visualizer (scripts/lib/scenarios.js), same assertions.
 *
 *   node scripts/netting_e2e.js                       all scenarios V01–V16, 20 s soak
 *   node scripts/netting_e2e.js --scenario V02,V04    a subset
 *   node scripts/netting_e2e.js --symbol EURUSD --soak-seconds 60
 *
 * Exit code: 0 = all PASS (incl. invariants I1–I7), 1 = a failure, 2 = backend unreachable.
 */
const { spawn } = require('child_process');
const path = require('path');

const args = ['--headless', '--exit-when-done', ...process.argv.slice(2)];
const child = spawn(process.execPath, [path.join(__dirname, 'netting_visual_demo.js'), ...args], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code === null ? 1 : code));
