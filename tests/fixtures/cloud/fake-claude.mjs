#!/usr/bin/env node
// A STAND-IN FOR CLAUDE CODE INSIDE A TEST'S CLOUD SANDBOX.
//
// It speaks the same stream-json the supervisor speaks to the real one: it
// reads user messages on stdin and prints `system`, `assistant` and `result`
// lines on stdout, and it reaches the app's tools the way the real one does,
// by starting the MCP servers its `--mcp-config` names (in the sandbox those
// are the stubs). What it does with a message is fixed so a test can check
// every effect on the Mac:
//   - calls `tools/list` and `tools/call {name: "note", arguments: {text}}` on
//     the `agentbox` server and puts the reply in its result;
//   - commits `cloud.txt` and leaves `loose.txt` uncommitted;
//   - writes its transcript where Claude Code would;
//   - says back each message it takes up, as Claude Code does with
//     --replay-user-messages;
//   - prints the result, then waits for stdin to close, as Claude Code does.
// A message whose text includes "HANG" makes it ignore SIGTERM for a moment and
// then sit still, so a test can cancel it. "LOOK" makes it call look_at_page.
// "LATE" makes it wait a moment after its handshake and before its tool call,
// so a test can quit the app in between.
// "AMEND" makes it amend the commit the branch started on instead of adding
// one; "IDLE" makes it change nothing in the folder. "STAY" makes it commit
// and then keep working for ever, so a test can kill its machine.
// "DOCS:<folder>" makes it read and write the project's documents folder:
// it reports what it found there, draws a picture in its own designs folder
// and waits a moment, then edits the notes just before its result.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const root = process.env.AGENTBOX_PATH_ROOT || '';
const at = (p) => (root ? path.join(root, p) : p);
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const sessionId = val('--resume') || 'cloud-session-0001';
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');

out({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd() });

const config = JSON.parse(fs.readFileSync(at(val('--mcp-config')), 'utf8'));
const store = config.mcpServers.agentbox;
const server = spawn(store.command, store.args, { stdio: ['pipe', 'pipe', 'inherit'], env: process.env });
let sbuf = '';
const waiting = new Map();
server.stdout.on('data', (d) => {
  sbuf += d;
  let i;
  while ((i = sbuf.indexOf('\n')) >= 0) {
    const msg = JSON.parse(sbuf.slice(0, i));
    sbuf = sbuf.slice(i + 1);
    waiting.get(msg.id)?.(msg);
  }
});
let nextId = 1;
const call = (method, params) => new Promise((resolve) => {
  const id = nextId++;
  waiting.set(id, resolve);
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});

let ibuf = '';
let busy = Promise.resolve();
process.stdin.on('data', (d) => {
  ibuf += d;
  let i;
  while ((i = ibuf.indexOf('\n')) >= 0) {
    const line = ibuf.slice(0, i);
    ibuf = ibuf.slice(i + 1);
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.type !== 'user') continue;
    // Taken up, said back as Claude Code does with --replay-user-messages.
    out({ type: 'user', ...(msg.uuid ? { uuid: msg.uuid } : {}), message: msg.message, parent_tool_use_id: null });
    const text = typeof msg.message?.content === 'string' ? msg.message.content : JSON.stringify(msg.message?.content);
    busy = busy.then(() => turn(text));
  }
});
process.stdin.on('end', async () => { await busy; server.stdin.end(); process.exit(0); });

let inited = false;
async function turn(text) {
  // A real client opens every server with this handshake.
  if (!inited) {
    inited = true;
    await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-claude', version: '1' } });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  }
  if (text.includes('LATE')) await new Promise((r) => setTimeout(r, 1500));
  if (text.includes('HANG')) {
    process.on('SIGTERM', () => setTimeout(() => process.exit(143), 200));
    await new Promise(() => {});
  }
  const list = await call('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  const resource = (text.match(/RESOURCE:(\S+)/) || [])[1];
  const tool = resource ? 'request_cloud_resource' : text.includes('LOOK') ? 'look_at_page' : 'note';
  const reply = await call('tools/call', { name: tool, arguments: resource ? { kind: 'file', scope: 'documents', path: resource } : { text } });
  const said = reply.result?.content?.[0]?.text ?? JSON.stringify(reply);
  let requested = null;
  if (resource) {
    const answer = JSON.parse(said);
    const data = answer.status === 'delivered' ? fs.readFileSync(at(answer.path), 'utf8') : '';
    requested = { ...answer, length: data.length, beginning: data.slice(0, 8) };
  }
  if (text.includes('SLOW')) await new Promise((r) => setTimeout(r, 1500));
  if (text.includes('SWITCH')) execSync('git checkout -q -b somewhere-else');
  if (!text.includes('IDLE')) {
    fs.appendFileSync('cloud.txt', 'made in the cloud\n');
    execSync(text.includes('AMEND') ? 'git add cloud.txt && git commit -q --amend -m "Amended in the cloud"' : 'git add cloud.txt && git commit -q -m "From the cloud"');
    fs.writeFileSync('loose.txt', 'not committed\n');
  }
  if (text.includes('STAY')) await new Promise(() => {});
  const docs = (text.match(/DOCS:(\S+)/) || [])[1];
  let found = null;
  if (docs) {
    const d = at(docs);
    const has = (rel) => fs.existsSync(path.join(d, rel));
    found = { plan: has('plans/plan.md') ? fs.readFileSync(path.join(d, 'plans/plan.md'), 'utf8') : null, big: has('reports/big.bin'), other: has('designs/w-2/old.png'), own: has('designs/w-1/round1/a.png') };
    fs.mkdirSync(path.join(d, 'designs/w-1/round2'), { recursive: true });
    fs.writeFileSync(path.join(d, 'designs/w-1/round2/b.png'), 'picture from the cloud');
    fs.writeFileSync(path.join(d, 'designs/w-1/round2/env.txt'), `login=${process.env.CLAUDE_CODE_OAUTH_TOKEN}\n`);
    fs.writeFileSync(path.join(d, `designs/w-1/round2/${process.env.CLAUDE_CODE_OAUTH_TOKEN}.txt`), 'named after the login');
    // Still working until the picture is home on the Mac (`docs` is the Mac's
    // own path), not for a fixed 1.5 s, which a loaded machine overran inside
    // the ship's suite (2026-10-16). Twenty seconds at most.
    const home = path.join(docs, 'designs/w-1/round2/b.png');
    for (let waited = 0; waited < 20_000 && !fs.existsSync(home); waited += 100) await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(d, 'notes.md'), 'the cloud wrote this\n');
  }
  const attachment = (text.match(/ATTACH:(\S+)/) || [])[1];
  const attached = attachment ? fs.readFileSync(at(attachment), 'utf8').trim() : null;
  const dir = path.join(at(process.env.CLAUDE_CONFIG_DIR), 'projects', process.cwd().slice(root.length).replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${sessionId}.jsonl`), JSON.stringify({ type: 'user', text }) + '\n');
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'working' }] } });
  const settings = readSettings();
  out({ type: 'result', subtype: 'success', is_error: false, session_id: sessionId, result: JSON.stringify({ said, names, attached, found, ...(resource ? { requested } : {}), memory: readMemory(), settings, hookScripts: readHookScripts(settings), token: process.env.CLAUDE_CODE_OAUTH_TOKEN || null, home: process.env.HOME === undefined ? null : 'set' }) });
}

// Her own instructions and settings, where Claude Code reads them: its config
// folder (CLAUDE_CONFIG_DIR), not the home folder. A real cloud run with
// CLAUDE.md in the home folder reported it as gone (2026-10-23).
const configDir = () => at(process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME || '', '.claude'));
function readMemory() {
  try { return fs.readFileSync(path.join(configDir(), 'CLAUDE.md'), 'utf8'); } catch { return null; }
}
function readSettings() {
  try { return JSON.parse(fs.readFileSync(path.join(configDir(), 'settings.json'), 'utf8')); } catch { return null; }
}
// Every script a hook names, read at the path the command gives it.
function readHookScripts(s) {
  const found = {};
  for (const groups of Object.values(s?.hooks || {})) {
    for (const g of groups) {
      for (const h of g.hooks || []) {
        for (const word of String(h.command || '').split(/\s+/)) {
          const p = word.replace(/^["']|["']$/g, '');
          if (!p.startsWith('/') || p.startsWith('/usr/') || p.startsWith('/bin/')) continue;
          try { found[p] = fs.readFileSync(at(p), 'utf8'); } catch { found[p] = null; }
        }
      }
    }
  }
  return found;
}
