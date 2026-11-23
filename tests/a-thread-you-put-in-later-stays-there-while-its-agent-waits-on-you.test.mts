// A THREAD YOU PUT IN LATER STAYS THERE WHILE ITS AGENT WAITS ON YOU (w-6735a4fac4).
//
// Reported with a screenshot: a thread whose agent was waiting on a sign-in
// card was moved to Later until 2pm, and it stayed in Needs you. The thread's
// own page said "In Later until today 2:00pm" under it. Traced to the order of
// the inbox rule: an agent waiting on you (a permission card or a sign-in,
// `asking`) returned before your own Later was read, both in `belongsInInbox`
// and in the window's `inboxCandidates`, so no Later could take the row out.
//
// A question you put away already stays away, session or not
// (tests/a-running-agent-cannot-hide-its-own-unanswered-question). An ask now
// does the same: it waits in Later, not In progress, because nothing moves
// until you answer, and it comes back to Needs you at the time you picked,
// still asking. Only your own Later counts, so an agent's own moment still
// never hides what it asks.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { askPutOff, belongsInInbox, belongsInProgress, hiddenUntil } from '../renderer/src/list-rules.ts';

const NOW = 1_795_300_000_000;
const TWO_PM = NOW + 3 * 3_600_000;

// Your own thread with a worker on it, its agent waiting on a sign-in card.
const thread = (over: Record<string, unknown> = {}) => ({
  id: 'w-first-job', status: 'claimed', kind: 'directive', labels: ['founder'], title: 'Start on the first job',
  createdAt: NOW - 86_400_000, updatedAt: NOW - 600_000,
  signIn: { id: 's-abcdef1234', service: 'Example', url: 'https://example.com/sign-in', asksForCode: true, at: NOW - 1_560_000 },
  wrote: { title: { ts: NOW - 86_400_000, source: 'founder' } } as Record<string, { ts: number; source: string }>,
  ...over,
});
// The same thread, moved to Later until 2pm with L.
const putOff = (over: Record<string, unknown> = {}) => {
  const t = thread(over);
  return { ...t, snoozedUntil: TWO_PM, wrote: { ...t.wrote, snoozedUntil: { ts: NOW - 60_000, source: 'founder' } } };
};

const needsYou = (i: ReturnType<typeof thread>, now = NOW) =>
  belongsInInbox(i, { hiddenUntil: hiddenUntil(i), now, live: true, asking: true });

describe('a thread whose agent waits on you, that you moved to Later', () => {
  it('leaves Needs you until the time you picked', () => {
    expect(needsYou(putOff())).toBe(false);
    expect(needsYou(putOff(), TWO_PM - 1)).toBe(false);
  });

  it('waits in Later rather than In progress, because nothing moves until you answer', () => {
    expect(askPutOff(putOff(), true, NOW)).toBe(true);
  });

  it('comes back to Needs you at that time, still asking', () => {
    expect(needsYou(putOff(), TWO_PM + 1)).toBe(true);
    expect(askPutOff(putOff(), true, TWO_PM + 1)).toBe(false);
  });

  it('comes back the moment you write on it, as any thread in Later does', () => {
    const wrote = putOff({ answer: 'I am back, here is the code' });
    const replied = { ...wrote, wrote: { ...wrote.wrote, answer: { ts: NOW - 1000, source: 'founder' } } };
    expect(needsYou(replied)).toBe(true);
    expect(askPutOff(replied, true, NOW)).toBe(false);
  });
});

describe('the cases that must not match', () => {
  it('a thread nobody put off is in Needs you while its agent waits, as before', () => {
    expect(needsYou(thread())).toBe(true);
    expect(askPutOff(thread(), true, NOW)).toBe(false);
  });

  it('an agent\'s own moment never hides what it asks', () => {
    // Its last answer said it runs again tomorrow, and its run now is stopped on a card.
    const set = thread({
      status: 'open', result: 'Checked the build. I run again tomorrow at nine.', runAt: NOW + 86_400_000,
    });
    const itsOwn = { ...set, wrote: { ...set.wrote, result: { ts: NOW - 3_600_000, source: 'agent' }, runAt: { ts: NOW - 3_600_000, source: 'agent' } } };
    expect(hiddenUntil(itsOwn)).toBeGreaterThan(NOW);
    expect(needsYou(itsOwn)).toBe(true);
    expect(askPutOff(itsOwn, true, NOW)).toBe(false);
  });

  it('a thread you put off whose agent is working, not asking, is In progress until its run ends, as before', () => {
    expect(askPutOff(putOff(), false, NOW)).toBe(false);
    expect(belongsInInbox(putOff(), { hiddenUntil: hiddenUntil(putOff()), now: NOW, live: true, asking: false })).toBe(false);
    expect(belongsInProgress(putOff(), { now: NOW, live: true })).toBe(true);
  });
});

describe('the window reads the one rule in all three lists', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const between = (from: string, to: string) => {
    const start = app.indexOf(from);
    return start < 0 ? '' : app.slice(start, app.indexOf(to, start));
  };

  it('Needs you lets your Later answer before an agent that waits on you', () => {
    const needs = between('const inboxCandidates = useMemo(', 'const liftedBy = useRef(');
    expect(needs).toMatch(/if \(asking\(i\)\) return !askPutOff\(i, true, listNow\);/);
    expect(needs).not.toMatch(/if \(asking\(i\)\) return true;/);
  });

  it('In progress leaves it out, after a reply you just sent has had its say', () => {
    const progress = between('const progress = useMemo(() => [', 'const progressTab = useMemo(');
    const starting = progress.indexOf('if (startingIds.has(i.id) && deferredUntil <= listNow) return true;');
    const putOffHere = progress.search(/if \(askPutOff\(i, asking\(i\), listNow\)\) return false;/);
    expect(starting).toBeGreaterThan(-1);
    expect(putOffHere).toBeGreaterThan(starting);
  });

  it('Later holds it, unless something you did is still being held for undo', () => {
    const later = between('const snoozed = useMemo(() => [', '].sort((a, b) => whenShown(a) - whenShown(b))');
    expect(later).toMatch(/askPutOff\(i, asking\(i\), listNow\) && !pendingIds\.has\(i\.id\)/);
  });
});
