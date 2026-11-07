// A CODEX THREAD RESUMES WITHOUT ITS WHOLE HISTORY.
//
// What broke (reported in PR #31, from use): `thread/resume` answers with every
// turn of the thread in one frame. A long enough thread passes
// MAX_FRAME_LENGTH, the client calls the connection corrupt and ends the one
// app-server every Codex thread of that login shares, and the retry resumes
// the same thread and does it again. Nothing here reads those turns.
//
// Measured 2026-10-20 against real `codex app-server` builds, on a thread with
// one turn:
//   0.163.0  resumes with `excludeTurns: true`, turns=0, 2505 bytes down to
//            1810. Without it, Codex sends a `deprecationNotice`: "Full-history
//            hydration is deprecated for paginated threads; use
//            `excludeTurns: true` ..."
//   0.155.0, 0.160.0  take the field.
//   0.130.0, 0.148.0  refuse the whole resume: "thread/resume.excludeTurns
//            requires experimentalApi capability".
// So the field is asked for, and a Codex that refuses it is asked again
// without it, once per connection.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createCodexAppServer } from '../main/codex-app-server.mjs';

function fakeCodex() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const sent = [];
  const stdin = new EventEmitter();
  stdin.write = (chunk, cb) => {
    for (const line of String(chunk).split('\n')) if (line.trim()) sent.push(JSON.parse(line));
    cb?.(null);
    return true;
  };
  stdin.end = vi.fn();
  child.stdin = stdin;
  child.kill = vi.fn(() => true);
  return {
    child,
    sent,
    say: (msg) => child.stdout.emit('data', Buffer.from(`${JSON.stringify(msg)}\n`)),
    resumes: () => sent.filter((m) => m.method === 'thread/resume'),
  };
}

const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => { setImmediate(r); }); };

const OLD_CODEX = { code: -32600, message: 'thread/resume.excludeTurns requires experimentalApi capability' };

async function serverOn(codex) {
  const server = createCodexAppServer({ spawn: () => codex.child });
  const up = server.initialize();
  await settle();
  codex.say({ id: codex.sent.find((m) => m.method === 'initialize').id, result: { userAgent: 'test' } });
  await up;
  return server;
}

describe('resuming a codex thread', () => {
  it('asks for the thread without its turns', async () => {
    const codex = fakeCodex();
    const server = await serverOn(codex);
    const resumed = server.resumeThread({ threadId: 'th-1', cwd: '/w' });
    await settle();
    const [ask] = codex.resumes();
    expect(ask.params).toMatchObject({ threadId: 'th-1', cwd: '/w', excludeTurns: true });
    codex.say({ id: ask.id, result: { thread: { id: 'th-1', turns: [] } } });
    await expect(resumed).resolves.toMatchObject({ thread: { id: 'th-1' } });
  });

  it('asks again in full when this Codex refuses the field, and the thread still runs', async () => {
    const codex = fakeCodex();
    const server = await serverOn(codex);
    const heard = [];
    const resumed = server.resumeThread({ threadId: 'th-1' }, { onNotification: (method) => heard.push(method) });
    await settle();
    codex.say({ id: codex.resumes()[0].id, error: OLD_CODEX });
    await settle();
    const again = codex.resumes()[1];
    expect(again.params).toEqual({ threadId: 'th-1' });
    codex.say({ id: again.id, result: { thread: { id: 'th-1' } } });
    await expect(resumed).resolves.toMatchObject({ thread: { id: 'th-1' } });
    codex.say({ method: 'turn/started', params: { threadId: 'th-1', turn: { id: 'tu-1' } } });
    expect(heard).toEqual(['turn/started']);
  });

  it('does not ask a Codex that refused the field again on the same connection', async () => {
    const codex = fakeCodex();
    const server = await serverOn(codex);
    const first = server.resumeThread({ threadId: 'th-1' });
    await settle();
    codex.say({ id: codex.resumes()[0].id, error: OLD_CODEX });
    await settle();
    codex.say({ id: codex.resumes()[1].id, result: { thread: { id: 'th-1' } } });
    await first;
    const second = server.resumeThread({ threadId: 'th-2' });
    await settle();
    expect(codex.resumes()).toHaveLength(3);
    expect(codex.resumes()[2].params).toEqual({ threadId: 'th-2' });
    codex.say({ id: codex.resumes()[2].id, result: { thread: { id: 'th-2' } } });
    await expect(second).resolves.toBeTruthy();
  });

  it('asks both again in full when two resumes were refused at once', async () => {
    const codex = fakeCodex();
    const server = await serverOn(codex);
    const one = server.resumeThread({ threadId: 'th-1' });
    const two = server.resumeThread({ threadId: 'th-2' });
    await settle();
    const [a, b] = codex.resumes();
    codex.say({ id: a.id, error: OLD_CODEX });
    codex.say({ id: b.id, error: OLD_CODEX });
    await settle();
    const again = codex.resumes().slice(2);
    expect(again.map((m) => m.params)).toEqual([{ threadId: 'th-1' }, { threadId: 'th-2' }]);
    for (const m of again) codex.say({ id: m.id, result: { thread: { id: m.params.threadId } } });
    await expect(Promise.all([one, two])).resolves.toHaveLength(2);
  });

  it('passes any other refusal straight back, asked once', async () => {
    const codex = fakeCodex();
    const server = await serverOn(codex);
    const heard = [];
    const resumed = server.resumeThread({ threadId: 'th-1' }, { onNotification: (method) => heard.push(method) });
    await settle();
    codex.say({ id: codex.resumes()[0].id, error: { code: -32600, message: 'no rollout found for thread id th-1' } });
    await expect(resumed).rejects.toThrow(/no rollout found/);
    expect(codex.resumes()).toHaveLength(1);
    // The refused thread is no longer watched.
    codex.say({ method: 'turn/started', params: { threadId: 'th-1', turn: { id: 'tu-1' } } });
    expect(heard).toEqual([]);
  });
});
