// EVERYTHING ON LATER READS SCHEDULED (w-8b637c7802).
//
// Two testers read Later and found three words for "comes back later": a
// thread they put off with L said WAITING, which reads as waiting on them; the
// ones with a start time said SCHEDULED; and a repeating task said NOTHING
// RUNNING with an accent ring, which looked like an error. Measured by drawing
// each row's status cell the way the Later page does.
//
// On Later every row reads Scheduled, beside the time it comes back. A thread
// added to Later unstarted still reads Not started, which says it has no time.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { statusCell, laterCell } from '../renderer/src/status-word.ts';

const NOW = new Date(2026, 10, 3, 18).getTime();
const row = (extra = {}) => ({ id: 'w-1', product: 'p', status: 'open', title: 'Estimate the move to Postgres 17', labels: ['founder'], priority: 5, epoch: 1, claim: null, createdAt: NOW - 86_400_000, updatedAt: NOW - 3_600_000, result: 'About four days.', ...extra });
const facts = { now: NOW, queued: [], inProgress: false };

describe('a row on Later', () => {
  it('put off with L reads Scheduled, not Waiting', () => {
    const put = row({ snoozedUntil: NOW + 86_400_000 });
    expect(statusCell(put, facts).word).toBe('Waiting');
    expect(laterCell(put, facts).word).toBe('Scheduled');
  });

  it('with a start time reads Scheduled, as it did', () => {
    expect(laterCell(row({ runAt: NOW + 3_600_000 }), facts).word).toBe('Scheduled');
  });

  it('added to Later unstarted still reads Not started', () => {
    expect(laterCell(row({ start: 'later', result: undefined }), facts).word).toBe('Not started');
  });

  it('a repeating task whose last run is over reads Scheduled, not Nothing running', () => {
    expect(laterCell(null, facts).word).toBe('Scheduled');
    expect(laterCell(null, facts).mark).toBe('sched');
  });
});

describe('the Later page uses it', () => {
  const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
  it('for threads', () => {
    expect(read('renderer/src/threads/Pages.tsx')).toMatch(/tab === 'snoozed' \? laterCell\(item, facts\) : statusCell\(item, facts\)/);
  });
  it('for repeating tasks, unless an agent is on their run now', () => {
    const list = read('renderer/src/components/List.tsx');
    expect(list).toMatch(/const running = live && last \? statusCell\(last, .*\) : null;/);
    expect(list).toMatch(/status=\{running\?\.live \? running : laterCell\(null\)\}/);
  });

  // The case the tester saw: the last run answered and sits open in Needs you.
  it('an open run nobody is working on is not "going now"', () => {
    const answered = row({ status: 'open', result: 'Two advisories.' });
    expect(statusCell(answered, { ...facts, inProgress: true }).live).toBe(false);
  });
});
