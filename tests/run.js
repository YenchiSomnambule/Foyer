#!/usr/bin/env node
'use strict';
// Runs every tests/*.test.js (each in its own Node process) and prints a summary.
//
//   node tests/run.js                 all tests
//   node tests/run.js notes backup    only files whose name contains "notes" or "backup"
//   TEST_JOBS=1 node tests/run.js     run one at a time (default: 3 in parallel)
//   FOYER_OFFLINE=1 node tests/run.js skip checks that need the internet
const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const filters = process.argv.slice(2);
const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .filter(f => !filters.length || filters.some(q => f.includes(q)))
  .sort();
const jobs = Math.max(1, Number(process.env.TEST_JOBS) || 3);

if (!files.length) { console.error('No matching tests.'); process.exit(1); }

function runOne(file) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, file)], { env: process.env });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(out.endsWith('\n') ? out : out + '\n');
      resolve({ file, ok: code === 0, secs, skipped: /SKIPPED/.test(out) });
    });
  });
}

(async () => {
  console.log(`Running ${files.length} test file(s), ${jobs} at a time…`);
  const queue = [...files];
  const results = [];
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, async () => {
    while (queue.length) results.push(await runOne(queue.shift()));
  }));
  results.sort((a, b) => a.file.localeCompare(b.file));
  console.log('\n══ Summary ══');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.file.padEnd(28)} ${String(r.secs).padStart(4)}s${r.skipped ? '  (some checks skipped offline)' : ''}`);
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? `\n${failed} file(s) failed.` : `\nAll ${results.length} files passed.`);
  process.exit(failed ? 1 : 0);
})();
