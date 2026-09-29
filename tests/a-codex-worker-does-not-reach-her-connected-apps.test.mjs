// A CODEX WORKER DOES NOT REACH HER CONNECTED APPS, AND SAYS SO WHEN IT DOES.
//
// `mcpIsolation` switches off every MCP server in her `~/.codex/config.toml` by
// name, and it deliberately leaves `codex_apps` alone, because the slice that
// wrote it measured that naming it refuses the thread outright:
//
//   with `codex_apps: {enabled:false}` beside her two -> thread/start REFUSED,
//     -32600 "invalid transport in `mcp_servers.codex_apps`"   (2026-09-04)
//
// That measurement stands. What was never followed through is the CONSEQUENCE.
// `codex_apps` is Codex's own connector to the apps she has connected -- Drive,
// Gmail, whatever she has linked to her ChatGPT account -- it is enabled by
// default, and its traffic does not go through the command sandbox or the
// approval path. So a headless worker could read her connected accounts with
// nothing on any screen saying those tools were even there.
//
// IT IS NOT AN `mcp_servers` ENTRY, IT IS A FEATURE, which is why looking in
// the servers table could never find the switch. Measured on this Mac
// 2026-09-05, codex-cli 0.148.0, real `codex app-server`, scratch CODEX_HOME:
//
//   experimentalFeature/list  ->  { name: "apps", stage: "stable",
//                                   enabled: true, defaultEnabled: true }
//   ("Stable key used in config.toml and CLI flag toggles" -- the schema's own
//    words for `name`, and `codex app-server --disable <FEATURE>` is documented
//    as `-c features.<name>=false`.)
//
//   thread/start config.features.apps = false      -> thread ok, no refusal
//   experimentalFeature/list { threadId } for it   -> apps enabled: FALSE
//   experimentalFeature/list { threadId } without  -> apps enabled: true
//
// (`config.apps` is NOT the switch and was tried first: `{apps:{enabled:false}}`
// answered "invalid type: boolean `false`, expected struct AppConfig in `apps`".)
//
// WHAT THAT MEASUREMENT DOES NOT COVER, stated rather than glossed. The apps
// connector needs a signed-in ChatGPT account, and a scratch CODEX_HOME is
// signed out -- every probe here answered HTTP 401 and `codex_apps` never
// started at all, so what was watched is Codex's own feature registry reporting
// the flag OFF for that thread, not the connector process failing to appear.
// Her real ~/.codex was never opened to close that gap.
//
// SO THE SWITCH IS THROWN AND THE RESULT IS ALSO WATCHED. A worker says on its
// own stderr -- the pipe `troubleCause` reads and the run trace records -- when
// any MCP server starts on its thread that Agentbox did not put there. If the
// flag ever stops working, or a Codex release renames it, that is a line on the
// run instead of a silence. CLAUDE.md's rule: when the system swallows
// something, she cannot tell it from the work not happening.

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { workerThreadParams, resumeThreadParams, createCodexWorker } from '../main/codex-session.mjs';
import { troubleCause } from '../shared/spawn-trouble.mjs';
import { NAME } from '../shared/product-name.mjs';

/* ============================== the switch =============================== */

describe('the features table one worker thread is started with', () => {
  it('turns the apps connector off', () => {
    expect(workerThreadParams({ cwd: '/w' }).config.features).toEqual({ apps: false, plugins: false, remote_plugin: false });
  });

  // A REPLY IS A CONTINUATION, and a thread does not remember what it was
  // started with -- measured for `mcp_servers` on 2026-09-04, and this rides
  // the same table for the same reason.
  it('turns it off again on a resume', () => {
    const params = resumeThreadParams('T-1', workerThreadParams({ cwd: '/w' }));
    expect(params.config.features).toEqual({ apps: false, plugins: false, remote_plugin: false });
  });

  // THE CASE THAT MUST NOT MATCH: `codex_apps` is still not named in the
  // servers table, because naming it is the -32600 that refuses every Codex
  // thread on the machine.
  it('still never names codex_apps as a server', () => {
    const table = workerThreadParams({ cwd: '/w', mcpServers: ['playwright'] }).config.mcp_servers;
    expect(Object.keys(table)).toEqual(['playwright']);
  });
});

/* ===================== and it is watched, not assumed ==================== */

/** A codex app-server client shaped exactly as `createCodexWorker` uses one,
 *  with a hand on the notification pipe. */
function fakeServer() {
  let handlers = null;
  return {
    handlers: () => handlers,
    initialize: () => Promise.resolve({}),
    startThread: (_params, h) => { handlers = h; return Promise.resolve({ threadId: 'T-1' }); },
    resumeThread: (_params, h) => { handlers = h; return Promise.resolve({}); },
    startTurn: () => new Promise(() => {}),
    interruptTurn: () => Promise.resolve({}),
    unwatch: () => {},
    isClosed: () => false,
  };
}

async function workerWithLines({ requireMcpServer = 'agentbox' } = {}) {
  const server = fakeServer();
  const lines = [];
  const worker = createCodexWorker({
    server,
    threadParams: () => workerThreadParams({ cwd: '/w' }),
    turnParams: { input: [] },
    requireMcpServer,
    mcpReadyMs: 50,
  });
  worker.stderr.on('data', (line) => lines.push(String(line)));
  for (let i = 0; i < 8; i += 1) await new Promise((r) => { setImmediate(r); });
  return { server, worker, lines };
}

describe(`a server starting on a worker thread that ${NAME} did not put there`, () => {
  it('says so on the run', async () => {
    const { server, lines } = await workerWithLines();
    server.handlers().onNotification('mcpServer/startupStatus/updated', { name: 'codex_apps', status: 'starting' });
    expect(lines.join('\n')).toMatch(/codex_apps/);
  });

  // ONCE, not once per notification: `ready` follows `starting` for the same
  // server, and a line repeated on every beat is a line she stops reading.
  it('says it once, however many times that server reports', async () => {
    const { server, lines } = await workerWithLines();
    for (const status of ['starting', 'ready', 'ready']) {
      server.handlers().onNotification('mcpServer/startupStatus/updated', { name: 'codex_apps', status });
    }
    expect(lines.filter((l) => l.includes('codex_apps'))).toHaveLength(1);
  });

  // THE CASE THAT MUST NOT MATCH, and it is the whole reason this can be left
  // on: the store server is the one Agentbox DOES put there, and a line about it
  // on every single run is noise that trains her to ignore the real one.
  it('says nothing about the store server, which we asked for', async () => {
    const { server, lines } = await workerWithLines();
    server.handlers().onNotification('mcpServer/startupStatus/updated', { name: 'agentbox', status: 'ready' });
    expect(lines).toEqual([]);
  });

  // A server that could not start did not run anything, so there is nothing to
  // tell her about.
  it('says nothing about a server that failed to start', async () => {
    const { server, lines } = await workerWithLines();
    server.handlers().onNotification('mcpServer/startupStatus/updated', { name: 'codex_apps', status: 'failed', error: 'no' });
    expect(lines.join('\n')).not.toMatch(/codex_apps/);
  });

  // A PERSONAL SESSION HAS NO STORE SERVER AT ALL, so `requireMcpServer` is
  // null and there is nothing we asked for -- every server on that thread is
  // one nobody asked for.
  it('still says it on a run with no store server', async () => {
    const { server, lines } = await workerWithLines({ requireMcpServer: null });
    server.handlers().onNotification('mcpServer/startupStatus/updated', { name: 'codex_apps', status: 'ready' });
    expect(lines.join('\n')).toMatch(/codex_apps/);
  });

  // AND THE SENTENCE MUST NOT LOOK LIKE A CAUSE OF DEATH. This pipe is what
  // `troubleCause` classifies a dead run from, and its WORKSPACE list matches
  // the bare word /untrusted/i -- so a line here carrying the wrong word would
  // relabel every Codex run that died of something else as "Claude will not run
  // in this folder".
  it('is worded so a dead run is still classified on its real cause', async () => {
    const { server, lines } = await workerWithLines();
    server.handlers().onNotification('mcpServer/startupStatus/updated', { name: 'codex_apps', status: 'ready' });
    expect(lines).toHaveLength(1);
    expect(troubleCause(lines[0])).toBe('unknown');
  });
});
