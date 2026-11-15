// WHAT YOU SEND ON THE PHONE IS SCROLLED INTO VIEW.
//
// In phone session m19 (2026-11-15), after picking a choice or sending a
// reply, the thread page redrew from the top with the earlier messages open,
// and the pick or reply just sent sat below the screen, so nothing showed it
// had gone. It had reached the agent. The page stayed where it was because it
// follows the end only when it opened there. Measured with the phone's own
// thread rules (threadOf, pageOf): a pick before the computer takes it is
// drawn as "You picked option 1" at the foot, and a reply as her message there.
// Now a message or pick of hers appearing on the open thread takes the page
// to its end.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { threadOf } from '../mobile/src/lib/thread';
import { followsHerSend, yoursIn } from '../mobile/src/lib/thread-scroll';

const NOW = Date.parse('2026-11-15T18:30:00Z');
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const RES = '**Which way?**\n\nI can do it two ways.\n\n## Options\n1. The first (recommended)\n2. The second';
const item = { id: 'w-1', title: 'Multiplayer', status: 'open', kind: 'question', labels: ['founder'], priority: 0, createdAt: NOW - 9e6, updatedAt: NOW - 9e5, result: RES, wrote: { result: { ts: NOW - 9e5, source: 'agent' } } };
const history = [
  { id: 'w-1', ts: NOW - 3e6, source: 'agent', patch: { result: 'Started.' } },
  { id: 'w-1', ts: NOW - 2e6, source: 'founder', patch: { answer: 'go on' } },
  { id: 'w-1', ts: NOW - 9e5, source: 'agent', patch: { result: RES } },
];
const rows = (commands) => ({
  projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
  threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(NOW - 60_000), snapshot: { v: 3, item, history } }],
  commands,
});
const sent = (text) => ({ id: 'c1', device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text }, created_at: iso(NOW - 10_000) });
const yours = (r) => yoursIn(threadOf(r, phoneView(r, NOW), A, 'w-1', { whole: false, tabs: null, me: null }).events);

describe('a send on the open thread', () => {
  const before = yours(rows([]));
  it('a pick adds one of hers', () => {
    expect(yours(rows([sent('Option 1: The first (recommended)')]))).toBe(before + 1);
  });
  it('a reply adds one of hers', () => {
    expect(yours(rows([sent('Do the second one instead')]))).toBe(before + 1);
  });
  it('takes the page to its end', () => {
    expect(followsHerSend({ key: 'p/w-1', yours: before }, 'p/w-1', before + 1)).toBe(true);
  });
});

describe('what leaves the page where it is', () => {
  it('opening a thread, or moving to another one', () => {
    expect(followsHerSend(null, 'p/w-1', 3)).toBe(false);
    expect(followsHerSend({ key: 'p/w-1', yours: 1 }, 'p/w-2', 3)).toBe(false);
  });
  it('an agent answering, or her pending reply turning into the computer\'s copy of it', () => {
    expect(followsHerSend({ key: 'p/w-1', yours: 2 }, 'p/w-1', 2)).toBe(false);
  });
  it('a send taken back', () => {
    expect(followsHerSend({ key: 'p/w-1', yours: 2 }, 'p/w-1', 1)).toBe(false);
  });
});

describe('the thread page', () => {
  const page = fs.readFileSync(new URL('../mobile/src/app/thread/[product]/[id].tsx', import.meta.url), 'utf8');
  it('follows her send to the end, and only once the thread is drawn', () => {
    expect(page).toMatch(/if \(yoursNow === null\) return;/);
    expect(page).toMatch(/followsHerSend\(yours\.current, key, yoursNow\)\) \{\s*resting\.current = true;\s*scroll\.current\?\.scrollToEnd/);
  });
});
