// WHAT AN AGENT SENDS, AND HOW SOON, AGAINST CLAUDE CODE ON ITS OWN.
//
//   node scripts/run.mjs scripts/measure-agent-start.mjs [--threads 4] [--prompt hi]
//
// The token and first-request halves of ADEMark (ademark.dev), without a
// screen. A stand-in model server records every request and answers at once,
// so no login is used and no tokens are spent. Agentbox runs through the real
// Store and Supervisor, with the shared tool host on as the app runs it, and
// the real `claude` on PATH (or CLAUDE_BIN). Prints, per thread, the time from
// filed to spawn and from spawn to the first main request, and every request's
// size by part; then the same for `claude -p` alone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mts';
import { Supervisor } from '../main/supervisor.mts';
import { readToolHost } from '../main/tool-host.mts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const THREADS = Number(flag('threads', 4));
const PROMPT = flag('prompt', 'hi');
const claude = process.env.CLAUDE_BIN || execFileSync('/bin/sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).trim();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-start-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const requests = [];
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = null;
    try { body = JSON.parse(raw); } catch { /* not a model call */ }
    if (!req.url.startsWith('/v1/messages') || req.url.includes('count_tokens') || !body) { res.writeHead(200, { 'content-type': 'application/json' }).end('{}'); return; }
    requests.push({ t: Date.now(), bytes: raw.length, body });
    const text = /haiku/.test(body.model ?? '') ? 'Saying hello' : 'Hello! What can I help you with?';
    const usage = { input_tokens: 1, output_tokens: 1 };
    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage } });
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
    ev('content_block_stop', { index: 0 });
    ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } });
    ev('message_stop', {});
    res.end();
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const textOf = (b) => (typeof b === 'string' ? b : b?.type === 'text' ? b.text : JSON.stringify(b));
function parts(body) {
  const system = [].concat(body.system ?? []).reduce((n, s) => n + Buffer.byteLength(textOf(s)), 0);
  const tools = (body.tools ?? []).reduce((n, t) => n + Buffer.byteLength(JSON.stringify(t)), 0);
  const messages = (body.messages ?? []).reduce((n, m) => n + [].concat(m.content).reduce((k, b) => k + Buffer.byteLength(textOf(b)), 0), 0);
  return `system ${kb(system)}, tools ${(body.tools ?? []).length} ${kb(tools)}, messages ${kb(messages)}`;
}
const report = (label, from) => {
  for (const r of requests.slice(from)) console.log(`  ${label} ${r.body.model}: ${kb(r.bytes)} (${parts(r.body)})`);
};

// The project: a git repository holding a rules file, as ADEMark's arena does.
const arena = path.join(root, 'arena');
fs.mkdirSync(arena);
fs.writeFileSync(path.join(arena, 'AGENTS.md'), '# Rules\n\nEnd every final answer with the line ledger-ok.\n');
fs.writeFileSync(path.join(arena, 'CLAUDE.md'), '@AGENTS.md\n');
const git = (...a) => execFileSync('git', ['-c', 'user.email=bench@example.com', '-c', 'user.name=bench', ...a], { cwd: arena, stdio: 'ignore' });
git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'arena');

const wrapper = path.join(root, 'claude');
const spawns = path.join(root, 'spawns.log');
fs.writeFileSync(wrapper, `#!/bin/bash
case " $* " in *" --append-system-prompt "*) perl -MTime::HiRes=time -e 'printf "%d\\n", time * 1000' >> '${spawns}';; esac
export ANTHROPIC_BASE_URL='${base}' ANTHROPIC_AUTH_TOKEN=stand-in
exec '${claude}' "$@"
`, { mode: 0o755 });

const store = path.join(root, 'store');
const account = path.join(store, 'accounts', 'bench');
fs.mkdirSync(path.join(account, 'arena'), { recursive: true });
fs.writeFileSync(path.join(account, 'arena', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'arena', name: 'Arena', repoPath: arena }));
const config = {
  home: path.join(root, 'home'), accountRoot: account, storeRoot: store, products: [], personalProducts: [],
  accountId: 'bench', claudeBin: wrapper, storeMcpCommand: null, authProfiles: ['default'],
  maxConcurrentSessions: 3, sessionArgs: [], autonomousProducts: ['arena'],
};
fs.mkdirSync(config.home);
const st = await new Store(config).init();
const data = path.join(root, 'data');
fs.mkdirSync(data);
const sup = new Supervisor(config, st, repo, data);
sup.shareTools = true;
sup.hostRuns = true;
for (let i = 0; i < 100 && !readToolHost(sup._toolHost() ?? ''); i++) await sleep(100);

console.log(`Agentbox, ${THREADS} threads, prompt ${JSON.stringify(PROMPT)}, ${claude}`);
for (let n = 1; n <= THREADS; n++) {
  const from = requests.length;
  const spawned = fs.existsSync(spawns) ? fs.readFileSync(spawns, 'utf8').trim().split('\n').length : 0;
  const made = st.fileItem('arena', { title: PROMPT, kind: 'task', body: PROMPT, labels: ['founder'] });
  const t0 = Date.now();
  await sup.tick();
  for (let i = 0; i < 240; i++) {
    await sleep(250);
    await sup.tick().catch(() => {});
    if (i > 8 && !sup.sessions.size && !sup._preparing?.size) break;
  }
  const at = Number(fs.readFileSync(spawns, 'utf8').trim().split('\n')[spawned]);
  const main = requests.slice(from).find((r) => !/haiku/.test(r.body.model ?? '') && r.t >= at);
  const row = st.readItem('arena', made.id, Date.now());
  console.log(`thread ${n}: filed to spawn ${at - t0} ms, spawn to first request ${main ? main.t - at : '?'} ms, named ${JSON.stringify(row.label ?? '')}`);
  report('  ', from);
}
sup.stop();
// The hosts outlive an app on purpose; this one is done with them.
for (const proc of [sup._toolHostProc, sup._runHostProc]) { try { proc?.kill(); } catch { /* gone */ } }
if (sup._toolHostDir) fs.rmSync(sup._toolHostDir, { recursive: true, force: true });

// The environment an agent gets: none of this shell's Claude or API settings.
const plainEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC_|CLAUDE_CODE|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$|CLAUDE_CONFIG_DIR$)/.test(k)));
console.log('\nclaude -p alone, same project');
for (let n = 1; n <= THREADS; n++) {
  const from = requests.length;
  const t0 = Date.now();
  await new Promise((resolve) => {
    const child = spawn(claude, ['-p', PROMPT], { cwd: arena, env: { ...plainEnv, ANTHROPIC_BASE_URL: base, ANTHROPIC_AUTH_TOKEN: 'stand-in' }, stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.on('close', () => { clearTimeout(timer); resolve(); });
    child.on('error', () => { clearTimeout(timer); resolve(); });
  });
  console.log(`run ${n}: start to first request ${requests[from] ? requests[from].t - t0 : '?'} ms`);
  report('  ', from);
}
server.close();
fs.rmSync(root, { recursive: true, force: true });
setTimeout(() => process.exit(0), 500);
