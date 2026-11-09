// COMMAND K OPENS THE ROW IT SHOWS, AND THE SAME ROW EVERY TIME.
//
// Dev: "Cmd+K picked a different thread the second time, and my
// instruction to an agent went to Maya." He typed "Per-clinic" and pressed
// Enter blind, as he had at 13:46; at 14:05 it opened "Integration branch
// security and deployment triage" (Maya's task) instead. His follow-up found
// why: "the highlighted row is wherever the mouse rests, and ArrowUp did not
// change what Enter opened." Read in renderer/src/components/Palette.tsx: the
// pick was an index, a row's mouseenter set it (and Chromium sends one when a
// list moves under a pointer that has not moved), and thread rows came in the
// search's own order, where a thread whose body names the words can sit above
// the thread whose title is them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { titleFirst, keptPick, pointerMoved, namesIt } from '../renderer/src/palette-pick.ts';
import { paletteOrder } from '../renderer/src/components/Palette.tsx';
import { threadSearchDetails } from '../renderer/src/threads/search.ts';
import { replyTarget } from '../renderer/src/reply-keys.ts';

const row = (id, label) => ({ id, label, run: () => {} });
const triage = row('thread-app-w-1', 'Integration branch security and deployment triage');
const passwords = row('thread-app-w-2', 'Per-clinic staff passwords');
const quality = row('thread-app-w-3', 'Quality lead writes to Maya');

describe('which thread comes first', () => {
  it('the thread whose title has the words, ahead of one that only mentions them', () => {
    expect(titleFirst([triage, quality, passwords], 'Per-clinic').map((r) => r.id)).toEqual([passwords.id, triage.id, quality.id]);
  });

  it('an exact title, then a title that starts with the words, then one that has them', () => {
    const a = row('a', 'Staff passwords per-clinic follow-up');
    const b = row('b', 'Per-clinic staff passwords plan');
    const c = row('c', 'Per-clinic staff passwords');
    expect(titleFirst([a, b, c], 'per-clinic staff passwords').map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('keeps the search\'s own order among rows that match alike, and leaves an empty query alone', () => {
    const x = row('x', 'Notes'); const y = row('y', 'Notes');
    expect(titleFirst([x, y], 'notes').map((r) => r.id)).toEqual(['x', 'y']);
    expect(titleFirst([triage, passwords], '  ')).toEqual([triage, passwords]);
  });
});

describe('a command ahead of the threads', () => {
  // On screen: "Sum up" put "Resume interrupted agents" first, and Enter ran it,
  // because "sum" is inside "resume" and "up" inside "interrupted".
  it('goes first only when the words start words of its name', () => {
    const resume = row('resume', 'Resume interrupted agents');
    const later = row('snooze', 'Later');
    const task = row('thread-x', 'Sum up this week\'s support emails');
    expect(paletteOrder([resume], [task], false, 'Sum up').rows.map((r) => r.id)).toEqual(['thread-x', 'resume']);
    expect(paletteOrder([resume, later], [task], false, 'resume').rows[0].id).toBe('resume');
    expect(namesIt('rem', 'Remote control')).toBe(true);
    expect(namesIt('sum up', 'Resume interrupted agents')).toBe(false);
  });

  it('a task in a conversation is found by its own title, not as "Conversation"', () => {
    const product = { slug: 'direct-1', name: 'Direct', team: { direct: true, people: ['maya'], sharedBy: 'dev' } };
    const task = { id: 'w-1', product: 'direct-1', title: 'Sum up this week\'s support emails', labels: ['founder', 'given-task'], status: 'open', assignee: 'maya', people: ['dev', 'maya'] };
    const people = [{ id: 'dev', name: 'Dev Rao' }, { id: 'maya', name: 'Maya Chen' }];
    expect(threadSearchDetails(task, { products: [product], people, me: 'maya' }).title).toBe('Sum up this week\'s support emails');
  });
});

describe('the pick stays on its row', () => {
  it('when the rows re-sort under it, the same thread stays picked', () => {
    expect(keptPick(passwords.id, [triage.id, quality.id, passwords.id])).toBe(2);
  });

  it('when its row is gone, the first row is picked, never a stale place', () => {
    expect(keptPick('gone', [triage.id, passwords.id])).toBe(0);
    expect(keptPick(null, [triage.id])).toBe(0);
    expect(keptPick('gone', [])).toBe(-1);
  });
});

describe('the pointer', () => {
  it('picks a row only when it really moved', () => {
    expect(pointerMoved(null, { x: 10, y: 10 })).toBe(true);
    expect(pointerMoved({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
    expect(pointerMoved({ x: 10, y: 10 }, { x: 11, y: 10 })).toBe(true);
  });
});

describe('the palette itself', () => {
  // It renders React, so it is read as text: these rules are what it picks by.
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/Palette.tsx'), 'utf8');
  it('picks by row and pointer movement, never by a row the pointer only rests on', () => {
    expect(src).not.toMatch(/onMouseEnter/);
    expect(src).toMatch(/keptPick\(pickedKey, keys\)/);
    expect(src).toMatch(/pointerMoved\(lastPointer\.current, at\)/);
    expect(src).toMatch(/titleFirst\(threadRows\(/);
  });
});

describe('the reply box says who it goes to', () => {
  it('a person by name, as a person', () => {
    expect(replyTarget({ people: ['Maya'] })).toEqual({ kind: 'person', words: 'Replying to Maya', names: ['Maya'] });
    expect(replyTarget({ people: ['Sofia', 'Maya'] })).toEqual({ kind: 'person', words: 'Replying to Sofia and Maya', names: ['Sofia', 'Maya'] });
  });

  it('an agent as the agent, never as a person', () => {
    expect(replyTarget({ people: null })).toEqual({ kind: 'agent', words: null, names: [] });
    expect(replyTarget({ people: [] }).kind).toBe('agent');
  });

  it('the box draws a person with their face, and nothing for an agent', () => {
    const focus = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/Focus.tsx'), 'utf8');
    expect(focus).toMatch(/dock-to-\$\{to\.kind\}/);
    expect(focus).toMatch(/to\.kind === 'person' && <div[^\n]*\n\s*\{to\.names\.slice\(0, 3\)\.map\(\(n\) => <Face/);
  });
});
