// What broke: nothing yet, then four things Codex found (review of step 1,
// 2026-10-14). Her phone only worked while the computer was awake (it talked
// to it directly, main/phone-link.mjs). Step 1 of docs/cloud/PHONE-PLAN.md:
// the computer writes a copy of each thread of a project she put on her phone
// to her own rows online, and takes the replies, new threads, snoozes and
// closes her phone left there while it was shut. Codex then showed a copy
// carried raw ledger fields and keys (finding 2), a command could run twice if
// the computer stopped half way (3), a second computer on the same account
// took the first one's commands (4), a reply to a thread started on the phone
// went nowhere (8), and one big thread stopped the rest being sent (9).
// Measured with the in-memory cloud, which keeps the database's rules.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox, phoneDevice } from '../main/phone-inbox.mjs';
import { threadSnapshot, threadsWorthCarrying, checkCommand, madeHere, bytesOf, hideSecrets, SNAPSHOT_LIMITS } from '../shared/phone-snapshot.mjs';

const DAY = 24 * 3600_000;
const NOW = Date.parse('2026-10-14T12:00:00Z');

function setup({ items = {}, chosen = [{ slug: 'alpha', name: 'Alpha' }], apply, cloud = createMemoryCloud(), me, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-inbox-')), history } = {}) {
  // The database's clock and this computer's agree here, at NOW.
  cloud.now = () => NOW;
  me ??= signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const stranger = signUpMemory(cloud, { email: `stranger-${Math.random()}@example.com` });
  const mac = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const other = memoryBackend(cloud, stranger);
  const applied = [];
  const state = { chosen, items, history: history ?? {} };
  const make = () => createPhoneInbox({
    backend: mac,
    projects: () => state.chosen,
    listItems: (slug) => state.items[slug] ?? [],
    historyOf: (slug, id) => state.history[`${slug}/${id}`] ?? [{ id, ts: NOW, source: 'founder', patch: { body: `brief of ${id}` } }],
    apply: apply ?? (async (cmd) => { applied.push(cmd); }),
    stateFile: path.join(dir, 'phone-inbox.json'),
    home: '/Users/someone',
    now: () => NOW,
  });
  const inbox = make();
  // What her phone sends: a command for the computer the project lives on.
  const send = (c) => phone.addPhoneCommand({ device: inbox.device, ...c });
  return { cloud, me, mac, phone, other, inbox, make, send, applied, state, dir };
}

const item = (id, extra = {}) => ({ id, title: `Thread ${id}`, status: 'open', updatedAt: NOW - 1000, createdAt: NOW - 5000, ...extra });

describe('the computer puts her threads on her phone', () => {
  it('sends each thread of a chosen project once, and again only when it changes', async () => {
    const t = setup({ items: { alpha: [item('w-1'), item('w-2')] } });
    expect((await t.inbox.syncOnce()).sent).toBe(2);
    const seen = await t.phone.phoneThreads();
    expect(seen.map((r) => r.item).sort()).toEqual(['w-1', 'w-2']);
    expect(seen.every((r) => r.device === t.inbox.device)).toBe(true);
    expect(seen[0].snapshot.history[0]).toMatchObject({ source: 'founder', patch: { body: expect.stringMatching(/^brief of/) } });
    expect((await t.phone.phoneProjects()).map((p) => p.name)).toEqual(['Alpha']);

    expect((await t.inbox.syncOnce()).sent).toBe(0);
    t.state.items.alpha[0] = item('w-1', { result: 'Done, it works.' });
    expect((await t.inbox.syncOnce()).sent).toBe(1);
  });

  it('carries nothing from a project she did not choose', async () => {
    const t = setup({ items: { alpha: [item('w-1')], private: [item('w-9')] } });
    await t.inbox.syncOnce();
    expect((await t.phone.phoneThreads()).map((r) => r.item)).toEqual(['w-1']);
  });

  it('takes a thread off the phone when it is gone, and a project when she turns it off', async () => {
    const t = setup({ items: { alpha: [item('w-1'), item('w-2')] } });
    await t.inbox.syncOnce();
    t.state.items.alpha = [item('w-2')];
    await t.inbox.syncOnce();
    expect((await t.phone.phoneThreads()).map((r) => r.item)).toEqual(['w-2']);
    t.state.chosen = [];
    await t.inbox.syncOnce();
    expect(await t.phone.phoneThreads()).toEqual([]);
    expect(await t.phone.phoneProjects()).toEqual([]);
  });

  it('carries open threads and the last fortnight of finished ones, not older', () => {
    const rows = threadsWorthCarrying([
      item('open-old', { updatedAt: NOW - 90 * DAY }),
      item('done-recent', { status: 'done', updatedAt: NOW - 13 * DAY }),
      item('done-old', { status: 'done', updatedAt: NOW - 15 * DAY }),
      item('agent-row', { agent: true }),
    ], { now: NOW });
    expect(rows.map((r) => r.id).sort()).toEqual(['done-recent', 'open-old']);
  });

  it('one thread the cloud will not take does not stop the others', async () => {
    const t = setup({ items: { alpha: [item('w-1'), item('w-2'), item('w-3')] } });
    const put = t.mac.putPhoneThreads;
    t.mac.putPhoneThreads = async (device, project, rows) => {
      if (rows.some((r) => r.item === 'w-2')) throw new Error('too big');
      return put(device, project, rows);
    };
    await t.inbox.syncOnce();
    expect((await t.phone.phoneThreads()).map((r) => r.item).sort()).toEqual(['w-1', 'w-3']);
  });
});

describe('what a copy carries', () => {
  const row = {
    id: 'w-1', title: 'Fix login', body: 'It loops', status: 'blocked', result: 'Fixed.', updatedAt: NOW, createdAt: NOW - 1,
    claim: { holder: 'macbook-pro:4242', leaseUntil: NOW + 1 }, epoch: 7, visibleTo: ['someone'], runner: 'p-1',
    sessionId: 'abc', worktree: '/Users/someone/code/x', somethingNew: 'not named',
    wrote: { title: { ts: 1, source: 'founder', by: 'p-1' }, result: { ts: 2, source: 'agent' }, claim: { ts: 3, source: 'system' } },
  };
  const history = [
    { id: 'w-1', ts: 1, source: 'founder', patch: { title: 'Fix login', body: 'It loops' }, by: 'p-1', uid: 'u-1' },
    { id: 'w-1', ts: 2, source: 'agent', claim: { holder: 'macbook-pro:4242' }, epoch: 3, patch: { status: 'claimed' } },
    { id: 'w-1', ts: 3, source: 'agent', patch: { result: 'Used key sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ in /Users/someone/code/x', permissionMode: 'bypassPermissions', model: 'opus' } }, // public-check: allow (made-up keys, to prove they are hidden)
    { id: 'w-1', ts: 4, source: 'agent', heartbeat: true, patch: { note: 'alive' } },
  ];
  it('is built from named fields only: no lease, epoch, who may see it, paths of the run, or fields nobody named', () => {
    const snap = threadSnapshot(row, history, SNAPSHOT_LIMITS, { home: '/Users/someone' });
    expect(Object.keys(snap.item).sort()).toEqual(['body', 'createdAt', 'id', 'result', 'status', 'title', 'updatedAt', 'wrote']);
    expect(snap.item.wrote).toEqual({ title: { ts: 1, source: 'founder' }, result: { ts: 2, source: 'agent' } });
    expect(snap.history.map((l) => l.ts)).toEqual([1, 3]);
    expect(snap.history[0]).toEqual({ id: 'w-1', ts: 1, source: 'founder', patch: { title: 'Fix login', body: 'It loops' } });
    expect(Object.keys(snap.history[1].patch)).toEqual(['result']);
    expect(JSON.stringify(snap)).not.toMatch(/macbook|4242|bypassPermissions|sessionId|somethingNew|visibleTo/);
  });
  it('hides keys and her home folder in the words themselves', () => {
    const snap = threadSnapshot(row, history, SNAPSHOT_LIMITS, { home: '/Users/someone' });
    expect(snap.history[1].patch.result).toBe('Used key [hidden] in ~/code/x');
    for (const secret of ['ghp_' + 'a'.repeat(36), 'AKIA' + 'B'.repeat(16), 'xoxb-1234567890-abcdef', '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----', 'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3.SflKxwRJSMeKKF2QT4fw']) { // public-check: allow (made-up keys, to prove they are hidden)
      expect(hideSecrets(`x ${secret} y`)).toBe('x [hidden] y');
    }
    // The case that must NOT match: ordinary words, ids and short codes.
    expect(hideSecrets('task w-1dc7ee2408, sk-short, the AKIA docs')).toBe('task w-1dc7ee2408, sk-short, the AKIA docs');
  });
  it('keeps a long thread to its latest lines and says how many it left behind', () => {
    const many = Array.from({ length: SNAPSHOT_LIMITS.lines + 5 }, (_, i) => ({ id: 'w-1', ts: i, source: 'agent', patch: { result: `line ${i}` } }));
    const snap = threadSnapshot(item('w-1'), many);
    expect(snap.history).toHaveLength(SNAPSHOT_LIMITS.lines);
    expect(snap.history[0].patch.result).toBe('line 5');
    expect(snap.olderLines).toBe(5);
  });
  it('stays under the limit in bytes, not characters, even in a language of wide letters', () => {
    const wide = '漢'.repeat(SNAPSHOT_LIMITS.textChars);
    const many = Array.from({ length: SNAPSHOT_LIMITS.lines }, (_, i) => ({ id: 'w-1', ts: i, source: 'agent', patch: { result: wide, note: wide } }));
    const snap = threadSnapshot(item('w-1', { body: wide, result: wide, note: wide, answer: wide }), many);
    expect(bytesOf(snap)).toBeLessThanOrEqual(SNAPSHOT_LIMITS.bytes);
    expect(snap.history.at(-1).ts).toBe(SNAPSHOT_LIMITS.lines - 1);
  });
});

describe('the computer takes what her phone left', () => {
  let t;
  beforeEach(() => { t = setup({ items: { alpha: [item('w-1')] } }); });

  it('does each command in the order she made it, then marks it done', async () => {
    t.cloud.now = () => NOW;
    await t.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'first' } });
    t.cloud.now = () => NOW + 1000;
    await t.send({ project: 'alpha', kind: 'new', payload: { title: 'second' } });
    expect((await t.inbox.syncOnce()).taken).toBe(2);
    expect(t.applied.map((c) => c.kind)).toEqual(['reply', 'new']);
    expect((await t.phone.phoneCommands()).every((c) => c.takenAt && c.outcome === 'done')).toBe(true);
  });

  it('refuses, and says why, a command it may not do', async () => {
    await t.send({ project: 'private', item: 'w-9', kind: 'reply', payload: { text: 'x' } });
    await t.send({ project: 'alpha', item: 'w-404', kind: 'close' });
    await t.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: '   ' } });
    await t.inbox.syncOnce();
    expect(t.applied).toEqual([]);
    expect((await t.phone.phoneCommands()).map((c) => c.outcome)).toEqual([
      'refused: that project is not on your phone',
      'refused: that thread is not on your phone',
      'refused: an empty reply',
    ]);
  });

  it('marks a command the app itself refused, and carries on with the next', async () => {
    const u = setup({ items: { alpha: [item('w-1')] }, apply: async (cmd) => { if (cmd.payload.text === 'bad') throw new Error('thread is running'); } });
    await u.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'bad' } });
    await u.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'good' } });
    await u.inbox.syncOnce();
    expect((await u.phone.phoneCommands()).map((c) => c.outcome)).toEqual(['refused: thread is running', 'done']);
  });

  it('never does a command twice when marking it fails', async () => {
    await t.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'once' } });
    const mark = t.mac.markPhoneCommand;
    t.mac.markPhoneCommand = async () => { throw new Error('offline'); };
    await expect(t.inbox.syncOnce()).rejects.toThrow('offline');
    t.mac.markPhoneCommand = mark;
    await t.inbox.syncOnce();
    expect(t.applied).toHaveLength(1);
    expect((await t.phone.phoneCommands())[0].outcome).toBe('done');
  });

  // Codex's finding 3: the computer stops after the reply is written and
  // before it wrote down that it had. The next start finds the reply in the
  // thread and does not send it again.
  it('never does a reply twice when the computer stopped half way through it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-inbox-'));
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'half@example.com' });
    let landedReply = null;
    const first = setup({ cloud, me, dir, items: { alpha: [item('w-1')] }, apply: async (cmd) => { landedReply = cmd.payload.text; throw Object.assign(new Error('power cut'), { crash: true }); } });
    await first.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'ship it' } });
    // The power cut: the reply is in the thread, and nothing after it ran.
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'phone-inbox.json'), 'utf8'));
    const [cmd] = await first.phone.waitingPhoneCommands(first.inbox.device);
    fs.writeFileSync(path.join(dir, 'phone-inbox.json'), JSON.stringify({ ...state, doing: { [cmd.id]: { at: NOW, after: NOW - 1 } } }));
    expect(landedReply).toBe(null);
    const second = setup({ cloud, me, dir, items: { alpha: [item('w-1')] }, history: { 'alpha/w-1': [{ id: 'w-1', ts: NOW, source: 'founder', patch: { answer: 'ship it', fromPhone: cmd.id } }] } });
    await second.inbox.syncOnce();
    expect(second.applied).toEqual([]);
    expect((await second.phone.phoneCommands())[0].outcome).toBe('done');
  });

  it('does a reply again when the computer stopped before it landed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-inbox-'));
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'early@example.com' });
    const first = setup({ cloud, me, dir, items: { alpha: [item('w-1')] } });
    const c = await first.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'ship it' } });
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'phone-inbox.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'phone-inbox.json'), JSON.stringify({ ...state, doing: { [c.id]: { at: NOW, after: NOW - 1 } } }));
    const second = setup({ cloud, me, dir, items: { alpha: [item('w-1')] } });
    await second.inbox.syncOnce();
    expect(second.applied.map((x) => x.payload.text)).toEqual(['ship it']);
  });

  it('never starts a thread twice when the computer stopped half way through it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-inbox-'));
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'twice@example.com' });
    const first = setup({ cloud, me, dir, items: { alpha: [item('w-1')] } });
    const c = await first.send({ project: 'alpha', kind: 'new', payload: { title: 'Ship it', body: 'today' } });
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'phone-inbox.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'phone-inbox.json'), JSON.stringify({ ...state, doing: { [c.id]: { at: NOW, ids: ['w-1'] } } }));
    const made = item('w-made00001', { title: 'Ship it', body: 'today', createdAt: NOW, fromPhone: c.id });
    const second = setup({ cloud, me, dir, items: { alpha: [item('w-1'), made] } });
    await second.inbox.syncOnce();
    expect(second.applied).toEqual([]);
    // And a reply to the row the phone showed reaches the row it became.
    await second.send({ project: 'alpha', item: madeHere(c.id), kind: 'reply', payload: { text: 'and this' } });
    await second.inbox.syncOnce();
    expect(second.applied.map((x) => [x.item, x.payload.text])).toEqual([['w-made00001', 'and this']]);
  });

  // Codex's finding 8.
  it('a reply to a thread started on the phone goes to the row it became', async () => {
    const u = setup({ items: { alpha: [item('w-1')] }, apply: async (cmd) => {
      u.applied.push(cmd);
      if (cmd.kind === 'new') { u.state.items.alpha.push(item('w-real00001', { title: cmd.payload.title })); return { id: 'w-real00001' }; }
      return {};
    } });
    const made = await u.send({ project: 'alpha', kind: 'new', payload: { title: 'Ship it' } });
    await u.send({ project: 'alpha', item: madeHere(made.id), kind: 'reply', payload: { text: 'today please' } });
    await u.inbox.syncOnce();
    expect(u.applied.map((c) => [c.kind, c.item])).toEqual([['new', null], ['reply', 'w-real00001']]);
    expect((await u.phone.phoneCommands()).map((c) => c.outcome)).toEqual(['done', 'done']);
  });

  it('remembers a done command across a restart of the computer', async () => {
    const c = await t.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'once' } });
    t.mac.markPhoneCommand = async () => { throw new Error('offline'); };
    await expect(t.inbox.syncOnce()).rejects.toThrow();
    const again = t.make();
    t.mac.markPhoneCommand = memoryBackend(t.cloud, t.me).markPhoneCommand;
    await again.syncOnce();
    expect(t.applied).toHaveLength(1);
    expect((await t.phone.phoneCommands()).find((x) => x.id === c.id).outcome).toBe('done');
  });
});

// Codex's finding 4.
describe('two computers on one account', () => {
  it('each takes only the commands left on its own projects, and their same-named projects stay apart', async () => {
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'two@example.com' });
    const a = setup({ cloud, me, items: { alpha: [item('w-1')] }, chosen: [{ slug: 'alpha', name: 'Alpha at work' }] });
    const b = setup({ cloud, me, items: { alpha: [item('w-1')] }, chosen: [{ slug: 'alpha', name: 'Alpha at home' }] });
    expect(a.inbox.device).not.toBe(b.inbox.device);
    await a.inbox.syncOnce();
    await b.inbox.syncOnce();
    expect((await a.phone.phoneProjects()).map((p) => p.name).sort()).toEqual(['Alpha at home', 'Alpha at work']);
    expect((await a.phone.phoneThreads())).toHaveLength(2);
    await b.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'for home' } });
    await a.inbox.syncOnce();
    expect(a.applied).toEqual([]);
    expect((await a.phone.waitingPhoneCommands(b.inbox.device))).toHaveLength(1);
    await b.inbox.syncOnce();
    expect(b.applied.map((c) => c.payload.text)).toEqual(['for home']);
  });
});

// Codex's second review.
describe('what the second review found', () => {
  // Finding 4: the words alone took an earlier "yes" for the second.
  it('a second "yes" after a crash is sent, not mistaken for the first', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-inbox-'));
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'yes@example.com' });
    const history = { 'alpha/w-1': [{ id: 'w-1', ts: NOW - 60_000, source: 'founder', patch: { answer: 'yes' } }] };
    const first = setup({ cloud, me, dir, items: { alpha: [item('w-1')] }, history });
    const c = await first.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'yes' } });
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'phone-inbox.json'), 'utf8'));
    // It stopped after writing down where the thread was, before the reply.
    fs.writeFileSync(path.join(dir, 'phone-inbox.json'), JSON.stringify({ ...state, doing: { [c.id]: { at: NOW, after: NOW - 60_000 } } }));
    const second = setup({ cloud, me, dir, items: { alpha: [item('w-1')] }, history });
    await second.inbox.syncOnce();
    expect(second.applied.map((x) => x.payload.text)).toEqual(['yes']);
  });

  it('two new threads that both fit are not claimed: the command runs again', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-inbox-'));
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'two-new@example.com' });
    const first = setup({ cloud, me, dir, items: { alpha: [item('w-1')] } });
    const c = await first.send({ project: 'alpha', kind: 'new', payload: { title: 'Ship', body: 'it' } });
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'phone-inbox.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'phone-inbox.json'), JSON.stringify({ ...state, doing: { [c.id]: { at: NOW, ids: ['w-1'] } } }));
    const twins = [item('w-aaaaaaaaaa', { title: 'Ship', body: 'it' }), item('w-bbbbbbbbbb', { title: 'Ship', body: 'it' })];
    const second = setup({ cloud, me, dir, items: { alpha: [item('w-1'), ...twins] } });
    await second.inbox.syncOnce();
    expect(second.applied.map((x) => x.kind)).toEqual(['new']);
  });

  // Finding 1: signing out while a pass is sending.
  it('a pass under way when she signs out sends nothing more, and nothing as anybody else', async () => {
    let signedIn = true;
    const cloud = createMemoryCloud();
    cloud.now = () => NOW;
    const me = signUpMemory(cloud, { email: 'leaving@example.com' });
    const t = setup({ cloud, me, items: { alpha: [item('w-1')], beta: [item('w-2')] }, chosen: [{ slug: 'alpha', name: 'Alpha' }, { slug: 'beta', name: 'Beta' }] });
    const inbox = createPhoneInbox({
      backend: { ...t.mac, putPhoneThreads: async (...a) => { await t.mac.putPhoneThreads(...a); signedIn = false; } },
      owner: me, alive: () => signedIn,
      projects: () => t.state.chosen, listItems: (slug) => t.state.items[slug] ?? [], historyOf: () => [],
      apply: async () => {}, stateFile: path.join(t.dir, 'other.json'), now: () => NOW,
    });
    expect((await inbox.syncOnce()).stopped).toBe(true);
    expect((await t.phone.phoneProjects()).map((p) => p.name)).toEqual(['Alpha']);
    // And a write for one person through another's sign-in is refused outright.
    const other = memoryBackend(cloud, signUpMemory(cloud, { email: 'next@example.com' }));
    await expect(other.putPhoneProject({ owner: me, device: 'a1b2c3d4e5f6', project: 'beta', name: 'Beta' })).rejects.toThrow(/not allowed/);
    await expect(other.putPhoneThreads('a1b2c3d4e5f6', 'beta', [], me)).rejects.toThrow(/not allowed/);
  });

  // Finding 5: a failure was counted as sent.
  it('a copy the cloud did not take goes again later, not only when it changes', async () => {
    let clock = NOW;
    const t = setup({ items: { alpha: [item('w-1')] } });
    let fail = true;
    let tries = 0;
    const put = t.mac.putPhoneThreads;
    t.mac.putPhoneThreads = async (...a) => { tries += 1; if (fail) throw new Error('offline'); return put(...a); };
    const inbox = createPhoneInbox({
      backend: t.mac, owner: t.me, projects: () => t.state.chosen, listItems: (slug) => t.state.items[slug] ?? [], historyOf: () => [],
      apply: async () => {}, stateFile: path.join(t.dir, 'retry.json'), now: () => clock,
    });
    await inbox.syncOnce();
    await inbox.syncOnce();
    expect(tries).toBe(1);
    fail = false;
    clock += 61_000;
    await inbox.syncOnce();
    expect(tries).toBe(2);
    expect((await t.phone.phoneThreads()).map((r) => r.item)).toEqual(['w-1']);
  });

  // Finding 8: a reply to the first of 501 new threads lost its row.
  it('remembers the row a phone thread became for as long as a reply could need it', async () => {
    let n = 0;
    const u = setup({ items: { alpha: [item('w-1')] }, apply: async (cmd) => {
      if (cmd.kind !== 'new') { u.applied.push(cmd); return {}; }
      const id = `w-${String(n += 1).padStart(10, '0')}`;
      u.state.items.alpha.push(item(id, { title: cmd.payload.title }));
      return { id };
    } });
    const firstNew = await u.send({ project: 'alpha', kind: 'new', payload: { title: 'first' } });
    for (let i = 0; i < 520; i += 1) await u.send({ project: 'alpha', kind: 'new', payload: { title: `t${i}` } });
    await u.send({ project: 'alpha', item: madeHere(firstNew.id), kind: 'reply', payload: { text: 'to the first' } });
    await u.inbox.syncOnce();
    expect(u.applied.map((c) => [c.item, c.payload.text])).toEqual([['w-0000000001', 'to the first']]);
  });

  // Finding 7: the id lived in the store, so a copied store was the same computer.
  it('the computer id is this installation and this store together', () => {
    const app1 = fs.mkdtempSync(path.join(os.tmpdir(), 'app-'));
    const app2 = fs.mkdtempSync(path.join(os.tmpdir(), 'app-'));
    const a = phoneDevice(app1, '/stores/one');
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(phoneDevice(app1, '/stores/one')).toBe(a);
    expect(phoneDevice(app1, '/stores/two')).not.toBe(a);
    expect(phoneDevice(app2, '/stores/one')).not.toBe(a);
    expect(fs.statSync(path.join(app1, 'phone-install-id')).mode & 0o077).toBe(0);
  });

  // Finding 2.
  it('hides a value given a secret\'s name, and leaves settings and names alone', () => {
    for (const [said, shown] of [
      ['AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'AWS_SECRET_ACCESS_KEY=[hidden]'],
      ['password: hunter22', 'password: [hidden]'],
      ['"api_key": "abcd1234efgh"', '"api_key": "[hidden]"'],
      ['Authorization: Basic dXNlcjpwYXNzd29yZA==', 'Authorization: [hidden] [hidden]'],
      // Codex's third review: short, numeric and quoted values, and the prose that must stay.
      ['PASSWORD=12345678', 'PASSWORD=[hidden]'],
      ['password=abc', 'password=[hidden]'],
      ['API_KEY=1234-abcd-efgh', 'API_KEY=[hidden]'],
      ['password="correct horse battery staple"', 'password="[hidden]"'],
      ["'client_secret': 'xyz'", "'client_secret': '[hidden]'"],
      ['GITHUB_TOKEN=abc', 'GITHUB_TOKEN=[hidden]'],
      ['token=Zm9vYmFyYmF6cXV4MTIz', 'token=[hidden]'],
      ['token: unexpected identifier', 'token: unexpected identifier'],
      ['the password field is required', 'the password field is required'],
      // Codex's fourth review: a value in brackets, a long quoted one, an
      // escaped quote, and settings that are only numbers. Hiding wins over
      // prose: a bracket after a password's name is taken for its value.
      ['password=(hunter22)', 'password=[hidden]'],
      ['Set password: (see vault)', 'Set password: [hidden] vault)'],
      [`password="${'a'.repeat(501)}" x`, 'password="[hidden]" x'],
      ['password="abc\\"defghi" next', 'password="[hidden]" next'],
      ['MAX_TOKENS=128000', 'MAX_TOKENS=128000'],
      ['TOKEN_LIMIT=8192', 'TOKEN_LIMIT=8192'],
      ['a bare XyZ12abcDEF34ghiJKL56mnoPQR78stuVW key', 'a bare [hidden] key'],
      ['max_tokens=128000', 'max_tokens=128000'],
      ['author: Sam Lee', 'author: Sam Lee'],
      ['commit 3f2a9c1e8b7d6f5a4c3b2a1908f7e6d5c4b3a291', 'commit 3f2a9c1e8b7d6f5a4c3b2a1908f7e6d5c4b3a291'],
      ['my secret plan', 'my secret plan'],
    ]) expect(hideSecrets(said), said).toBe(shown);
  });
});

// Codex's third review.
describe('what the third review found', () => {
  // Finding 5: the moment was taken for the order. The command's own id on its
  // line is what counts now, and only that.
  it('after a crash, a reply counts as sent only if its line carries the command\'s id', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-inbox-'));
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'ids@example.com' });
    const first = setup({ cloud, me, dir, items: { alpha: [item('w-1')] } });
    const c = await first.send({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'yes' } });
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'phone-inbox.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'phone-inbox.json'), JSON.stringify({ ...state, doing: { [c.id]: { at: NOW } } }));
    // The same words, the same moment, written by somebody else: not it.
    const lookalike = setup({ cloud, me, dir, items: { alpha: [item('w-1')] }, history: { 'alpha/w-1': [{ id: 'w-1', ts: NOW, source: 'founder', patch: { answer: 'yes' } }] } });
    await lookalike.inbox.syncOnce();
    expect(lookalike.applied.map((x) => x.payload.text)).toEqual(['yes']);
  });

  // Finding 3: Undo and the computer both won.
  it('a close taken back on the phone before the computer claims it is never done', async () => {
    const t = setup({ items: { alpha: [item('w-1')] } });
    const c = await t.send({ project: 'alpha', item: 'w-1', kind: 'close' });
    // The computer has read the list; she takes it back; then it gets to it.
    const claim = t.mac.claimPhoneCommand;
    t.mac.claimPhoneCommand = async (...a) => { expect(await t.phone.takeBackPhoneCommand(c.id, 'refused: taken back on the phone')).toBe(true); return claim(...a); };
    await t.inbox.syncOnce();
    expect(t.applied).toEqual([]);
    expect((await t.phone.phoneCommands())[0].outcome).toBe('refused: taken back on the phone');
  });
  it('a close the computer has claimed can no longer be taken back', async () => {
    const t = setup({ items: { alpha: [item('w-1')] } });
    const c = await t.send({ project: 'alpha', item: 'w-1', kind: 'close' });
    const u = setup({ cloud: t.cloud, me: t.me, dir: t.dir, items: { alpha: [item('w-1')] }, apply: async (cmd) => {
      expect(await t.phone.takeBackPhoneCommand(c.id, 'refused: taken back on the phone')).toBe(false);
      u.applied.push(cmd);
    } });
    await u.inbox.syncOnce();
    expect(u.applied.map((x) => x.kind)).toEqual(['close']);
    expect((await t.phone.phoneCommands())[0].outcome).toBe('done');
  });

  // Finding 2: a new computer id kept the old one's "already sent".
  it('under a new computer id everything is sent again', async () => {
    const cloud = createMemoryCloud();
    cloud.now = () => NOW;
    const me = signUpMemory(cloud, { email: 'moved@example.com' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-inbox-'));
    const phone = memoryBackend(cloud, me);
    const make = (device) => createPhoneInbox({
      backend: memoryBackend(cloud, me), owner: me, device, projects: () => [{ slug: 'alpha', name: 'Alpha' }],
      listItems: () => [item('w-1')], historyOf: () => [], apply: async () => {}, stateFile: path.join(dir, 's.json'), now: () => NOW,
    });
    await make('aaaaaaaaaaaa').syncOnce();
    await make('bbbbbbbbbbbb').syncOnce();
    expect((await phone.phoneProjects()).map((p) => p.device).sort()).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect((await phone.phoneThreads()).map((t) => t.device).sort()).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
  });
});

describe('her phone rows are hers alone', () => {
  it('a stranger reads none of her threads or commands, and marking one changes nothing', async () => {
    const t = setup({ items: { alpha: [item('w-1')] } });
    await t.inbox.syncOnce();
    const cmd = await t.send({ project: 'alpha', item: 'w-1', kind: 'close' });
    expect(await t.other.phoneThreads()).toEqual([]);
    expect(await t.other.phoneProjects()).toEqual([]);
    expect(await t.other.waitingPhoneCommands(t.inbox.device)).toEqual([]);
    await t.other.markPhoneCommand(cmd.id, 'done');
    expect((await t.phone.waitingPhoneCommands(t.inbox.device)).map((c) => c.id)).toEqual([cmd.id]);
  });

  it('a command already marked keeps its first outcome', async () => {
    const t = setup();
    const cmd = await t.send({ project: 'alpha', kind: 'new', payload: { title: 'x' } });
    await t.mac.markPhoneCommand(cmd.id, 'done');
    await t.mac.markPhoneCommand(cmd.id, 'refused: late');
    expect((await t.phone.phoneCommands())[0].outcome).toBe('done');
  });
});

describe('what the phone may ask', () => {
  const ctx = { projects: ['alpha'], hasItem: (p, id) => id === 'w-1' };
  it('takes the four things and nothing else', () => {
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'hi' } }, ctx)).toBeNull();
    expect(checkCommand({ project: 'alpha', kind: 'new', payload: { body: 'hi' } }, ctx)).toBeNull();
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'snooze', payload: { until: NOW + DAY } }, ctx)).toBeNull();
    // Waking a snoozed thread is a snooze until no time at all.
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'snooze', payload: { until: 0 } }, ctx)).toBeNull();
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'close' }, ctx)).toBeNull();
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'delete' }, ctx)).toMatch(/not something/);
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'snooze', payload: { until: -1 } }, ctx)).toMatch(/time/);
    expect(checkCommand({ project: 'alpha', kind: 'new', payload: { title: ' ' } }, ctx)).toMatch(/words/);
  });
});
