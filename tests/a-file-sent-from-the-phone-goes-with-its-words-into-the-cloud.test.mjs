// A FILE SENT FROM THE PHONE GOES WITH ITS WORDS INTO THE CLOUD.
//
// With the computer shut, the cloud server left every reply or new thread
// that carried a file from the phone to the computer: only the computer took
// files down (main/phone-inbox.mjs withPhoneFiles). A screenshot of a bug is
// how a lot of threads start on a phone. The founder, 2026-10-24: "these are
// all very important to be viable on mobile".
//
// Now the server checks each file is what its name says, has the sandbox
// fetch it into the project's documents folder, and links her words to it
// there before they reach the agent. The computer saves the same file under
// the same name (shared/phone-files.mjs), so the turn the cloud ran and the
// row the computer keeps link one file, and her own copy on the phone keeps
// the phone's link.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { KIT_VERSION, NEW_THREAD, NEW_ITEM_MARK, NEW_TITLE_MARK, NEW_BODY_MARK, kitKey, newThreadKitKey, runOfClaim } from '../shared/cloud-kit.mjs';
import { phoneFilesIn, phoneAttachmentRel, linkPhoneFiles, PHONE_FILES_MAX } from '../shared/phone-files.mjs';
import { threadSnapshot, madeHere } from '../shared/phone-snapshot.mjs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const SHA = 'c'.repeat(40);
const DOCS = '/Users/me/agentbox/alpha';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fileOf = (bytes, ext = 'jpg') => ({ bytes: Buffer.from(bytes), name: `${sha(bytes)}.${ext}` });

describe('where a file from the phone goes', () => {
  const f = fileOf('a photo');

  it('the same file goes to the same place, named from what is in it and her label', () => {
    const [found] = phoneFilesIn(`look ![IMG 0042.jpg](phone-files/${f.name})`);
    expect(phoneAttachmentRel(found)).toBe(`attachments/${f.name.slice(0, 16)}-IMG-0042.jpg`);
    expect(phoneAttachmentRel({ ...found, label: '' })).toBe(`attachments/${f.name.slice(0, 16)}-${f.name}`);
  });

  it('her words link it there, a picture as a picture and a file as a link', () => {
    const c = fileOf('notes', 'txt');
    expect(linkPhoneFiles(`see ![IMG 1.jpg](phone-files/${f.name}) and [n.txt](phone-files/${c.name})`))
      .toBe(`see ![IMG-1.jpg](attachments/${f.name.slice(0, 16)}-IMG-1.jpg) and [n.txt](attachments/${c.name.slice(0, 16)}-n.txt)`);
  });

  it('the computer saves it under that same name', () => {
    const inbox = fs.readFileSync(new URL('../main/phone-inbox.mjs', import.meta.url), 'utf8');
    expect(inbox).toMatch(/phoneAttachmentRel\(f\)/);
  });
});

/* ------------------------------ the server ------------------------------ */

const SET = { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } };

const replyKit = (t, over = {}) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: SHA,
  argv: ['claude', '--resume', 's-1'], env: {}, docs: DOCS,
  bundleKey: `runs/kits/${DEVICE}/alpha/w-1/in.bundle`,
  files: [{ path: '/tmp/settings.json', key: `runs/kits/${DEVICE}/alpha/w-1/files/1` }],
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: '/Users/me/.claude/projects/x' }],
  frame: { before: 'They said: ', after: ' [end]' },
  ...over,
});

const newKit = (t) => ({
  ...replyKit(t, { item: NEW_THREAD, cwd: `/Users/me/dev/alpha/.claude/worktrees/${NEW_ITEM_MARK}`, branch: `agentbox/${NEW_ITEM_MARK}`, argv: ['claude', '-p'] }),
  newThread: { mainSha: SHA, brief: `Title: ${NEW_TITLE_MARK}\n\n${NEW_BODY_MARK}`, model: null, effort: null, defaultEngine: 'claude' },
});

function fakeDb(stored) {
  const commands = [];
  const threads = new Map();
  const iso = (t) => new Date(t).toISOString();
  return {
    commands, threads, fetched: [],
    add(c) { commands.push({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null, kind: 'reply', owner: A, device: DEVICE, project: 'alpha', item: 'w-1', ...c, created_at: iso(c.created_at) }); },
    async waitingReplies({ after, before, limit }) {
      return commands.filter((c) => ['reply', 'new'].includes(c.kind) && !c.taken_at && !c.claimed_at && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async claim(id, by, at) { const c = commands.find((x) => x.id === id && !x.claimed_at && !x.taken_at); if (!c) return false; Object.assign(c, { claimed_at: at, claimed_by: by }); return true; },
    async giveBack(id, by) { const c = commands.find((x) => x.id === id && x.claimed_by === by && !x.taken_at); if (c) Object.assign(c, { claimed_at: null, claimed_by: null }); },
    async taken(id, outcome, at) { const c = commands.find((x) => x.id === id && !x.taken_at); if (c) Object.assign(c, { taken_at: at, outcome }); },
    async thread(o, d, p, i) { return threads.get(`${o}|${d}|${p}|${i}`) ?? null; },
    async writeThread(o, d, p, i, snapshot) { threads.set(`${o}|${d}|${p}|${i}`, { snapshot }); },
    async newThread(o, d, p, i, snapshot) { if (!threads.has(`${o}|${d}|${p}|${i}`)) threads.set(`${o}|${d}|${p}|${i}`, { snapshot }); },
    async pushDevices() { return []; },
    async dropPushDevice() {},
    // Her storage: a link the sandbox fetches with, and what is behind it.
    async signPhoneFile(owner, device, name) { return stored.has(`${owner}/${device}/${name}`) ? `https://storage/sign/${owner}/${device}/${name}?token=t` : null; },
    async phoneFileDigest(url) {
      this.fetched.push(url);
      const key = url.replace('https://storage/sign/', '').replace(/\?.*$/, '');
      const b = stored.get(key);
      return b ? { sha256: sha(b), bytes: b.length } : null;
    },
  };
}

async function server({ stored = new Map(), kit = replyKit, project = newKit } = {}) {
  let clock = Date.UTC(2026, 9, 24, 12, 0, 0);
  const sent = []; const logs = [];
  const out = new Map();
  const objects = memoryObjects();
  const db = fakeDb(stored);
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) {
        sent.push({ sessionId, payload });
        if (payload.action === 'events') return { ok: true, state: 'running', events: (out.get(payload.runId) ?? []).slice(payload.since), more: false };
        return { ok: true };
      },
      async stop() {},
    },
    links: { get: async (k) => `https://b/get/${k}`, put: async (k) => `https://b/put/${k}`, head: async (k) => `https://b/head/${k}` },
    removeObject: async () => {}, objects,
    whoIs: async (tok) => (tok === 'session-of-a' ? { id: A } : null),
    now: () => clock, plans: SET, log: (m) => logs.push(m),
    phone: {
      db,
      runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
      sendPush: async (messages) => messages.map(() => ({ status: 'ok' })),
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: A, plan: 'test' });
  if (kit) await objects.put(`runs/u-${A}/${kitKey(DEVICE, 'alpha', 'w-1').slice('runs/'.length)}`, JSON.stringify(kit(clock)));
  if (project) await objects.put(`runs/u-${A}/${newThreadKitKey(DEVICE, 'alpha').slice('runs/'.length)}`, JSON.stringify(project(clock)));
  db.threads.set(`${A}|${DEVICE}|alpha|w-1`, { snapshot: threadSnapshot({ id: 'w-1', title: 'Ship it', status: 'blocked' }, []) });
  return {
    gw, db, sent, logs,
    now: () => clock, tick: (ms) => { clock += ms; },
    starts: () => sent.filter((s) => s.payload?.action === 'start'),
    inputs: () => sent.filter((s) => s.payload?.action === 'stdin' || s.payload?.action === 'files'),
    said: (s) => JSON.parse(Buffer.from(s.payload.data, 'base64').toString('utf8')).message.content,
    answer(runId, text) {
      const line = `${JSON.stringify({ type: 'result', result: text, is_error: false })}\n`;
      out.set(runId, [...(out.get(runId) ?? []), { kind: 'stdout', data: Buffer.from(line).toString('base64') }]);
    },
  };
}

const stash = (...files) => new Map(files.map((f) => [`${A}/${DEVICE}/${f.name}`, f.bytes]));

describe('the cloud server and a reply with a file', () => {
  it('has the sandbox fetch it into the documents folder and links her words to it there', async () => {
    const f = fileOf('the bug, in pixels');
    const t = await server({ stored: stash(f) });
    t.db.add({ id: 'r1', payload: { text: `This is broken\n\n![IMG 7.jpg](phone-files/${f.name})` }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    const rel = `attachments/${f.name.slice(0, 16)}-IMG-7.jpg`;
    expect(t.starts()[0].payload.files).toContainEqual({ path: `${DOCS}/${rel}`, url: `https://storage/sign/${A}/${DEVICE}/${f.name}?token=t` });
    expect(t.said(t.inputs()[0])).toBe(`They said: This is broken\n\n![IMG-7.jpg](${rel}) [end]`);
  });

  it('a file that is not what its name says, or is not there, leaves the reply to the computer', async () => {
    const f = fileOf('what the phone meant');
    const t = await server({ stored: new Map([[`${A}/${DEVICE}/${f.name}`, Buffer.from('something else')]]) });
    t.db.add({ id: 'r1', payload: { text: `![x.jpg](phone-files/${f.name})` }, created_at: t.now() - 2 * MIN });
    const g = fileOf('never sent');
    t.db.add({ id: 'r2', item: 'w-1', payload: { text: `![y.jpg](phone-files/${g.name})` }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(0);
    expect(t.db.commands.every((c) => !c.claimed_at)).toBe(true);
  });

  it('more files than the computer takes at once, or a kit with no documents folder, leaves it to the computer', async () => {
    const many = Array.from({ length: PHONE_FILES_MAX + 1 }, (_, i) => fileOf(`f${i}`));
    const t = await server({ stored: stash(...many) });
    t.db.add({ id: 'r1', payload: { text: many.map((f) => `![a](phone-files/${f.name})`).join(' ') }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(0);
    const f = fileOf('one');
    const u = await server({ stored: stash(f), kit: (c) => replyKit(c, { docs: undefined }) });
    u.db.add({ id: 'r1', payload: { text: `![a](phone-files/${f.name})` }, created_at: u.now() - 2 * MIN });
    await u.gw.phoneSweep();
    expect(u.starts()).toHaveLength(0);
  });

  it('a follow-up with a file sends the file into the open run, then her words', async () => {
    const f = fileOf('second shot');
    const t = await server({ stored: stash(f) });
    t.db.add({ id: 'r1', payload: { text: 'first' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const runId = runOfClaim(t.db.commands[0].claimed_by);
    t.answer(runId, 'ok');
    t.tick(MIN);
    await t.gw.phoneSweep();
    t.db.add({ id: 'r2', payload: { text: `and ![s.png](phone-files/${f.name})` }, created_at: t.now() - 5_000 });
    await t.gw.phoneSweep();
    const after = t.inputs().slice(1);
    expect(after[0].payload).toMatchObject({ action: 'files', n: 2, files: [{ path: `${DOCS}/attachments/${f.name.slice(0, 16)}-s.png`, url: expect.stringContaining(f.name) }] });
    expect(after[1].payload).toMatchObject({ action: 'stdin', n: 3 });
    expect(t.said(after[1])).toBe(`They said: and ![s.png](attachments/${f.name.slice(0, 16)}-s.png) [end]`);
    // The run's next input is numbered after both.
    t.answer(runId, 'seen');
    t.tick(MIN);
    await t.gw.phoneSweep();
    t.db.add({ id: 'r3', payload: { text: 'thanks' }, created_at: t.now() - 5_000 });
    await t.gw.phoneSweep();
    expect(t.inputs().at(-1).payload).toMatchObject({ action: 'stdin', n: 4 });
  });

  it('her own copy on the phone keeps the phone\'s link', async () => {
    const f = fileOf('pixels');
    const t = await server({ stored: stash(f) });
    t.db.add({ id: 'r1', payload: { text: `see ![a.jpg](phone-files/${f.name})` }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    t.answer(runOfClaim(t.db.commands[0].claimed_by), 'Got it.');
    t.tick(MIN);
    await t.gw.phoneSweep();
    const copy = t.db.threads.get(`${A}|${DEVICE}|alpha|w-1`).snapshot;
    expect(copy.item.answer).toBe(`see ![a.jpg](phone-files/${f.name})`);
    expect(copy.item.result).toBe('Got it.');
  });
});

describe('the cloud server and a new thread with a file', () => {
  it('fetches it for the thread and links the brief to it', async () => {
    const f = fileOf('a crash');
    const t = await server({ stored: stash(f), kit: null });
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000001', kind: 'new', item: null, payload: { title: 'Fix it', body: `Look\n\n![s.png](phone-files/${f.name})` }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    const rel = `attachments/${f.name.slice(0, 16)}-s.png`;
    expect(t.starts()[0].payload.files).toContainEqual({ path: `${DOCS}/${rel}`, url: expect.stringContaining(f.name) });
    expect(t.said(t.inputs()[0])).toBe(`Title: Fix it\n\nLook\n\n![s.png](${rel})`);
    const itemId = madeHere('c0ffee00-0000-4000-8000-000000000001');
    expect(t.db.threads.get(`${A}|${DEVICE}|alpha|${itemId}`).snapshot.item.body).toContain(`phone-files/${f.name}`);
  });
});

/* ------------------------------ the computer ----------------------------- */

describe('the computer, waking to a cloud run that took a file', () => {
  async function inboxWorld() {
    const { createMemoryCloud, signUpMemory, memoryBackend, claimForTheCloud } = await import('../main/team/memory-cloud.mjs');
    const { createPhoneInbox } = await import('../main/phone-inbox.mjs');
    const cloud = createMemoryCloud();
    let clock = Date.parse('2026-10-24T12:00:00Z');
    cloud.now = () => clock;
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const mac = memoryBackend(cloud, me);
    const phone = memoryBackend(cloud, me);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-file-'));
    const adopted = []; const adoptedNew = [];
    const inbox = createPhoneInbox({
      backend: mac, owner: me, device: DEVICE, projects: () => [{ slug: 'alpha', name: 'Alpha', dir }],
      listItems: () => [], historyOf: () => [],
      apply: async () => ({ ok: true, id: 'w-local' }),
      stateFile: path.join(dir, 's.json'), now: () => clock,
      carrying: () => {}, kitsFor: () => true,
      adopt: async (a) => { adopted.push(a); return 'adopted'; }, cloudReplies: async () => {}, runHome: () => true,
      newThreadKits: () => {},
      adoptNew: async (a) => { adoptedNew.push(a); return 'adopted'; },
    });
    return { cloud, mac, phone, inbox, dir, adopted, adoptedNew, claimForTheCloud };
  }

  it('saves a new thread\'s file where the cloud put it, and the row links it there', async () => {
    const w = await inboxWorld();
    const f = fileOf('a crash', 'png');
    await w.phone.putPhoneFile({ device: DEVICE, name: f.name, data: f.bytes });
    const cmd = await w.phone.addPhoneCommand({ device: DEVICE, project: 'alpha', kind: 'new', payload: { title: 'Fix it', body: `Look ![s.png](phone-files/${f.name})` } });
    w.claimForTheCloud(w.cloud, cmd.id, 'run-f');
    await w.inbox.syncOnce();
    const rel = `attachments/${f.name.slice(0, 16)}-s.png`;
    expect(w.adoptedNew[0].body).toBe(`Look ![s.png](${rel})`);
    expect(fs.readFileSync(path.join(w.dir, rel), 'utf8')).toBe('a crash');
  });

  it('saves a reply\'s file under the same name, once however often it comes', async () => {
    const w = await inboxWorld();
    const f = fileOf('a photo');
    await w.phone.putPhoneFile({ device: DEVICE, name: f.name, data: f.bytes });
    const a = await w.phone.addPhoneCommand({ device: DEVICE, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: `![a.jpg](phone-files/${f.name})` } });
    const b = await w.phone.addPhoneCommand({ device: DEVICE, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: `again ![a.jpg](phone-files/${f.name})` } });
    w.claimForTheCloud(w.cloud, a.id, 'run-r');
    w.claimForTheCloud(w.cloud, b.id, 'run-r');
    await w.inbox.syncOnce();
    const rel = `attachments/${f.name.slice(0, 16)}-a.jpg`;
    expect(w.adopted[0].replies).toEqual([`![a.jpg](${rel})`, `again ![a.jpg](${rel})`]);
    expect(fs.readdirSync(path.join(w.dir, 'attachments'))).toEqual([path.basename(rel)]);
  });
});
