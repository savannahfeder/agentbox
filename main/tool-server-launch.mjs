// How a worker starts one of the app's own two tool servers.
//
// Windows cannot start the shell launchers. Each one finds a runtime and runs
// its .mjs, so on Windows the worker is handed the app's own binary with
// ELECTRON_RUN_AS_NODE=1 and the .mjs, as approval-server.sh already does in a
// packaged app. A Mac and Linux keep the launchers, because the cloud relay
// recognises the servers by those names (main/cloud/run.mjs).
import path from 'node:path';
import { nameSlug } from '../shared/product-name.mjs';

const ENTRIES = [
  { launcher: ['scripts', 'approval-server.sh'], entry: ['main', 'approval-prompt-server.mjs'] },
  { launcher: ['mcp', `${nameSlug}-mcp.sh`], entry: ['mcp', 'stdio.mjs'] },
];

/**
 * `{ command, args?, env? }` for a launcher path. Only this app's own launchers
 * are rewritten, so a store command outside the app runs as configured. `env`
 * is merged over the server's own by the caller.
 */
export function toolServerLaunch(command, { appDir, platform = process.platform, runtime = process.execPath, unpacked = (p) => p } = {}) {
  if (platform !== 'win32' || !command || !appDir) return { command };
  const p = path.win32;
  const known = ENTRIES.find(({ launcher }) => samePath(command, unpacked(p.join(appDir, ...launcher))));
  if (!known) return { command };
  return { command: runtime, args: [p.join(appDir, ...known.entry)], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

const samePath = (a, b) => path.win32.resolve(a).toLowerCase() === path.win32.resolve(b).toLowerCase();
