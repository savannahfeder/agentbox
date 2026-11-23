// THE TEAM AND THE MODES ARE READ ONCE, NOT ONCE PER FILE (2026-11-22).
//
// In the 75 minutes after the 12:14 restart the Mac's main process used about 85% of a
// core and the freeze log counted 871 s. 72 s of it was inside team.state(),
// which re-read every teammate's shared thread from disk twice, for two lists
// most callers never look at; 48 s of that came from bringBackFor, which asked
// whether the project is shared once per file a starting thread names. Another
// 23 s parsed the same 49 KB answer-modes.json for each thread read, and 10 s
// added up every uploaded file once per file a thread lists. The open thread asks
// for its remote-control status every second, and each ask read the row: 38 s.
import { it, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { answerMode, answerModes, setAnswerMode } from '../main/answer-modes.mts';
import { createPhoneUploads } from '../main/phone-uploads.mts';
import { taskRemoteControl } from '../main/task-remote-control.mts';

afterEach(() => vi.restoreAllMocks());

const tmp = (name: string) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`)));

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = tmp('read-once');
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website', 'designs'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service, accountRoot, storeRoot };
}

describe('the team', () => {
  let ana: Awaited<ReturnType<typeof aMac>>;
  let jordan: Awaited<ReturnType<typeof aMac>>;
  let thread: { id: string };

  beforeEach(async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    ana = await aMac(cloud, signUpMemory(cloud, { email: 'ana@nw.test', name: 'Ana Ruiz' }));
    jordan = await aMac(cloud, signUpMemory(cloud, { email: 'jordan@nw.test', name: 'Jordan Ellis' }));
    await ana.service.signIn();
    await ana.service.createTeam('Northwind');
    await ana.service.invite('jordan@nw.test');
    await jordan.service.signIn();
    await jordan.service.acceptInvite(ana.service.state().team.id);
    disk.setLineAuthor(ana.personId);
    thread = ana.store.composeItem('website', { title: 'Call tasks', body: 'Write call-tasks.md', visibility: 'team' });
    for (const m of [ana, jordan, ana, jordan]) await m.service.syncNow();
    await jordan.service.markSharedFile(ana.personId, thread.id, { do: 'note', id: 'n1', file: 'call-tasks.md', place: { kind: 'whole' }, text: 'Too long' });
    for (const m of [jordan, ana, jordan]) await m.service.syncNow();
  });
  afterEach(async () => {
    disk.setLineAuthor(null);
    for (const m of [ana, jordan]) await m.service.signOut?.();
  });

  const threadReads = (reads: ReturnType<typeof vi.spyOn>) => reads.mock.calls.filter(([f]: unknown[]) => path.basename(String(f)) === 'thread.json').length;

  it('who you are and who is on the team read no shared thread', () => {
    const reads = vi.spyOn(fs, 'readFileSync');
    const state = jordan.service.state();
    expect(state.me?.id).toBe(jordan.personId);
    expect(state.people?.length).toBe(2);
    expect(threadReads(reads)).toBe(0);
  });

  it('the notes are still there for whoever looks, and for the window, which takes a copy', () => {
    const state = jordan.service.state() as { threadTalk: { text: string }[]; sharedFileNews: unknown[] };
    expect(state.threadTalk.map((t) => t.text)).toContain('Too long');
    expect(Array.isArray(state.sharedFileNews)).toBe(true);
    const sent = structuredClone(state);
    expect(sent.threadTalk.map((t) => t.text)).toContain('Too long');
    expect(Object.keys({ ...state })).toEqual(expect.arrayContaining(['threadTalk', 'sharedFileNews']));
  });

  it('one answer reads the shared threads once however often it is looked at', () => {
    const state = jordan.service.state() as { threadTalk: unknown };
    const first = state.threadTalk;
    const reads = vi.spyOn(fs, 'readFileSync');
    expect(state.threadTalk).toBe(first);
    expect(threadReads(reads)).toBe(0);
  });

  it('a later answer sees what came since', async () => {
    const before = jordan.service.state() as { threadTalk: { text: string }[] };
    expect(before.threadTalk.length).toBeGreaterThan(0);
    await jordan.service.markSharedFile(ana.personId, thread.id, { do: 'note', id: 'n2', file: 'call-tasks.md', place: { kind: 'whole' }, text: 'Better now' });
    await jordan.service.syncNow();
    expect((jordan.service.state() as { threadTalk: { text: string }[] }).threadTalk.map((t) => t.text)).toContain('Better now');
  });
});

describe('a starting thread bringing its files back', () => {
  const filesNamed = async (count: number) => {
    const m = await aMac(createMemoryCloud(), 'p-solo');
    disk.setLineAuthor('p-solo');
    const thread = m.store.composeItem('website', { title: 'Pictures', body: 'Make the pictures.', visibility: 'team' });
    const names = Array.from({ length: count }, (_, i) => `shot-of-page${String.fromCharCode(97 + i)}.png`);
    for (const [i, n] of names.entries()) fs.writeFileSync(path.join(m.accountRoot, 'website', 'designs', n), `picture ${i}`);
    disk.updateWorkItem(path.join(m.accountRoot, 'website'), thread.id, { note: names.map((n) => `[${n}](designs/${n})`).join('\n') }, { source: 'agent' });
    let asked = 0;
    const back: string[] = [];
    const team = { state: () => { asked += 1; return { me: { id: 'p-solo' }, people: [], cards: [] }; } };
    const keeper = {
      status: () => ({ offBytes: 10 }), off: () => false, offUnder: () => [], opened() {}, bringBack: async (h: string) => { back.push(h); return true; },
      wantsVersions: async () => false, pass: async () => {},
    };
    const place = appFilesPlace({ store: m.store, team, accountRoot: m.accountRoot, storeRoot: m.storeRoot, keeper } as unknown as Parameters<typeof appFilesPlace>[0]);
    expect(await place.bringBackFor({ product: 'website', id: thread.id })).toBe(true);
    disk.setLineAuthor(null);
    return asked;
  };

  it('asks about the team no more for ten files than for one', async () => {
    expect(await filesNamed(10)).toBe(await filesNamed(1));
  });
});

describe('what a reply may do', () => {
  let home: string;
  let file: string;
  beforeEach(() => {
    home = tmp('modes');
    file = path.join(home, 'answer-modes.json');
    setAnswerMode('website', 'w-aaaaaaaaaa', 'plan', { home });
  });

  it('is parsed once for a hundred threads read', () => {
    answerMode('website', 'w-aaaaaaaaaa', { home });
    const parse = vi.spyOn(JSON, 'parse');
    for (let i = 0; i < 100; i += 1) expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBe('plan');
    expect(answerModes({ home })).toEqual({ 'website/w-aaaaaaaaaa': 'plan' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('is read again the moment it is picked again, or the file is written by anyone', () => {
    expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBe('plan');
    setAnswerMode('website', 'w-aaaaaaaaaa', 'acceptEdits', { home });
    expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBe('acceptEdits');
    fs.writeFileSync(file, JSON.stringify({ 'website/w-aaaaaaaaaa': { mode: 'default', at: Date.now() } }));
    expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBe('default');
  });

  it('a write of the same length in the same moment is still seen', () => {
    const at = Date.now();
    fs.writeFileSync(file, JSON.stringify({ 'website/w-aaaaaaaaaa': { mode: 'plan', at } }));
    const then = fs.statSync(file);
    expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBe('plan');
    fs.rmSync(file);
    fs.writeFileSync(file, JSON.stringify({ 'website/w-aaaaaaaaaa': { mode: 'auto', at } }));
    fs.utimesSync(file, then.atime, then.mtime);
    expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBe('auto');
  });

  it('a file gone, broken, or swapped for a link grants nothing it granted before', () => {
    expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBe('plan');
    fs.writeFileSync(file, '{ not json');
    expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBeUndefined();
    const elsewhere = path.join(home, 'elsewhere.json');
    fs.writeFileSync(elsewhere, JSON.stringify({ 'website/w-aaaaaaaaaa': { mode: 'plan', at: Date.now() } }));
    fs.rmSync(file);
    expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBeUndefined();
    fs.symlinkSync(elsewhere, file);
    expect(answerMode('website', 'w-aaaaaaaaaa', { home })).toBeUndefined();
  });
});

describe('the room on the phone', () => {
  const NOW = Date.UTC(2026, 10, 22);
  function uploader(uploaded: Record<string, { bytes: number; named: number; rank: number }>, totalBytes: number) {
    const home = tmp('room');
    const docs = path.join(home, 'Zero', 'accounts', 'a', 'proj');
    fs.mkdirSync(docs, { recursive: true });
    let reads = 0;
    const counted = Object.fromEntries(Object.entries(uploaded).map(([name, u]) => [name, Object.defineProperty({ ...u }, 'bytes', { enumerable: true, get() { reads += 1; return u.bytes; } })]));
    const stored = new Map<string, number>();
    const up = createPhoneUploads({
      backend: { async putPhoneFile({ name, data }: { name: string; data: Buffer }) { stored.set(name, data.length); }, async dropPhoneFiles() {} },
      owner: 'o', device: 'a1b2c3d4e5f6', state: { uploaded: counted }, save() {}, home, now: () => NOW,
      limits: { fileBytes: 1024, filmBytes: 4096, threadBytes: 1e6, totalBytes, files: 60, days: 7 }, log() {},
    } as unknown as Parameters<typeof createPhoneUploads>[0]);
    const list = (names: string[]) => {
      for (const n of names) fs.writeFileSync(path.join(docs, n), Buffer.alloc(100, n));
      const snap = { v: 3, item: { id: 'w-aaaaaaaaaa', result: names.join(' '), updatedAt: NOW }, history: [] };
      return up.manifest('t', snap as never, { dir: docs, updatedAt: NOW, base: names.join() })?.files ?? {};
    };
    return { up, list, stored, reads: () => reads };
  }
  const had = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${i}.png`, { bytes: 10, named: NOW, rank: 1 }]));

  it('adds the uploaded files up once, however many files a thread lists', () => {
    const one = uploader(had(500), 1e9);
    one.list(['a.png']);
    const many = uploader(had(500), 1e9);
    many.list(Array.from({ length: 20 }, (_, i) => `p${i}.png`));
    expect(many.reads()).toBe(one.reads());
  });

  it('counts what went up since, so a full space is still full', async () => {
    const u = uploader(had(1), 10 + 250);
    expect(Object.keys(u.list(['a.png', 'b.png']))).toHaveLength(2);
    await u.up.kick();
    expect(u.stored.size).toBe(2);
    // 210 of 260 bytes used: a third 100-byte file has no room.
    expect(u.list(['c.png'])['c.png']).toBeUndefined();
    await u.up.kick();
    expect(u.stored.size).toBe(2);
  });
});

describe('the remote-control status an open thread asks for every second', () => {
  const sup = (controls: [string, { state: string; at: number }][] = []) => {
    let reads = 0;
    const it = { store: { readItem: (product: string, id: string) => { reads += 1; return { id, product }; }, listProducts: () => [] }, _remoteControls: new Map(controls), sessions: new Map(), _engineFor: () => 'codex', rowSessionFor: () => null, spawnWorker() {} };
    return { it: it as unknown as Parameters<typeof taskRemoteControl>[0], reads: () => reads };
  };

  it('reads no row for a thread never put under remote control', async () => {
    const s = sup();
    for (let i = 0; i < 60; i += 1) expect(await taskRemoteControl(s.it, 'p', 'x')).toBeNull();
    expect(s.reads()).toBe(0);
  });

  it('still says the state of one that was', async () => {
    const s = sup([[JSON.stringify(['p', 'x']), { state: 'connected', at: 1 }]]);
    expect((await taskRemoteControl(s.it, 'p', 'x'))?.state).toBe('connected');
    expect(await taskRemoteControl(s.it, 'p', 'other')).toBeNull();
  });

  it('turning it on still reads the row first', async () => {
    const s = sup();
    await expect(taskRemoteControl(s.it, 'p', 'x', 'enable')).rejects.toThrow('Claude Code');
    expect(s.reads()).toBe(1);
  });
});
