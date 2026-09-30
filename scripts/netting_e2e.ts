#!/usr/bin/env npx tsx
/**
 * End-to-end netting test against the running backend, terminal only.
 *
 *   npx tsx scripts/netting_e2e.ts
 */
import { spawn } from 'child_process';
import path from 'path';

const demo = path.join(__dirname, 'netting_visual_demo.ts');
const args = ['--yes', 'tsx', demo, '--headless', '--exit-when-done', ...process.argv.slice(2)];
const child = spawn('npx', args, { stdio: 'inherit', shell: true, cwd: path.join(__dirname, '..') });
child.on('exit', (code) => process.exit(code === null ? 1 : code));
