// THE PHONE APP OPENED OFFLINE SHOWS THE INBOX IT LAST READ.
//
// QA on Android (M-41, 2 of 2): with 11 threads in progress, wifi and data
// off, the app force-stopped and opened again showed no tab counts, "Can't
// reach your inbox online." and "Nothing is running.": the app kept its rows
// only in memory. And once (M-39), after an over-install, a failed first read
// stayed on screen while the phone was online until a pull to refresh: the
// five-second read was gated on AppState.currentState, which Android can
// leave at 'background' after a launch.
//
// Measured here: what is kept, for whom, when it is written again, what is
// left after sign-out, and that the inbox screen reads it before its first
// read and does not gate its timer on AppState.currentState.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { inboxKeeper, readLastInbox, KEEP_AGAIN_MS, type InboxFile } from '../mobile/src/lib/last-inbox';
import { phoneStatusLine, phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.UTC(2026, 10, 13, 12);
const iso = (ms: number) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';

function rows(updated = NOW - 60_000) {
  const item = { id: 'w-1', title: 'Ship the phone app', status: 'claimed', kind: 'directive', labels: [], priority: 0, createdAt: NOW - 9e6, updatedAt: updated };
  return {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(updated), snapshot: { v: 3, item, history: [] } }],
    commands: [],
  } as never;
}

function memoryFile() {
  let text: string | null = null;
  let writes = 0;
  const file: InboxFile = { read: () => text, write: (t) => { writes += 1; text = t; } };
  return { file, writes: () => writes, text: () => text, set: (t: string | null) => { text = t; } };
}

describe('the inbox kept on the phone', () => {
  it('comes back for the same account after a restart, with when it was read (the reported case)', () => {
    const m = memoryFile();
    inboxKeeper(m.file).keep('user-1', rows(), NOW);
    const kept = readLastInbox(m.file, 'user-1');
    expect(kept?.fetchedAt).toBe(NOW);
    expect(kept?.rows.threads.map((t) => t.item)).toEqual(['w-1']);
    const tabs = phoneTabs(phoneView(kept!.rows, NOW + 3600_000), NOW + 3600_000);
    const shown = [...tabs.inbox, ...tabs.progress].map((r) => [r.id, r.product]);
    expect(shown).toEqual([['w-1', phoneSlug(DEV, 'alpha')]]);
    // The first read then fails: the line says how old what you see is.
    expect(phoneStatusLine({ error: 'Network request failed', fetchedAt: kept!.fetchedAt, macSeen: NOW }, NOW + 3600_000))
      .toBe('Can\'t reach your inbox online. This is how it was 1 hour ago.');
  });

  it('is never shown to another account, or with nobody signed in', () => {
    const m = memoryFile();
    inboxKeeper(m.file).keep('user-1', rows(), NOW);
    expect(readLastInbox(m.file, 'user-2')).toBe(null);
    expect(readLastInbox(m.file, null)).toBe(null);
  });

  it('a file that is missing, broken or the wrong shape gives nothing rather than an error', () => {
    const m = memoryFile();
    expect(readLastInbox(m.file, 'user-1')).toBe(null);
    m.set('{not json');
    expect(readLastInbox(m.file, 'user-1')).toBe(null);
    m.set(JSON.stringify({ owner: 'user-1', fetchedAt: NOW, rows: { projects: [], threads: 'x', commands: [] } }));
    expect(readLastInbox(m.file, 'user-1')).toBe(null);
    m.set(JSON.stringify({ owner: 'user-1', fetchedAt: 0, rows: { projects: [], threads: [], commands: [] } }));
    expect(readLastInbox(m.file, 'user-1')).toBe(null);
  });

  it('is not rewritten every five seconds when nothing changed, but is within a minute so its age stays true', () => {
    const m = memoryFile();
    const keeper = inboxKeeper(m.file);
    keeper.keep('user-1', rows(), NOW);
    keeper.keep('user-1', rows(), NOW + 5000);
    expect(m.writes()).toBe(1);
    keeper.keep('user-1', rows(), NOW + KEEP_AGAIN_MS - 1);
    expect(m.writes()).toBe(1);
    keeper.keep('user-1', rows(), NOW + KEEP_AGAIN_MS);
    expect(m.writes()).toBe(2);
    expect(readLastInbox(m.file, 'user-1')?.fetchedAt).toBe(NOW + KEEP_AGAIN_MS);
  });

  it('is rewritten at once when a thread changed', () => {
    const m = memoryFile();
    const keeper = inboxKeeper(m.file);
    keeper.keep('user-1', rows(), NOW);
    keeper.keep('user-1', rows(NOW), NOW + 5000);
    expect(m.writes()).toBe(2);
  });

  it('is gone after sign-out', () => {
    const m = memoryFile();
    const keeper = inboxKeeper(m.file);
    keeper.keep('user-1', rows(), NOW);
    keeper.forget();
    expect(m.text()).toBe(null);
    expect(readLastInbox(m.file, 'user-1')).toBe(null);
  });

  it('a store that will not take it leaves the live inbox reading', () => {
    const keeper = inboxKeeper({ read: () => null, write: () => { throw new Error('QuotaExceededError'); } });
    expect(() => keeper.keep('user-1', rows(), NOW)).not.toThrow();
    expect(() => keeper.forget()).not.toThrow();
  });
});

describe('the inbox screen', () => {
  const src = fs.readFileSync(new URL('../mobile/src/state/cloud.tsx', import.meta.url), 'utf8');

  it('draws the kept inbox before its first read, and keeps each good read', () => {
    const effect = src.slice(src.indexOf('const kept = '), src.indexOf('const timer = setInterval'));
    expect(effect).toMatch(/readLastInbox\(inboxFile/);
    expect(effect.indexOf('setRows(kept.rows)')).toBeLessThan(effect.indexOf('void refresh()'));
    expect(src).toMatch(/lastInbox\.keep\(/);
    const signOut = src.slice(src.indexOf('const signOut = useCallback'));
    expect(signOut.slice(0, signOut.indexOf('}, ['))).toMatch(/lastInbox\.forget\(\)/);
  });

  it('reads every five seconds without asking AppState.currentState', () => {
    const timer = src.slice(src.indexOf('const timer = setInterval'), src.indexOf('}, EVERY_MS);'));
    expect(timer).not.toMatch(/AppState\.currentState/);
  });
});
