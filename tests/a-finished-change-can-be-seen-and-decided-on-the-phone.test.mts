// A FINISHED CHANGE CAN BE SEEN AND DECIDED ON THE PHONE.
//
// QA session m19 (2026-11-15, native Android paired with a desktop): six of
// six finished Codex threads showed on the phone as their summary, the
// request and "Committed as 9dfb76a; the working tree is clean", with no file
// list, no +/- figures and no Ship it / Discard. The desktop showed "+13 −1"
// and "1 Ship it (recommended) / 2 Discard the change" on the same threads.
// The desktop builds both from the run's saved change, which the computer
// never put in the thread's copy for the phone. Measured by syncing a thread
// with a saved change through the phone inbox and reading the copy back, then
// opening it with the phone app's own threadOf.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createPhoneInbox } from '../main/phone-inbox.mts';
import { phoneChangeOf, PHONE_CHANGE_FILES } from '../shared/phone-snapshot.mts';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { threadOf } from '../mobile/src/lib/thread';

const NOW = Date.parse('2026-11-15T18:30:00Z');
const DEV = '0a1b2c3d4e5f';
const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

const SAVED = {
  item: 'w-1',
  plus: 13, minus: 1, editCount: 2, withProse: 0, roots: ['/Users/x/repo'], fromDisk: 0,
  committed: true, uncommitted: false, knowsYou: true,
  files: [
    { path: 'src/fizz.js', abs: '/Users/x/repo/src/fizz.js', plus: 2, minus: 1 },
    { path: 'test/fizz.test.js', abs: '/Users/x/repo/test/fizz.test.js', plus: 11, minus: 0 },
  ],
};

describe('the change a thread copy carries', () => {
  it('has the figures, each file and where the folder stands, and no absolute paths', () => {
    const c = phoneChangeOf(SAVED);
    expect(c).toEqual({
      plus: 13, minus: 1,
      files: [{ path: 'src/fizz.js', plus: 2, minus: 1 }, { path: 'test/fizz.test.js', plus: 11, minus: 0 }],
      committed: true, uncommitted: false, knowsYou: true,
    });
    expect(JSON.stringify(c)).not.toContain('/Users/x');
  });

  it('is nothing for a run that touched no files, or no change at all', () => {
    expect(phoneChangeOf({ ...SAVED, files: [] })).toBeNull();
    expect(phoneChangeOf(null)).toBeNull();
    expect(phoneChangeOf({ plus: 3 })).toBeNull();
  });

  it('lists the first files of a big change and counts the rest', () => {
    const files = Array.from({ length: PHONE_CHANGE_FILES + 3 }, (_, i) => ({ path: `f${i}.js`, plus: 1, minus: 0 }));
    const c = phoneChangeOf({ ...SAVED, files })!;
    expect(c.files).toHaveLength(PHONE_CHANGE_FILES);
    expect(c.more).toBe(3);
  });
});

describe('a sync from the computer', () => {
  async function synced(changeOf: (dir: string, id: string) => unknown) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-change-'));
    dirs.push(root);
    const cloud = createMemoryCloud();
    cloud.now = () => NOW;
    const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
    const items = [{ id: 'w-1', title: 'Make fizz(15) say FizzBuzz', status: 'open', result: 'Committed as 9dfb76a.', updatedAt: NOW - 1000, createdAt: NOW - 5000 }];
    const box = createPhoneInbox({
      backend: memoryBackend(cloud, me),
      owner: me.id,
      projects: () => [{ slug: 'alpha', name: 'Alpha', dir: root }],
      listItems: () => items,
      historyOf: () => [],
      changeOf: changeOf as never,
      apply: async () => {},
      stateFile: path.join(root, 'phone-inbox.json'),
      now: () => NOW,
    });
    await box.syncOnce();
    return (await memoryBackend(cloud, me).phoneThreads())[0].snapshot as { change?: unknown };
  }

  it('puts the run\'s change in the thread\'s copy', async () => {
    const snap = await synced((_dir, id) => (id === 'w-1' ? SAVED : null));
    expect(snap.change).toEqual(phoneChangeOf(SAVED));
  });

  it('leaves it out when the run saved none', async () => {
    expect((await synced(() => null)).change).toBeUndefined();
  });
});

describe('a finished thread opened on the phone', () => {
  const at = (m: number) => NOW - m * 60_000;
  const open = ({ item = {}, change = phoneChangeOf(SAVED) }: { item?: Record<string, unknown>; change?: unknown } = {}) => {
    const row = {
      id: 'w-1', title: 'Make fizz(15) say FizzBuzz', status: 'open', kind: 'bug', labels: [], priority: 0,
      body: 'Make fizz(15) return FizzBuzz and add a test.', result: 'Committed as 9dfb76a; the working tree is clean.',
      createdAt: at(30), updatedAt: at(2), wrote: { body: { ts: at(30), source: 'founder' }, result: { ts: at(2), source: 'agent' } },
      ...item,
    };
    const rows = {
      projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: new Date(NOW).toISOString() }],
      threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: new Date(at(2)).toISOString(), snapshot: { v: 3, item: row, history: [], olderLines: 0, ...(change ? { change } : {}) } }],
      commands: [],
    };
    const view = phoneView(rows as never, NOW);
    return threadOf(rows as never, view, phoneSlug(DEV, 'alpha'), 'w-1')!;
  };

  it('shows what changed: +13 −1 in two files, file by file', () => {
    const t = open();
    expect(t.change).toMatchObject({ files: 2, plus: 13, minus: 1 });
    expect(t.change!.list.map((f) => f.path)).toEqual(['src/fizz.js', 'test/fizz.test.js']);
  });

  it('offers Ship it and Discard the change, as the desktop does', () => {
    expect(open().options.map((o) => o.text)).toEqual(['Ship it', 'Discard the change']);
  });

  it('offers to commit first over loose edits', () => {
    const t = open({ change: phoneChangeOf({ ...SAVED, committed: false, uncommitted: true }) });
    expect(t.options.map((o) => o.text)).toEqual(['Commit it and ship', 'Discard the change']);
    expect(t.ask).toBe('This change was never committed.');
  });

  it('keeps the agent\'s own options when it offered some', () => {
    const t = open({ item: { result: 'Done.\n\n## Options\n1. Ship it (recommended)\n2. Change the test first' } });
    expect(t.options.map((o) => o.text.replace(/\s*\(recommended\)$/, ''))).toEqual(['Ship it', 'Change the test first']);
  });

  it('offers nothing once it is on its way to ship, or with no change', () => {
    expect(open({ item: { labels: ['ship'] } }).options).toEqual([]);
    expect(open({ change: null }).options).toEqual([]);
    expect(open({ change: null }).change).toBeNull();
  });
});

// Asked on the screenshots: the bar was too crowded, so the count and Review
// come off it; the arrows stay, since a thread is judged by stepping through.
describe('the phone thread bar', () => {
  const page = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
  it('draws the change under the answer', () => {
    expect(page).toMatch(/thread\.change && <ChangeCard change=\{thread\.change\} \/>/);
  });
  it('keeps the up and down arrows but no count and no Review button', () => {
    expect(page).toMatch(/label="Previous thread"/);
    expect(page).toMatch(/label="Next thread"/);
    expect(page).not.toMatch(/spot\.total|spot\.pos/);
    expect(page).toMatch(/<TopBar noReview\b/);
  });
  it('still brings a put-aside permission back from every other bar', () => {
    const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
    expect(parts).toMatch(/const aside = !noReview && /);
    expect(parts).toContain('Review permission');
  });
});
