// SEND AS: A TASK OR A MESSAGE (w-c34591721f, approved 2026-10-17).
//
// What broke: a to-do is a task you give yourself, and the same gesture should
// give one to a teammate — but the card could only ever make a message out of a
// person. `assignee` and its laws already existed (shared/team-rules.mjs: a row
// held by a person never starts an agent, and sits in that one person's inbox
// until it is done); the card had no way to set them. The old one-line card did
// ("Maya does it.", approved 2026-09-30) and the 2026-10-01 rewrite dropped it.
//
// How it was measured: the card's own head, drawn in the real app at 1920x1080
// and read back off the screen. "Send As" was picked out of sixteen words for
// the label, "Due On" out of ten for the day, and "No Deadline" out of ten for
// what the day says when nobody set one — the point of that last one being that
// most tasks never carry a day, so the row has to read as an answer rather than
// as an empty field somebody forgot to fill in.
//
// The cases: a task carries the person and the day; a task with no day carries
// no day at all rather than a null; a message carries neither; and the head
// shows the Due On row ONLY for a task, because a message has nothing to be due.
import { describe, it, expect } from 'vitest';
import {
  NO_DEADLINE, dueWords, headRows, taskFields,
} from '../renderer/src/threads/composer-rules.ts';

describe('what a task to a teammate carries', () => {
  it('names the person who has to do it', () => {
    expect(taskFields({ personId: 'u-maya', due: null })).toEqual({ assignee: 'u-maya' });
  });

  it('carries the day when there is one', () => {
    expect(taskFields({ personId: 'u-maya', due: '2026-10-23' }))
      .toEqual({ assignee: 'u-maya', due: '2026-10-23' });
  });

  // A null `due` would be a field set to nothing, which is not the same as a
  // field nobody set: the store keeps what it is given.
  it('carries no day at all rather than an empty one', () => {
    expect('due' in taskFields({ personId: 'u-maya', due: null })).toBe(false);
  });
});

describe('what Due On says', () => {
  it('says No Deadline when nobody set a day, in those exact capitals', () => {
    expect(dueWords(null)).toBe('No Deadline');
    expect(NO_DEADLINE).toBe('No Deadline');
  });

  it('names today and tomorrow by name, and the rest by weekday', () => {
    const friday = new Date(2026, 9, 23);
    expect(dueWords('2026-10-23', friday)).toBe('Today');
    expect(dueWords('2026-10-24', friday)).toBe('Tomorrow');
    expect(dueWords('2026-10-26', friday)).toBe('Monday');
  });

  // A day further out than the picker offers still has to read as a day, not
  // as nothing: the card may be reopened on a thread somebody dated by hand.
  it('falls back to the date itself for a day the picker never offered', () => {
    expect(dueWords('2027-01-09', new Date(2026, 9, 23))).toBe('2027-01-09');
  });
});

describe('which rows the head shows', () => {
  it('shows the model to an agent, and never Send As', () => {
    expect(headRows({ person: false, kind: 'message' })).toEqual(['to', 'model']);
  });

  it('asks a person which it is', () => {
    expect(headRows({ person: true, kind: 'message' })).toEqual(['to', 'sendAs']);
  });

  it('adds the day only once it is a task', () => {
    expect(headRows({ person: true, kind: 'task' })).toEqual(['to', 'sendAs', 'dueOn']);
  });

  // The agent card is untouched by any of this; a model is still the only
  // second row it has.
  it('never gives an agent a day', () => {
    expect(headRows({ person: false, kind: 'task' })).toEqual(['to', 'model']);
  });
});
