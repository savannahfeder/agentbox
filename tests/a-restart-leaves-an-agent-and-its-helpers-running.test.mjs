// A RESTART LEAVES AN AGENT AND ITS HELPERS RUNNING (w-2a5f57325e, 2026-11-01).
//
// On 2026-10-31 the app restarted three times in about ten minutes, and each
// time every local worker was killed with it (Supervisor#killAll). The worker
// was resumed from its transcript, but its subagents and background jobs were
// not: three agents, three watch jobs and three helpers with their copies of
// the app came back as "didn't finish". Measured before this change: a worker
// was a child of the app with its input on a pipe, and nothing outlived a quit.
//
// Now the run host (main/run-host.mjs) holds the worker. The app lets go of it
// on a quit and reads on from where it stopped when it starts again. These run
// the host in this process with a stand-in worker and a real socket.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { serveRuns, spoolFiles } from '../main/run-host.mjs';
import { HostedRun, HOST_LOST } from '../main/hosted-run.mjs';
import { attachClaudeInput } from '../main/claude-input.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 7000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await wait(25); }
}
const alive = (pid) => { try { process.kill(pid, 0); } catch { return false; } try { return !/^\d+ \(.*\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; } };

// A stand-in for Claude Code's stream-json mode. Each line of input is a user
// message whose text is a command; it ends when its input does.
const WORKER = `
let n = 0, ticking = null;
const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
say({ type: 'system', subtype: 'init', session_id: 's-1' });
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m; try { m = JSON.parse(line); } catch { continue; }
    const text = String(m.message?.content ?? '');
    say({ type: 'user', uuid: m.uuid, message: { role: 'user', content: text } });
    if (text === 'tick') ticking = setInterval(() => say({ type: 'tick', n: n++ }), 20);
    else if (text === 'untick') clearInterval(ticking);
    else if (text === 'helper') say({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 't1', description: 'build' }] });
    else if (text === 'helper done') say({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    else if (text === 'result') say({ type: 'result', result: 'done' });
  }
});
process.stdin.on('end', () => { clearInterval(ticking); say({ type: 'bye' }); process.exit(0); });
`;

let dir, host;
afterEach(async () => {
  await host?.close();
  host = null;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function aHost() {
  dir = fs.mkdtempSync(path.join(fs.existsSync('/tmp') ? '/tmp' : os.tmpdir(), 'rh-'));
  fs.writeFileSync(path.join(dir, 'worker.mjs'), WORKER);
  const sockPath = path.join(dir, 'runs.sock');
  host = serveRuns({ sockPath, spoolDir: path.join(dir, 'spool'), idleMs: 60_000 });
  expect(await host.started).toBe('serving');
  return sockPath;
}

function start(sockPath) {
  const runId = crypto.randomUUID();
  const child = new HostedRun({ sockPath, runId, start: { bin: process.execPath, argv: [path.join(dir, 'worker.mjs')], env: { PATH: process.env.PATH }, cwd: dir } });
  attachClaudeInput(child);
  const lines = [];
  collect(child, lines);
  return { child, runId, lines };
}
function collect(child, lines) {
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); }
  });
}
const send = (child, text) => child.stdin.write(JSON.stringify({ type: 'user', uuid: crypto.randomUUID(), message: { role: 'user', content: text } }) + '\n');

describe('the app lets go of a run and comes back to it', () => {
  it('the worker keeps running, and the restarted app reads exactly what it missed', async () => {
    const sockPath = await aHost();
    const { child, runId, lines } = start(sockPath);
    await until(() => child.pid);
    send(child, 'tick');
    await until(() => lines.filter((l) => l.type === 'tick').length >= 3);
    const read = child.detach();
    const seen = lines.filter((l) => l.type === 'tick').map((l) => l.n);
    await wait(200);
    expect(alive(child.pid)).toBe(true);

    const back = new HostedRun({ sockPath, runId, out: read.out, err: read.err, pid: child.pid });
    attachClaudeInput(back);
    const later = [];
    collect(back, later);
    await until(() => later.filter((l) => l.type === 'tick').length >= 3);
    const ticks = [...seen, ...later.filter((l) => l.type === 'tick').map((l) => l.n)];
    // Nothing twice and nothing missing.
    expect(ticks).toEqual(ticks.map((_, i) => i));
    send(back, 'untick');
    back.stdin.end();
    const exit = await new Promise((r) => back.once('exit', (code) => r(code)));
    expect(exit).toBe(0);
    expect(later.at(-1)?.type).toBe('bye');
  });

  it('an app that dies without a word leaves the run going too, once it could find it again', async () => {
    const sockPath = await aHost();
    const { child, runId } = start(sockPath);
    await until(() => child.pid);
    child.keep();
    await wait(50);
    child._sock.destroy();
    await wait(200);
    expect(alive(child.pid)).toBe(true);
    const back = new HostedRun({ sockPath, runId });
    attachClaudeInput(back);
    back.stdin.end();
    expect(await new Promise((r) => back.once('exit', (code) => r(code)))).toBe(0);
  });
});

describe('a run the app could not find again', () => {
  // Its session id was never saved, so the next app would start the thread
  // again beside it.
  it('is stopped when the app vanishes', async () => {
    const sockPath = await aHost();
    const { child } = start(sockPath);
    const pid = await until(() => child.pid);
    child._sock.destroy();
    expect(await until(() => !alive(pid))).toBe(true);
  });

  it('is stopped at once by a quit, without waiting on the socket', async () => {
    const sockPath = await aHost();
    const { child } = start(sockPath);
    const pid = await until(() => child.pid);
    child.kill('SIGTERM');
    child._sock.destroy();
    expect(await until(() => !alive(pid))).toBe(true);
  });
});

describe('while no app is attached, input closes the way the app would close it', () => {
  it('held open while a helper is out, so the helper is not cut off', async () => {
    const sockPath = await aHost();
    const { child, runId } = start(sockPath);
    await until(() => child.pid);
    send(child, 'helper');
    send(child, 'result');
    await wait(150);
    const read = child.detach();
    await wait(300);
    expect(alive(child.pid)).toBe(true);
    const back = new HostedRun({ sockPath, runId, ...read });
    const input = attachClaudeInput(back);
    await until(() => input.waitingOn().length === 1);
    expect(input.waitingOn()).toEqual([{ task_id: 't1', description: 'build' }]);
    back.stdin.end();
    await new Promise((r) => back.once('exit', r));
  });

  it('closed at a finished turn with nothing out, and the run counts as ended', async () => {
    const sockPath = await aHost();
    const { child, runId } = start(sockPath);
    const pid = await until(() => child.pid);
    send(child, 'helper');
    send(child, 'result');
    await wait(150);
    const read = child.detach();
    // A second app-less moment: the helper finishes, the agent wakes and ends its turn.
    const nudge = new HostedRun({ sockPath, runId, ...read });
    nudge.stdin.write(JSON.stringify({ type: 'user', uuid: crypto.randomUUID(), message: { role: 'user', content: 'helper done' } }) + '\n');
    nudge.stdin.write(JSON.stringify({ type: 'user', uuid: crypto.randomUUID(), message: { role: 'user', content: 'result' } }) + '\n');
    await wait(150);
    const read2 = nudge.detach();
    await until(() => !alive(pid));
    expect(alive(pid)).toBe(false);
    const back = new HostedRun({ sockPath, runId, ...read2 });
    const input = attachClaudeInput(back);
    const code = await new Promise((r) => back.once('exit', (c) => r(c)));
    expect(code).toBe(0);
    expect(input.ranToTheEnd()).toBe(true);
  });

  it('not while an app is attached: closing is the app\'s to do', async () => {
    const sockPath = await aHost();
    const { child } = start(sockPath);
    // The app holds input open itself, as for a person driving the session.
    child.holdInput(true);
    send(child, 'result');
    await wait(300);
    expect(alive(child.pid)).toBe(true);
    child.holdInput(false);
    expect(await new Promise((r) => child.once('exit', r))).toBe(0);
  });
});

describe('what the host says when there is nothing to go back to', () => {
  it('an ended run is read in full, then its exit, then it is forgotten', async () => {
    const sockPath = await aHost();
    const { child, runId } = start(sockPath);
    await until(() => child.pid);
    const read = child.detach();
    // Ended from outside while nobody was attached.
    process.kill(child.pid, 'SIGTERM');
    await until(() => fs.existsSync(spoolFiles(path.join(dir, 'spool'), runId).exit));
    const back = new HostedRun({ sockPath, runId, ...read });
    const got = await new Promise((r) => back.once('exit', (code, signal) => r({ code, signal })));
    expect(got).toEqual({ code: null, signal: 'SIGTERM' });
    expect(host.runs()).toBe(0);
    expect(fs.existsSync(spoolFiles(path.join(dir, 'spool'), runId).out)).toBe(false);
  });

  it('a run the host never had ends at once as lost, not as the agent failing', async () => {
    const sockPath = await aHost();
    const back = new HostedRun({ sockPath, runId: crypto.randomUUID() });
    expect(await new Promise((r) => back.once('exit', r))).toBe(HOST_LOST);
  });

  it('a worker that cannot start says so, as a child process would', async () => {
    const sockPath = await aHost();
    const child = new HostedRun({ sockPath, runId: crypto.randomUUID(), start: { bin: path.join(dir, 'no-such-claude'), argv: [], env: {}, cwd: dir } });
    const errors = [];
    child.on('error', (e) => errors.push(e.code));
    expect(await new Promise((r) => child.once('exit', r))).toBe(-2);
    expect(errors).toEqual(['ENOENT']);
  });
});
