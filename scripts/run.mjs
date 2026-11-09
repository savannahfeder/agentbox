#!/usr/bin/env node
// Runs a script that loads the TypeScript back end:
//
//   node scripts/run.mjs scripts/dev.mjs [args]
//
// Node loads .mts by itself from 22.18. An older 22 needs a flag, and an import
// of a .mts fails before the script's first line runs, so the script cannot
// add it itself. The flag goes in NODE_OPTIONS so whatever the script starts
// gets it too.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FLAGS = '--experimental-strip-types --disable-warning=ExperimentalWarning';
const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error('usage: node scripts/run.mjs <script> [args]');
  process.exit(2);
}

if (process.features.typescript) {
  const file = path.resolve(script);
  process.argv = [process.argv[0], file, ...args];
  await import(pathToFileURL(file).href);
} else {
  const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, FLAGS].filter(Boolean).join(' ') };
  const ran = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', env });
  if (ran.error) throw ran.error;
  process.exit(ran.status ?? 1);
}
