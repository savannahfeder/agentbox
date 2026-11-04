// A MESSAGE YOU ANSWERED STAYS ON THE BOARD (w-57a202a968, 2026-10-05).
//
// It went to Done from 2026-10-05 until it moved to In
// progress as Waiting on them (tests/a-thread-with-a-person-where-you-spoke-last).
//
// A teammate sent bug findings in a message. You replied "Working on it" and
// the message disappeared from every column of the board, so an hour later it
// could not be found ("I don't see her face icon anywhere here"). The reply
// handed the conversation to the teammate (`inMyInbox`, whoever did not speak
// last), In progress never holds a message, and Done held only rows whose
// status is done, which a conversation never is. So it was on no tab at all.
//
// Her rule, in her words: "It's not supposed to leave the board; it's supposed
// to go in Done." A conversation where you spoke last is Done for you, until
// the other person writes again, when it is back in your inbox.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import { iSpokeLast, inMyInbox } from '../shared/team-rules.mjs';

const ME = 'p-me';
const MAYA = 'p-maya';
const direct = { slug: 'direct-1', team: { projectId: 'x', sharedBy: MAYA, direct: true, people: [ME] } };
const sharedWork = { slug: 'website', team: { projectId: 'y', sharedBy: MAYA } };
const privateProject = { slug: 'home', team: null };

// Maya wrote first, then whoever wrote the answer last.
const conversation = (lastBy, extra = {}) => ({
  createdBy: MAYA, assignee: lastBy === ME ? MAYA : ME, people: [MAYA, ME], status: 'open',
  wrote: { body: { ts: 100, by: MAYA }, ...(lastBy ? { answer: { ts: 200, by: lastBy } } : {}) },
  ...extra,
});

describe('a message you have answered', () => {
  it('is Done for you once you reply', () => {
    expect(iSpokeLast(conversation(ME), direct, ME)).toBe(true);
    expect(inMyInbox(conversation(ME), direct, ME)).toBe(false);
  });

  it('is not Done while the other person spoke last: it is waiting on you', () => {
    expect(iSpokeLast(conversation(null), direct, ME)).toBe(false);
    expect(iSpokeLast(conversation(MAYA), direct, ME)).toBe(false);
    expect(inMyInbox(conversation(MAYA), direct, ME)).toBe(true);
  });

  it('is Done for the other person while you are the one to answer', () => {
    expect(iSpokeLast(conversation(null), direct, MAYA)).toBe(true);
  });

  it('a message you started and nobody has answered is Done for you too', () => {
    const mine = { createdBy: ME, people: [ME, MAYA], status: 'open', wrote: { body: { ts: 100, by: ME } } };
    expect(iSpokeLast(mine, direct, ME)).toBe(true);
  });

  it('leaves a conversation already closed to the ordinary Done rule', () => {
    expect(iSpokeLast(conversation(ME, { status: 'done' }), direct, ME)).toBe(false);
  });

  it('never touches work rows, shared or private, or a Mac nobody is signed in on', () => {
    expect(iSpokeLast(conversation(ME), sharedWork, ME)).toBe(false);
    expect(iSpokeLast(conversation(ME), privateProject, ME)).toBe(false);
    expect(iSpokeLast(conversation(ME), direct, null)).toBe(false);
  });
});

it('the In progress list reads it, so it is on the board', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const progress = app.slice(app.indexOf('const progress = useMemo'), app.indexOf('const progress = useMemo') + 900);
  expect(progress).toMatch(/iSpokeLast\(/);
});
