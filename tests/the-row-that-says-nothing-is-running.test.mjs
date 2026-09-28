// 2026-08-29, on the seventeenth of seventeen looks photographed in her own
// inbox over four rounds. The row it approves is the list's own row with a rule
// standing at its left edge in the app's own faint ink.
//
// The design is pinned by the picture, not by a test: `scripts/
// The harness measures the rule against its own subject and
// preview and writes what it found. What is pinned HERE is the half of her
// sentence that is behaviour rather than pixels, and the row is built out of a
// pure function so that half can be checked without a browser.
//
// THE ONE THING THAT WOULD MAKE HER RIGHT AGAIN. A row that draws beautifully
// and names nothing is the same silence in a nicer font.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TROUBLE_ID, isTroubleRow, troubleBody, troubleRow, troubleSummary, troubleTitle,
} from '../renderer/src/trouble-row.ts';
import { rowSummary, SUMMARY_BUDGET } from '../renderer/src/list-rules.ts';
import { causeBreakdown, strandedSentence, strandedRemedy } from '../shared/spawn-trouble.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

// HER OWN NIGHT, and the numbers are the ones measured off her store: seven
// tasks at the Claude session limit that reset at 6pm, four on the second
// Claude login, which was signed out.
const SINCE = new Date(2026, 7, 28, 19, 1).getTime();
const NOW = new Date(2026, 7, 28, 20, 36).getTime();

function trouble(rows, resetsAt = '6pm') {
  return {
    since: SINCE,
    cause: new Set(rows.map((r) => r.cause)).size === 1 ? rows[0].cause : 'mixed',
    message: strandedSentence({ count: rows.length, since: SINCE, now: NOW }),
    remedy: strandedRemedy(rows.map((r) => r.cause)),
    count: rows.length,
    resetsAt,
    byCause: causeBreakdown(rows, resetsAt),
    ids: rows.map((r) => r.id),
    stopped: rows.map((r) => ({ id: r.id, cause: r.cause })),
    retryAt: 0,
  };
}

const HER_NIGHT = trouble([
  ...Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, cause: 'signed-out' })),
  ...Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, cause: 'at-limit', resetsAt: '6pm' })),
]);

const HER_ITEMS = [
  { id: 's0', title: 'Buy:', productName: NAME },
  { id: 'l0', title: 'Urgent tasks are being prioritized below high priority tasks', productName: NAME },
];

describe('the row itself', () => {
  it('says how many, in the words the app uses everywhere else', () => {
    expect(troubleTitle(HER_NIGHT)).toBe('11 tasks have not been able to run');
  });

  it('says one task HAS, not one task HAVE', () => {
    expect(troubleTitle(trouble([{ id: 'a', cause: 'signed-out' }]))).toBe('1 task has not been able to run');
  });

  it('counts the same way the sentence it came from counts', () => {
    // Both are `strandedTitle`, so a reworded count cannot land in one and not
    // the other.
    expect(strandedSentence({ count: 11, since: SINCE, now: NOW })).toContain(troubleTitle(HER_NIGHT));
  });

  it('leads its second line with what happens next, not with what broke', () => {
    // The clause per cause is the short form of `causeNext`, and the hour is
    // read out of the app's own sentence rather than reworded here.
    expect(troubleSummary(HER_NIGHT)).toBe('4 need a login · 7 back at 6pm');
  });

  it('puts what needs her hands first, whatever the counts are', () => {
    // `causeBreakdown` sorts hers-first and the row inherits it, so the half
    // she can end is never behind the half that ends itself.
    expect(troubleSummary(HER_NIGHT).startsWith('4 need a login')).toBe(true);
  });

  it('says when the limit lets go, and says so without the hour when there is none', () => {
    const noHour = trouble([{ id: 'l', cause: 'at-limit' }], null);
    expect(troubleSummary(noHour)).toBe('1 back when the limit resets');
  });

  it('never grows past what one line of the row holds, even with a third cause', () => {
    // MEASURED 2026-08-28: the sentence that used to live above the list was
    // 148 characters and the row clips at 112, so the hour it comes back was
    // exactly the part that fell off. This is that fault as a test.
    const three = trouble([
      ...Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, cause: 'signed-out' })),
      ...Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, cause: 'at-limit', resetsAt: '6pm' })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `w${i}`, cause: 'workspace' })),
    ]);
    expect(troubleSummary(three).length).toBeLessThan(SUMMARY_BUDGET);
    expect(troubleSummary(three)).toContain('back at 6pm');
  });

  it('is stamped with when this started, not with when the row was built', () => {
    // Every other row's right end answers "how old is this". Built with the
    // clock it would say "now" forever while nothing moved for an hour.
    const row = troubleRow(HER_NIGHT, HER_ITEMS);
    expect(row.updatedAt).toBe(SINCE);
    expect(row.createdAt).toBe(SINCE);
  });
});

describe('what the inbox row prints under the title', () => {
  it('is the causes line and stops there', () => {
    // The body's first line is the causes and the second paragraph names the
    // first cause in full. Measured 2026-08-29 in her own inbox.
    const row = troubleRow(HER_NIGHT, HER_ITEMS);
    expect(rowSummary(row, 'inbox')).toBe('4 need a login · 7 back at 6pm');
  });

  it('says the same sentence the opened row opens with', () => {
    // Or she reads half a message in the list and a different one inside it.
    const row = troubleRow(HER_NIGHT, HER_ITEMS);
    expect((row.body ?? '').split('\n')[0]).toBe(rowSummary(row, 'inbox'));
  });
});

describe('what opening it says, which is the half she was doing by hand', () => {
  const body = troubleBody(HER_NIGHT, HER_ITEMS);

  it('names every cause and what happens next for each', () => {
    expect(body).toContain('4 stopped by a signed-out Claude login.');
    expect(body).toContain('Type /login in a terminal and they pick straight up.');
    expect(body).toContain('7 waiting on your Claude limit.');
    expect(body).toContain('They start again on their own at 6pm.');
  });

  it('names the tasks, because an id is not something she has ever seen', () => {
    expect(body).toContain(`Buy: (${NAME})`);
    expect(body).toContain(`Urgent tasks are being prioritized below high priority tasks (${NAME})`);
  });

  it('still lists a task whose row it cannot find, rather than quietly dropping it', () => {
    // The list under the heading has to add up to the number in it.
    const body2 = troubleBody(HER_NIGHT, []);
    expect(body2.match(/^- /gm)).toHaveLength(11);
  });

  it('works off a supervisor that only sent ids, with no cause on any of them', () => {
    const old = { ...HER_NIGHT, stopped: undefined };
    const body3 = troubleBody(old, HER_ITEMS);
    expect(body3).toContain('4 stopped by a signed-out Claude login.');
    // Nothing is attributed to a cause it cannot prove, and nothing is lost.
    expect(body3.match(/^- /gm)).toHaveLength(11);
  });
});

describe('it is a task in every way it can honestly be', () => {
  it('is one row with one id, which is not any ledger row', () => {
    const row = troubleRow(HER_NIGHT, HER_ITEMS);
    expect(row.id).toBe(TROUBLE_ID);
    expect(isTroubleRow(row)).toBe(true);
    expect(isTroubleRow({ id: 'w-cf0e8821b3' })).toBe(false);
    expect(isTroubleRow(null)).toBe(false);
  });

  it('carries the fields the list, the selection and the pane all read', () => {
    const row = troubleRow(HER_NIGHT, HER_ITEMS);
    expect(row.status).toBe('open');
    expect(row.title).toBeTruthy();
    expect(row.body).toBeTruthy();
    expect(row.labels).toEqual([]);
    expect(row.claim).toBe(null);
  });

  it('wears no urgent mark and claims no product', () => {
    // Priority 9 draws "!" and she did not set one. An empty productName draws
    // nothing in the column that would otherwise name a product this row is
    // not about.
    const row = troubleRow(HER_NIGHT, HER_ITEMS);
    expect(row.priority).toBe(5);
    expect(row.productName).toBe('');
    expect(row.product).toBe('');
  });

  it('reads its clock as a wait, not as a last movement', () => {
    // The line under the title is the byline she picked on, and it says "last
    // moved 12m ago" on every row that has moved. This row has never moved.
    // What its time means is how long her tasks have been stopped, which is the
    // whole reason it is on the screen, so it says that rather than borrowing a
    // sentence that is not true of it.
    const byline = readFileSync(
      new URL('../renderer/src/components/Byline.tsx', import.meta.url), 'utf8',
    );
    expect(byline).toMatch(/isTroubleRow\(item\) \? `nothing has started for \$\{f\.age\}`/);
  });
});
