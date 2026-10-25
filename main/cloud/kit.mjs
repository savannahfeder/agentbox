// THE COMPUTER'S SIDE OF A KIT (shared/cloud-kit.mjs): where its copy is kept
// here, and the marker that makes a run the cloud server started from it this
// thread's own, so the import path joins it or brings it home
// (main/cloud/run.mjs `joining`, Supervisor#adoptCloudRun).
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { cloudSessionId, APPROVALS_SERVER } from '../../shared/cloud-kit.mjs';
import { serveApprovals } from '../approval-prompt-core.mjs';

const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');

/** Where the last kit written for a thread is kept on this computer. */
export const kitCopyPath = (userDir, product, item) => path.join(userDir, 'cloud-kits', `${safe(product)}--${safe(item)}.json`);
/** Where the reply's place in the prompt waits for the kit writer, read once. */
export const kitFramePath = (userDir, product, item) => path.join(userDir, 'cloud-kits', `${safe(product)}--${safe(item)}.frame.json`);

export function readKitCopy(file) {
  try {
    const kit = JSON.parse(fs.readFileSync(file, 'utf8'));
    return kit && typeof kit === 'object' && kit.marker && typeof kit.cwd === 'string' ? kit : null;
  } catch { return null; }
}

// None of its events have been read here (`cursor`). Left `detached`, as one
// the app left going: the import path asks the sandbox which it is now, and
// numbers this computer's input on from what the sandbox says it took
// (`inSeq`), however many replies the server sent. Its input is closed when
// joined (`unsent`), so the turn it is on ends and its work comes home; her
// next reply is then an ordinary run here.
export function markerForCloudRun(kit, runId) {
  return {
    ...kit.marker,
    runId,
    sessionId: cloudSessionId(kit.item, runId),
    offline: true,
    state: 'detached', pid: null, cursor: 0, conns: {},
    unsent: [{ action: 'stdin', end: true }],
  };
}

// PERMISSION REQUESTS WITH THE COMPUTER AWAY (cloud/sandbox/server.mjs
// `offline.hold`). A run that asks permission names the app's approvals
// server on its command line; one in a mode that never asks does not need it
// held.
export function asksPermission(argv) {
  const args = (Array.isArray(argv) ? argv : []).map(String);
  if (args.includes('--dangerously-skip-permissions')) return false;
  const at = args.indexOf('--permission-prompt-tool');
  if (at < 0 || !String(args[at + 1] ?? '').includes(`__${APPROVALS_SERVER}__`)) return false;
  const mode = args.indexOf('--permission-mode');
  return !(mode >= 0 && args[mode + 1] === 'bypassPermissions');
}

// The approvals server's own answers to a run opening it, read off the server
// itself, so a run the computer never spoke to opens it in the cloud.
export async function approvalsHandshakes({ timeoutMs = 5_000 } = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const server = serveApprovals({ env: {}, input, output, warn: () => {} });
  const answers = new Map();
  let buf = '';
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the approvals server did not answer its handshake')), timeoutMs);
    output.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const msg = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        answers.set(msg.id, msg.result);
        if (answers.size === 2) { clearTimeout(timer); resolve(); }
      }
    });
  });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  try { await done; } finally { server.close(); }
  return { initialize: answers.get(1), 'tools/list': answers.get(2) };
}
