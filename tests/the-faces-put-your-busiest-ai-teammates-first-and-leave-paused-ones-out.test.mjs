// THE FACES PUT YOUR BUSIEST AI TEAMMATES FIRST AND LEAVE PAUSED ONES OUT (2026-11-04).
//
// The owner: paused teammates still took a face at the end of the Needs you
// line, and the teammates ran in the order they were made, so the ones they
// use most sat far right. Paused ones now leave the row unless a run of theirs
// is still going, and your teammates run most recently used first. The order
// is settled once a day, so the faces do not swap places while you work.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildMembers } from '../renderer/src/team/everything/members.ts';
import { faceRow } from '../renderer/src/team/everything/place.ts';
import { lastUsedByMate, readMateOrder, settleMateOrder, writeMateOrder } from '../renderer/src/team/everything/mate-order.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const mate = (id, name, over = {}) => ({ id, name, letter: name[0], role: null, now: null, status: 'active', paused: false, running: null, ...over });
const ME = { id: 'p-me', name: 'Sam Lee', avatarUrl: null };
const PEOPLE = [ME, { id: 'p-dev', name: 'Dev Patel', avatarUrl: null }];
const keysOf = (row) => row.map((m) => m.key);

describe('a paused AI teammate', () => {
  it('has no face in the row', () => {
    const row = faceRow(buildMembers({ me: ME, people: PEOPLE, teammates: [mate('t-a', 'Analyst'), mate('t-b', 'Builder', { paused: true })] }));
    expect(keysOf(row)).toEqual(['me', 'person:p-dev', 'mate:t-a']);
  });

  it('keeps its face while a run of its is still going', () => {
    const row = faceRow(buildMembers({ me: ME, people: PEOPLE, teammates: [mate('t-b', 'Builder', { paused: true, running: { id: 'w-1' } })] }));
    expect(keysOf(row)).toContain('mate:t-b');
  });

  it('is still a member everywhere else, so its place and chat still open', () => {
    const all = buildMembers({ me: ME, people: PEOPLE, teammates: [mate('t-b', 'Builder', { paused: true })] });
    expect(all.find((m) => m.key === 'mate:t-b')).toMatchObject({ now: 'Paused', paused: true });
  });

  it('leaves no row at all when it was the only one beside you', () => {
    expect(faceRow(buildMembers({ me: ME, people: [ME], teammates: [mate('t-b', 'Builder', { paused: true })] }))).toEqual([]);
  });
});

describe('when you last used each AI teammate', () => {
  const mateOf = (i) => i.labels?.find((l) => l.startsWith('teammate:'))?.slice('teammate:'.length) ?? null;
  it('is the newest of its runs, and a thread of yours counts for none', () => {
    const used = lastUsedByMate([
      { labels: ['teammate:t-a'], updatedAt: 10 }, { labels: ['teammate:t-a'], updatedAt: 30 },
      { labels: ['teammate:t-b'], updatedAt: 20 }, { labels: [], updatedAt: 99 },
    ], mateOf);
    expect([...used]).toEqual([['t-a', 30], ['t-b', 20]]);
  });
});

describe('the order of your AI teammates', () => {
  const members = [{ key: 'me' }, { key: 'person:p-dev' }, { key: 'mate:t-old' }, { key: 'mate:t-mid' }, { key: 'mate:t-new' }, { key: 'theirmate:p-dev:t-x' }];
  const lastUsed = new Map([['t-old', 300], ['t-mid', 100], ['t-new', 200]]);

  it('runs most recently used first, leaving everyone else where they were', () => {
    const { members: out } = settleMateOrder(members, { lastUsed, saved: null, day: '2026-11-04' });
    expect(keysOf(out)).toEqual(['me', 'person:p-dev', 'mate:t-old', 'mate:t-new', 'mate:t-mid', 'theirmate:p-dev:t-x']);
  });

  it('puts a teammate never used after the ones that were', () => {
    const { members: out } = settleMateOrder([...members, { key: 'mate:t-never' }], { lastUsed, saved: null, day: '2026-11-04' });
    expect(keysOf(out).filter((k) => k.startsWith('mate:'))).toEqual(['mate:t-old', 'mate:t-new', 'mate:t-mid', 'mate:t-never']);
  });

  it('holds still for the rest of the day when one is used again', () => {
    const first = settleMateOrder(members, { lastUsed, saved: null, day: '2026-11-04' });
    const later = settleMateOrder(members, { lastUsed: new Map([...lastUsed, ['t-mid', 999]]), saved: first.saved, day: '2026-11-04' });
    expect(keysOf(later.members)).toEqual(keysOf(first.members));
    expect(later.saved).toBe(first.saved);
  });

  it('settles again on the next day', () => {
    const first = settleMateOrder(members, { lastUsed, saved: null, day: '2026-11-04' });
    const next = settleMateOrder(members, { lastUsed: new Map([...lastUsed, ['t-mid', 999]]), saved: first.saved, day: '2026-11-05' });
    expect(keysOf(next.members).filter((k) => k.startsWith('mate:'))).toEqual(['mate:t-mid', 'mate:t-old', 'mate:t-new']);
    expect(next.saved).toEqual({ day: '2026-11-05', keys: ['mate:t-mid', 'mate:t-old', 'mate:t-new'] });
  });

  it('puts a teammate made today at the end until tomorrow, moving nobody', () => {
    const first = settleMateOrder(members, { lastUsed, saved: null, day: '2026-11-04' });
    const withNew = settleMateOrder([...members, { key: 'mate:t-made' }], { lastUsed: new Map([...lastUsed, ['t-made', 999]]), saved: first.saved, day: '2026-11-04' });
    expect(keysOf(withNew.members).filter((k) => k.startsWith('mate:'))).toEqual(['mate:t-old', 'mate:t-new', 'mate:t-mid', 'mate:t-made']);
  });

  it('is settled again once the teammates arrive, when the morning\'s order was made before they loaded', () => {
    const empty = settleMateOrder([{ key: 'me' }], { lastUsed: new Map(), saved: null, day: '2026-11-04' });
    const out = settleMateOrder(members, { lastUsed, saved: empty.saved, day: '2026-11-04' });
    expect(keysOf(out.members).filter((k) => k.startsWith('mate:'))).toEqual(['mate:t-old', 'mate:t-new', 'mate:t-mid']);
  });

  it('drops a teammate that is gone', () => {
    const first = settleMateOrder(members, { lastUsed, saved: null, day: '2026-11-04' });
    const out = settleMateOrder(members.filter((m) => m.key !== 'mate:t-new'), { lastUsed, saved: first.saved, day: '2026-11-04' });
    expect(keysOf(out.members).filter((k) => k.startsWith('mate:'))).toEqual(['mate:t-old', 'mate:t-mid']);
  });
});

describe('the settled order', () => {
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

  it('is kept across a restart on the same day', () => {
    const store = memory();
    writeMateOrder({ day: '2026-11-04', keys: ['mate:t-a'] }, store);
    expect(readMateOrder(store)).toEqual({ day: '2026-11-04', keys: ['mate:t-a'] });
  });

  it('reads as nothing when nothing or junk was kept', () => {
    expect(readMateOrder(memory())).toBe(null);
    const store = memory();
    store.setItem('agentbox.faces.mateOrder', '{"day":3}');
    expect(readMateOrder(store)).toBe(null);
  });

  it('is what the app orders its members by', () => {
    expect(app).toMatch(/settleMateOrder\(/);
    expect(app).toMatch(/writeMateOrder\(/);
  });
});
