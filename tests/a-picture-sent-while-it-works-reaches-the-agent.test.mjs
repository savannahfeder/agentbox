// A PICTURE SENT WHILE THE AGENT WORKS NEVER REACHED IT IN THE CLOUD.
//
// Reported 2026-10-22 with a screenshot (w-3b5d0836aa). A reply carrying a
// pasted board design went to a cloud run that was still working. The agent
// read `<docs>/attachments/…-pasted-65741.png`, found nothing, and ended with
// "the picture attached to your newest reply … is not on this cloud machine";
// the thread moved back to the Mac and they pasted the picture a second time.
//
// A reply to a finished run is wrapped by `replyBrief`, which names each picture
// by its absolute path, and the cloud relay sends any absolute path a line on
// its input names (`filesNamedIn`). A reply steered into a run still working
// went through `liveReplyBrief`, which carried their words alone, so the picture
// was only `![…](attachments/x.png)`: no absolute path, nothing sent. On Codex
// `turn/steer` carried text only, so the picture never rode as an image either.
// Measured by running each piece below against the code before the fix: the
// steered text held no absolute path, and `filesNamedIn` returned nothing for it.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Supervisor } from '../main/supervisor.mjs';
import { submitReply, liveReplyBrief } from '../main/live-replies.mjs';
import { filesNamedIn } from '../main/cloud/run.mjs';
import { createCodexWorker } from '../main/codex-session.mjs';
import { createCodexAppServer } from '../main/codex-app-server.mjs';

const dirs = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

function build({ engine = 'claude', remoteIdle = false } = {}) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'live-pic-')));
  dirs.push(tmp);
  const dir = path.join(tmp, 'store', 'astral');
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(dir, 'attachments', 'board-1.png'), 'not really a png');
  fs.writeFileSync(path.join(dir, 'notes.md'), '# notes\n');
  const product = { slug: 'astral', name: 'Astral', dir, repoPath: repo };
  const item = { id: 'w-live', product: 'astral', status: 'claimed', title: 'Room board', body: 'Draw the board.', labels: ['founder'] };
  const sup = new Supervisor(
    {
      home: path.join(tmp, 'home'), storeRoot: path.join(tmp, 'store'), claudeBin: '/nonexistent/claude',
      codexBin: engine === 'codex' ? '/nonexistent/codex' : null,
      maxConcurrentSessions: 3, authProfiles: ['default'], codexHome: path.join(tmp, 'codex-home'),
    },
    {
      listItems: () => [item], listProducts: () => [product], readItem: () => item,
      isDue: () => true, settleAnswer() {}, recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  const sent = [];
  sup.sessions.set(item.id, {
    product: 'astral', engine, remoteIdle,
    child: { steer: async (text, pictures) => { sent.push({ text, pictures }); } },
  });
  const reply = (answer) => submitReply(sup, { product: 'astral', id: item.id, answer }, () => ({ answer }));
  return { sup, sent, reply, dir, repo, store: path.join(tmp, 'store'), picture: path.join(dir, 'attachments', 'board-1.png') };
}

const WITH_PICTURE = 'Show me this one in light mode too.\n\n![pasted-65741.png](attachments/board-1.png)';

describe('a reply with a picture, sent while a Claude Code run works', () => {
  it('names the picture by the path the agent can open, and keeps their words last', async () => {
    const { sent, reply, picture } = build();
    await reply(WITH_PICTURE);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain(`- ${picture}`);
    expect(sent[0].text).toMatch(/READ IT BEFORE YOU DO ANYTHING ELSE/);
    expect(sent[0].text.trimEnd().endsWith(WITH_PICTURE)).toBe(true);
  });

  it('is a line the cloud run sends the picture up for', async () => {
    const { sent, reply, picture, repo, store } = build();
    await reply(WITH_PICTURE);
    // The line exactly as claude-input writes it to a cloud run's input.
    const line = JSON.stringify({ type: 'user', uuid: 'u', message: { role: 'user', content: sent[0].text }, parent_tool_use_id: null, session_id: '' }) + '\n';
    expect(filesNamedIn(line, { cwd: repo, roots: [store] })).toEqual([picture]);
  });

  it('lists another file it names under its own heading, not as a picture', async () => {
    const { sent, reply, dir } = build();
    await reply('And the notes in notes.md.');
    expect(sent[0].text).toContain(`- ${path.join(dir, 'notes.md')}`);
    expect(sent[0].text).not.toMatch(/ATTACHED A PICTURE/);
  });

  it('says a picture that is not on disk is missing, rather than naming a path to nothing', async () => {
    const { sent, reply } = build();
    await reply('This one:\n\n![gone.png](attachments/gone.png)');
    expect(sent[0].text).toMatch(/NO LONGER ON DISK/);
    expect(sent[0].text).not.toMatch(/\/attachments\/gone\.png/);
  });

  it('leaves a reply that names no file exactly as it was', async () => {
    const { sent, reply } = build();
    await reply('Go with K2.');
    expect(sent[0].text).toBe(liveReplyBrief('Go with K2.'));
  });

  it('still sends a held conversation exactly what they typed', async () => {
    const { sent, reply } = build({ remoteIdle: true });
    await reply(WITH_PICTURE);
    expect(sent[0].text).toBe(WITH_PICTURE);
  });
});

describe('a reply with a picture, sent while a Codex run works', () => {
  it('hands the running turn the picture itself, beside the words', async () => {
    const { sent, reply, picture } = build({ engine: 'codex' });
    await reply(WITH_PICTURE);
    expect(sent[0].pictures).toEqual([picture]);
    expect(sent[0].text).toMatch(/attached to this message as an image/);
  });

  it('hands no picture when the reply carries none', async () => {
    const { sent, reply } = build({ engine: 'codex' });
    await reply('Go with K2.');
    expect(sent[0].pictures).toEqual([]);
  });

  it('puts the picture in the turn/steer frame as a localImage', async () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.kill = () => {};
    const frames = [];
    child.stdin.write = (chunk, cb) => { frames.push(JSON.parse(String(chunk))); cb?.(); return true; };
    const server = createCodexAppServer({ transport: child });
    const pending = server.steerTurn('T', 'V', 'look', ['/store/astral/attachments/board-1.png']);
    expect(frames[0].params.input).toEqual([
      { type: 'text', text: 'look' },
      { type: 'localImage', path: '/store/astral/attachments/board-1.png' },
    ]);
    child.stdout.emit('data', JSON.stringify({ id: frames[0].id, result: { turnId: 'V' } }) + '\n');
    await pending;
    server.close();
  });

  it('passes the pictures from the worker to the server', async () => {
    const calls = [];
    const server = {
      startThread: async () => ({ threadId: 'thread' }), startTurn: async () => ({ turn: { id: 'turn' } }), unwatch() {},
      steerTurn: async (...args) => { calls.push(args); return { turnId: 'turn' }; },
    };
    const worker = createCodexWorker({ server });
    worker.stderr.on('data', () => {});
    await new Promise((r) => setImmediate(r));
    await worker.steer('look', ['/a.png']);
    expect(calls).toEqual([['thread', 'turn', 'look', ['/a.png']]]);
  });
});

describe('the cloud run, given a picture by its short link', () => {
  const line = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';

  it('sends a picture in the attachments folder that a line names only as attachments/…', () => {
    const { dir, repo, store, picture } = build();
    expect(filesNamedIn(line(WITH_PICTURE), { cwd: repo, roots: [store], docs: dir })).toEqual([picture]);
  });

  it('reads a short link at the start of a line, past the escaped line break before it', () => {
    const { dir, repo, store, picture } = build();
    expect(filesNamedIn(line('first line\nattachments/board-1.png'), { cwd: repo, roots: [store], docs: dir })).toEqual([picture]);
  });

  it('sends it once when the line names it both ways', () => {
    const { dir, repo, store, picture } = build();
    expect(filesNamedIn(line(`${WITH_PICTURE}\n- ${picture}`), { cwd: repo, roots: [store], docs: dir })).toEqual([picture]);
  });

  it('leaves a short link outside the attachments folder to the documents copy', () => {
    const { dir, repo, store } = build();
    expect(filesNamedIn(line('see notes.md'), { cwd: repo, roots: [store], docs: dir })).toEqual([]);
  });

  it('refuses a short link that climbs out of the folder, or names nothing', () => {
    const { dir, repo, store } = build();
    fs.writeFileSync(path.join(store, 'secret.png'), 'x');
    expect(filesNamedIn(line('![a](attachments/../../secret.png) ![b](attachments/missing.png)'), { cwd: repo, roots: [store], docs: dir })).toEqual([]);
  });

  it('reads no short link at all when it is not told the documents folder', () => {
    const { repo, store } = build();
    expect(filesNamedIn(line(WITH_PICTURE), { cwd: repo, roots: [store] })).toEqual([]);
  });
});
