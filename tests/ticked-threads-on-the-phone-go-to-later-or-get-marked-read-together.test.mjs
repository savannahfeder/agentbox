// TICKED THREADS ON THE PHONE GO TO LATER, OR GET MARKED READ OR UNREAD, TOGETHER.
//
// The desktop's commands on ticked rows (App.tsx `itemCommands` with a
// selection) are Done, Later, Back to Inbox, Mark read, Mark unread, Resume and
// the priorities. The phone's bar under ticked threads had Close only
// (`closePicked` in mobile/src/app/index.tsx). These cases hold the desktop's
// rules for when each is offered, and the words its toasts say, against
// mobile/src/lib/picked.ts. Resume and priority have their own test
// (ticked-threads-on-the-phone-resume-together-and-take-one-priority).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { batchWords, inLater, pickedActs } from '../mobile/src/lib/picked';

const NOW = Date.UTC(2026, 10, 8, 12);
const HOUR = 3_600_000;
const her = (ts) => ({ ts, source: 'founder' });
const t = (id, extra = {}) => ({ product: 'alpha@a1b2c3d4e5f6', id, title: `Thread ${id}`, status: 'blocked', ...extra });
const unreadOf = (ids) => (i) => ids.includes(i.id);

describe('what the bar under ticked threads offers', () => {
  it('Close, Later and Mark read when every ticked thread is unread', () => {
    expect(pickedActs([t('a'), t('b')], { tab: 'inbox', unread: unreadOf(['a', 'b']) })).toEqual(['close', 'later', 'read']);
  });

  it('Mark unread, not Mark read, when every ticked thread is read', () => {
    expect(pickedActs([t('a'), t('b')], { tab: 'inbox', unread: unreadOf([]) })).toEqual(['close', 'later', 'unread']);
  });

  it('both when some are read and some are not', () => {
    expect(pickedActs([t('a'), t('b')], { tab: 'progress', unread: unreadOf(['a']) })).toEqual(['close', 'later', 'read', 'unread']);
  });

  it('no Close on the Later tab, as the desktop offers no Done in Scheduled', () => {
    expect(pickedActs([t('a')], { tab: 'snoozed', unread: unreadOf([]) })).toEqual(['later', 'unread']);
  });

  it('neither Mark read nor Mark unread with nothing ticked', () => {
    expect(pickedActs([], { tab: 'inbox', unread: unreadOf([]) })).toEqual(['close', 'later']);
  });
});

describe('Back to Inbox, first in the Later sheet', () => {
  it('is there when a ticked thread was put off and has not come back', () => {
    expect(inLater([t('a'), t('b', { snoozedUntil: NOW + HOUR, wrote: { snoozedUntil: her(NOW - HOUR) } })], NOW)).toBe(true);
  });
  it('and when one is set to run later', () => {
    expect(inLater([t('a', { runAt: NOW + HOUR, wrote: { runAt: her(NOW - HOUR) } })], NOW)).toBe(true);
  });
  it('is not there once that time has passed', () => {
    expect(inLater([t('a', { snoozedUntil: NOW - 1, wrote: { snoozedUntil: her(NOW - HOUR) } })], NOW)).toBe(false);
  });
  it('is not there when none was put off', () => {
    expect(inLater([t('a'), t('b')], NOW)).toBe(false);
  });
});

describe('what the toast says, in the desktop\'s words', () => {
  it('names the thread when one moved to Later, and counts them when more did', () => {
    expect(batchWords({ kind: 'later', until: NOW + HOUR, label: 'Tomorrow' }, [t('a')]).did(1)).toBe('Later: Thread a. Back tomorrow');
    expect(batchWords({ kind: 'later', until: NOW + HOUR, label: 'Tomorrow' }, [t('a'), t('b')]).did(2)).toBe('Later: 2 threads. Back tomorrow');
  });
  it('says they are back in the inbox when brought back', () => {
    expect(batchWords({ kind: 'later', until: 0 }, [t('a')]).did(1)).toBe('Back in the inbox');
    expect(batchWords({ kind: 'later', until: 0 }, [t('a'), t('b')]).did(2)).toBe('2 back in the inbox');
  });
  it('keeps the words Close always said', () => {
    const w = batchWords({ kind: 'close' }, [t('a'), t('b')]);
    expect([w.did(2), w.did(1), w.undid(2), w.partial(1, 2)]).toEqual(['Closed 2 threads', 'Closed 1 thread', 'Reopened 2 threads', 'Closed 1 of 2.']);
  });
});

describe('the inbox page', () => {
  const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
  it('draws the bar from these rules and sends Later through the same plan as one thread\'s Later', () => {
    expect(inbox).toMatch(/pickedActs\(/);
    expect(inbox).toMatch(/c\.laterAll\(/);
    expect(fs.readFileSync('mobile/src/state/cloud.tsx', 'utf8')).toMatch(/pressAll\(items, \{ kind: 'later', until, label \}/);
  });
  it('marks read and unread on the phone, as one thread\'s Mark unread does', () => {
    expect(inbox).toMatch(/c\.markSeen\(/);
    expect(inbox).toMatch(/c\.markUnseen\(/);
  });
});
