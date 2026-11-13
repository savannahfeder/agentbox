// A COMMENT ON A SHARED LINK LANDS ON THE THREAD THE FILE CAME FROM.
//
// Two sharers in the power test (2026-11-04, round 3) missed comments on their
// links: the only sign was a dot on the file's Share mark, and nothing reached
// the inbox. Measured on main/team/link-comments.mts with the memory cloud and
// a stand-in thread store: which comments become a note, on which thread, in
// what words, and that none is said twice.
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { noticeLinkComments, threadOfSource, noteFor } from '../main/team/link-comments.mts';

let cloud, maya, chris, lena, clock, cursor, notes, items;
const run = () => noticeLinkComments({
  backend: maya, now: () => clock,
  cursor: () => cursor, setCursor: (at) => { cursor = at; },
  readItem: ({ product, thread }) => items[`${product}/${thread}`] ?? null,
  write: (place, note) => { notes.push([`${place.product}/${place.thread}`, note]); },
  log: () => {},
});
const share = (source, name) => maya.shareFile({ source, name, kind: 'markdown', type: 'text/markdown', body: '# x', version: 1, hash: 'h' });

beforeEach(() => {
  cloud = createMemoryCloud();
  clock = Date.parse('2026-11-04T09:00:00Z');
  cloud.now = () => clock;
  maya = memoryBackend(cloud, signUpMemory(cloud, { email: 'maya@acme.test', name: 'Maya Chen' }));
  chris = memoryBackend(cloud, signUpMemory(cloud, { email: 'chris@novak.test', name: 'Chris Novak' }));
  lena = memoryBackend(cloud, signUpMemory(cloud, { email: 'lena@lab.test', name: 'Lena Fischer' }));
  cursor = null;
  notes = [];
  items = { 'payments/w-1a2b': { id: 'w-1a2b', status: 'done' } };
});

describe('the first look', () => {
  it('only starts counting, so comments from before this computer looked are not told again', async () => {
    const tok = await share('payments/w-1a2b/plans/q1-roadmap', 'q1-roadmap.md');
    await chris.commentOnFileLink(tok, 'Old news');
    clock += 1000;
    expect(await run()).toBe(0);
    expect(cursor).toBe(clock);
    expect(notes).toEqual([]);
  });
});

describe('after it', () => {
  beforeEach(async () => { await run(); clock += 1000; });

  it('puts someone\'s comment on the thread the file came from, by name and in their words', async () => {
    const tok = await share('payments/w-1a2b/plans/q1-roadmap', 'q1-roadmap.md');
    await chris.commentOnFileLink(tok, 'Is the flag still on for new accounts only?');
    clock += 1000;
    expect(await run()).toBe(1);
    expect(notes).toEqual([['payments/w-1a2b', 'Chris Novak commented on q1-roadmap.md. "Is the flag still on for new accounts only?"']]);
  });

  // One note for several replaced the earlier comments on the row (2026-11-10):
  // each is a line of its own now, and the row counts them.
  it('writes each of several comments on one file, oldest first, and counts the file once', async () => {
    const tok = await share('payments/w-1a2b/plans/q1-roadmap', 'q1-roadmap.md');
    await chris.commentOnFileLink(tok, 'One');
    clock += 1000;
    await lena.commentOnFileLink(tok, 'Two');
    clock += 1000;
    expect(await run()).toBe(1);
    expect(notes).toEqual([
      ['payments/w-1a2b', 'Chris Novak commented on q1-roadmap.md. "One"'],
      ['payments/w-1a2b', 'Lena Fischer commented on q1-roadmap.md. "Two"'],
    ]);
  });

  it('carries the place a comment points at', async () => {
    const tok = await share('payments/w-1a2b/plans/cut.mp4', 'cut.mp4');
    await chris.commentOnFileLink(tok, 'Too fast here', { kind: 'time', s: 12.5 });
    clock += 1000;
    const written = [];
    await noticeLinkComments({ backend: maya, now: () => clock, cursor: () => cursor, setCursor: (at) => { cursor = at; }, readItem: () => ({}), write: (_p, _n, c) => { written.push(c); } });
    expect(written).toEqual([{ name: 'Chris Novak', file: 'cut.mp4', text: 'Too fast here', place: { kind: 'time', s: 12.5 } }]);
  });

  it('never says a comment twice, nor the owner\'s own answer', async () => {
    const tok = await share('payments/w-1a2b/plans/q1-roadmap', 'q1-roadmap.md');
    await chris.commentOnFileLink(tok, 'Hi');
    clock += 1000;
    await run();
    await maya.commentOnFileLink(tok, 'Hi back');
    clock += 1000;
    await run();
    expect(notes).toHaveLength(1);
  });

  it('says nothing for a file whose thread is gone or that came from no thread, and still moves past it', async () => {
    const gone = await share('payments/w-9999/a', 'a.md');
    const loose = await share('payments//b', 'b.md');
    await chris.commentOnFileLink(gone, 'Hello?');
    await chris.commentOnFileLink(loose, 'Anyone?');
    const said = clock;
    clock += 1000;
    await run();
    expect(notes).toEqual([]);
    expect(cursor).toBe(said);
  });

  it('cuts a long comment in the note', async () => {
    const tok = await share('payments/w-1a2b/plans/q1-roadmap', 'q1-roadmap.md');
    await chris.commentOnFileLink(tok, `${'word '.repeat(100)}end`);
    clock += 1000;
    await run();
    expect(notes[0][1].length).toBeLessThan(260);
    expect(notes[0][1].endsWith('…"')).toBe(true);
  });
});

describe('a link\'s source', () => {
  it('names its project and thread, and nothing for a file with no thread', () => {
    expect(threadOfSource('payments/w-1a2b/plans/q1-roadmap')).toEqual({ product: 'payments', thread: 'w-1a2b' });
    expect(threadOfSource('payments//plans/x')).toBeNull();
    expect(threadOfSource('')).toBeNull();
  });
  it('is said in plain words', () => {
    expect(noteFor([{ byName: 'Chris', name: 'a.md', text: 'ok' }])).toBe('Chris commented on a.md. "ok"');
  });
});

describe('in the app', () => {
  it('a comment on a closed thread\'s file brings the thread back to Needs you with the comment on it, once a minute at most', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const disk = await import('../main/store/work-items.mts');
    const { Store } = await import('../main/store.mts');
    const { createTeamService } = await import('../main/team/index.mts');
    const { memorySession } = await import('../main/team/session.mts');
    disk._internals.forgetFolds();
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'link-comments-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'payments'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'payments', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'payments', name: 'Payments' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const mayaId = [...cloud.people.values()].find((p) => p.email === 'maya@acme.test').id;
    let t = Date.parse('2026-11-04T09:00:00Z');
    const service = createTeamService({
      session: memorySession(() => memoryBackend(cloud, mayaId)),
      store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, now: () => t,
    });
    const item = store.composeItem('payments', { title: 'Draft the Q1 roadmap', body: 'Draft it' });
    disk.updateWorkItem(path.join(accountRoot, 'payments'), item.id, { status: 'done' }, { source: 'founder' });
    await service.signIn();
    await service.syncNow();
    const tok = await maya.shareFile({ source: `payments/${item.id}/plans/q1-roadmap`, name: 'q1-roadmap.md', kind: 'markdown', type: 'text/markdown', body: '# x', version: 1, hash: 'h' });
    clock = t + 1000;
    await chris.commentOnFileLink(tok, 'Looks right to me');
    t += 30_000;
    await service.syncNow();
    expect(store.readItem('payments', item.id).status).toBe('done');
    t += 60_000;
    await service.syncNow();
    const after = store.readItem('payments', item.id);
    expect(after.status).toBe('blocked');
    expect(JSON.stringify(store.readHistory('payments', item.id, { max: 50 }))).toContain('Chris Novak commented on q1-roadmap.md. \\"Looks right to me\\"');
    service.stop();
  });
});

// In the next round the comment read "Checkpoint · Opus 5.5", as if the agent
// had said it (power test, round 4, 2026-11-04).
describe('in the thread', () => {
  it('is a line naming who commented and on which file, with their words, and never the agent checking in', async () => {
    const { threadEvents } = await import('../renderer/src/thread-history.ts');
    const { pickFields } = await import('../shared/work-items.mts');
    const line = { id: 'w-1', ts: 1, source: 'system', patch: { note: 'Chris Novak commented on q1-roadmap.md. "Hi"', linkComment: { name: 'Chris Novak', file: 'q1-roadmap.md', text: 'Hi' } } };
    const events = threadEvents([{ id: 'w-1', ts: 0, source: 'founder', patch: { title: 'Plan', status: 'open' } }, line]);
    const said = events.find((e) => /commented/.test(e.said ?? ''));
    expect(said).toMatchObject({ who: 'agent', said: 'Chris Novak commented on q1-roadmap.md', words: 'Hi' });
    expect(said.says).toBeUndefined();
    expect(said.message).toBeUndefined();
    expect(events.some((e) => e.says === 'progress')).toBe(false);
    expect(pickFields({ linkComment: { name: 'Chris', file: 'a.md', text: 'x', extra: 1 } })).toEqual({ linkComment: { name: 'Chris', file: 'a.md', text: 'x' } });
    // A comment on a moment in a film says the moment (2026-11-11).
    const atMoment = threadEvents([{ id: 'w-1', ts: 0, source: 'founder', patch: { title: 'Cut', status: 'open' } }, { id: 'w-1', ts: 2, source: 'system', patch: { note: 'x', linkComment: { name: 'Jun', file: 'cut.mp4', text: 'Too fast', place: { kind: 'time', s: 84.6 } } } }]);
    expect(atMoment.find((e) => /commented/.test(e.said ?? ''))?.said).toBe('Jun commented on cut.mp4 at 1:24');
    expect(pickFields({ linkComment: { name: '', file: 'a.md', text: 'x' } })).toBeNull();
  });
  it('is written on the thread with the note, through the store', async () => {
    let written = null;
    const fake = { newLinkComments: async () => [{ token: 't', source: 'payments/w-1a2b/x', name: 'x.md', byName: 'Chris', text: 'Yo', at: 5 }] };
    await noticeLinkComments({ backend: fake, now: () => 10, cursor: () => 1, setCursor: () => {}, readItem: () => ({}), write: (place, note, comment) => { written = { note, comment }; } });
    expect(written).toEqual({ note: 'Chris commented on x.md. "Yo"', comment: { name: 'Chris', file: 'x.md', text: 'Yo' } });
  });
});

// A time read back as a Date lost its milliseconds through Date.parse, so the
// cursor sat on the whole second and the same comment came back every minute
// (screenshots, 2026-11-04).
describe('the cloud call', () => {
  it('keeps a comment\'s time to the millisecond, whether the database hands back text or a Date', async () => {
    const { supabaseBackend } = await import('../main/team/supabase-backend.mts');
    for (const created of ['2026-11-04T10:14:39.697Z', new Date('2026-11-04T10:14:39.697Z')]) {
      const client = {
        auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) },
        rpc: async () => ({ data: [{ token: 't', source: 'p/w-1/a', name: 'a.md', by_name: 'Chris', body: 'Hi', created_at: created }], error: null }),
        from: () => { throw new Error('not here'); },
      };
      const [c] = await supabaseBackend(client).newLinkComments(0);
      expect(c.at).toBe(Date.parse('2026-11-04T10:14:39.697Z'));
    }
  });
});
