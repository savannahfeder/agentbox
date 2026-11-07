// A TASK SAYS WHEN IT IS DUE, AND WHEN IT IS LATE.
//
// Sofia wrote "I need yours by 3pm" at 6:07am. At 4pm and again at 8pm Maya's
// row for her said only WAITING ON YOU and the time it was sent: "Nothing red,
// nothing late." Measured on the code before this: no rule read a deadline out
// of words at all, `dueWords` knew only a picked day and said "Overdue Oct 2",
// and nothing put a task past its day back in front of the person holding it.
import { describe, it, expect } from 'vitest';
import { deadlineIn, deadlineOf, dueSaid, isLate, dayDeadline, lateForMe } from '../shared/team-tasks.mts';
import { inMyInbox, GIVEN_TASK } from '../shared/team-rules.mts';

const at = (h, m = 0, day = 31) => new Date(2026, 9, day, h, m).getTime();
const word = (d, now, o) => dueSaid(d, now, o)?.word ?? null;

describe('a deadline said in words', () => {
  const sent = at(6, 7);
  it('reads "by 3pm" as 3pm on the day it was said', () => {
    expect(deadlineIn('I need yours by 3pm', sent)).toEqual({ at: at(15), clock: true });
    expect(deadlineIn('comments by 3 pm please', sent)).toEqual({ at: at(15), clock: true });
    expect(deadlineIn('by 3:30pm', sent)).toEqual({ at: at(15, 30), clock: true });
    expect(deadlineIn('before 15:00', sent)).toEqual({ at: at(15), clock: true });
    expect(deadlineIn('by noon', sent)).toEqual({ at: at(12), clock: true });
  });

  it('a time already past when it was said is the next day', () => {
    expect(deadlineIn('by 9am', at(10))).toEqual({ at: at(9, 0, 32), clock: true });
  });

  it('reads a day, with or without a time', () => {
    expect(deadlineIn('by tomorrow', sent)).toEqual({ at: at(0, 0, 33), clock: false });
    expect(deadlineIn('by tomorrow at 10am', sent)).toEqual({ at: at(10, 0, 32), clock: true });
    expect(deadlineIn('by 5pm tomorrow', sent)).toEqual({ at: at(17, 0, 32), clock: true });
    // 2026-10-31 is a Saturday.
    expect(deadlineIn('by Monday', sent)).toEqual({ at: at(0, 0, 34), clock: false });
    expect(deadlineIn('by end of day', sent)).toEqual({ at: at(0, 0, 32), clock: false });
  });

  it('midnight is the end of the day it was said', () => {
    expect(deadlineIn('by midnight', sent)).toEqual({ at: at(0, 0, 32), clock: true });
  });

  it('is not a number with no time on it, nor "by" in another sense', () => {
    expect(deadlineIn('grouped by 3 people', sent)).toBeNull();
    expect(deadlineIn('cut it by 20 seconds', sent)).toBeNull();
    expect(deadlineIn('by the way, the cut is up', sent)).toBeNull();
    expect(deadlineIn('at 3pm we meet', sent)).toBeNull();
    expect(deadlineIn('by 13pm', sent)).toBeNull();
    expect(deadlineIn('', sent)).toBeNull();
  });
});

describe('what the row says', () => {
  const three = { at: at(15), clock: true };
  it('"Due 3pm" on the day, then how late', () => {
    expect(word(three, at(9))).toBe('Due 3pm');
    expect(word(three, at(15))).toBe('1 min late');
    expect(word(three, at(15, 40))).toBe('40 min late');
    expect(word(three, at(16))).toBe('1 hour late');
    expect(word(three, at(20))).toBe('5 hours late');
    expect(word(three, at(16, 0, 33))).toBe('2 days late');
    expect(dueSaid(three, at(16)).late).toBe(true);
    expect(dueSaid(three, at(9)).late).toBe(false);
  });

  it('nothing before the day on a row, and the day itself where it is asked for', () => {
    const later = { at: at(15, 0, 33), clock: true };
    expect(word(later, at(9))).toBeNull();
    // A deadline with a time says it ahead of the day too (Dev: "tomorrow 10am").
    expect(word(later, at(9), { ahead: true })).toBe('Due Mon 3pm');
    expect(word({ at: at(15, 0, 32), clock: true }, at(9), { ahead: true })).toBe('Due tomorrow 3pm');
    expect(word({ at: at(15, 0, 45), clock: true }, at(9), { ahead: true })).toBe('Due Nov 14 3pm');
  });

  it('a picked day is due all of that day and late at the midnight after it', () => {
    const day = dayDeadline('2026-10-31');
    expect(word(day, at(23, 59))).toBe('Due today');
    expect(isLate(day, at(23, 59))).toBe(false);
    expect(word(day, at(0, 0, 32))).toBe('1 day late');
    expect(isLate(day, at(0, 0, 32))).toBe(true);
    expect(word(day, at(9, 0, 33))).toBe('2 days late');
  });

  it('a deadline at midnight reads as midnight on its own day, and is late from midnight', () => {
    const midnight = { at: at(0, 0, 32), clock: true };
    expect(word(midnight, at(23, 30))).toBe('Due midnight');
    expect(word(midnight, at(0, 0, 32))).toBe('1 min late');
  });
});

describe('whose deadline it is', () => {
  const me = 'maya';
  const sofia = 'sofia';
  const chat = (...said) => ({ chat: said.map(([by, ts, text]) => ({ by, ts, text })), threads: {} });

  it('a message waiting on you carries the deadline in it', () => {
    const row = { id: 'c', status: 'open', people: [me, sofia], talk: chat([sofia, at(6, 7), 'Here is the cut. I need yours by 3pm']) };
    expect(deadlineOf(row, me)).toEqual({ at: at(15), clock: true });
  });

  it('answering it settles it, and your own words are no deadline for you', () => {
    const answered = { id: 'c', status: 'open', people: [me, sofia], talk: chat([sofia, at(6, 7), 'I need yours by 3pm'], [me, at(9), 'On it']) };
    expect(deadlineOf(answered, me)).toBeNull();
    const mine = { id: 'c', status: 'open', people: [me, sofia], talk: chat([me, at(6), 'Send it by 3pm']) };
    expect(deadlineOf(mine, me)).toBeNull();
  });

  const task = (o = {}) => ({ id: 't', status: 'open', labels: [GIVEN_TASK], assignee: me, people: [sofia, me], createdBy: sofia, title: 'Notes on the cut', body: 'Notes on the cut', createdAt: at(6), ...o });

  it('a task: the day picked, else what its giver wrote, which stays after you answer', () => {
    expect(deadlineOf(task({ due: '2026-11-02' }), me)).toEqual(dayDeadline('2026-11-02'));
    const said = task({ talk: chat([sofia, at(6), 'Notes on the cut by 3pm'], [me, at(7), 'Will do']) });
    expect(deadlineOf(said, me)).toEqual({ at: at(15), clock: true });
  });

  it('a task with no due date never says late', () => {
    const none = task();
    expect(deadlineOf(none, me)).toBeNull();
    expect(dueSaid(deadlineOf(none, me), at(23))).toBeNull();
    expect(deadlineOf(task({ due: 'none' }), me)).toBeNull();
  });

  it('a done task has no deadline', () => {
    expect(deadlineOf(task({ due: '2026-10-30', status: 'done' }), me)).toBeNull();
  });
});

describe('a past-due task someone gave you comes back to Needs you', () => {
  const me = 'maya';
  const product = { slug: 'direct-sofia', team: { projectId: 'p', direct: true, people: ['sofia', me] } };
  const chat = (...said) => ({ chat: said.map(([by, ts, text]) => ({ by, ts, text })), threads: {} });
  const task = (o = {}) => ({ id: 't', status: 'open', labels: [GIVEN_TASK], assignee: me, people: ['sofia', me], createdBy: 'sofia', title: 'Cut notes', createdAt: at(6),
    talk: chat(['sofia', at(6), 'Cut notes by 3pm'], [me, at(7), 'Will do']), ...o });

  it('once answered it waits on you in In progress, until it is late', () => {
    expect(inMyInbox(task(), product, me, at(14, 59))).toBe(false);
    expect(inMyInbox(task(), product, me, at(15))).toBe(true);
  });

  it('not one you gave, and not one with no deadline', () => {
    const given = task({ assignee: 'sofia', createdBy: me, people: [me, 'sofia'], talk: chat([me, at(6), 'Cut notes by 3pm'], ['sofia', at(7), 'ok'], [me, at(8), 'thanks']) });
    expect(inMyInbox(given, product, me, at(16))).toBe(false);
    expect(inMyInbox(task({ talk: chat(['sofia', at(6), 'Cut notes'], [me, at(7), 'Will do']) }), product, me, at(23))).toBe(false);
  });
});

describe('what is late rises to the top of Needs you', () => {
  const me = 'maya';
  const chat = (...said) => ({ chat: said.map(([by, ts, text]) => ({ by, ts, text })), threads: {} });
  it('a late task given to you and a late message to you; not a task you gave, not one on time', () => {
    const given = { id: 't', status: 'open', labels: [GIVEN_TASK], assignee: me, people: ['sofia', me], createdBy: 'sofia', due: '2026-10-30' };
    const gave = { ...given, assignee: 'sofia', createdBy: me, people: [me, 'sofia'] };
    const message = { id: 'c', status: 'open', people: [me, 'sofia'], talk: chat(['sofia', at(6), 'I need yours by 3pm']) };
    expect(lateForMe(given, me, at(9))).toBe(true);
    expect(lateForMe(gave, me, at(9))).toBe(false);
    expect(lateForMe(message, me, at(16))).toBe(true);
    expect(lateForMe(message, me, at(14))).toBe(false);
  });
});
