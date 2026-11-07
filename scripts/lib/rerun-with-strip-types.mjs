// A plain `node` below 22.18 loads .mts only with these flags
// (main/strip-types.mts), and an import of one fails before a script's own
// code runs. So a script that loads .mts calls this first; it re-runs the
// script with the flags when it was run directly on such a node.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FLAGS = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];

export function rerunWithStripTypes(url) {
  // The execArgv check stops a loop on a node that takes the flag but has no process.features.typescript.
  if (process.features.typescript || process.execArgv.includes(FLAGS[0])) return;
  const script = fileURLToPath(url);
  if (!process.argv[1] || path.resolve(process.argv[1]) !== script) return;
  const ran = spawnSync(process.execPath, [...FLAGS, ...process.execArgv, script, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(ran.status ?? 1);
}
