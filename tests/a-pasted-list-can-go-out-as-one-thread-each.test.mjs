// A PASTED LIST IS OFFERED AS ONE THREAD PER ITEM, AND ITS TITLE LOSES THE DASH.
//
// Found by a tester on the Linux box, 2026-10-23 (F-26): paste a "- " list into
// the new thread card and send. One thread is made, nothing offers to split it,
// and the row is titled "- Fix the failing unittest in f_to_c (operator
// precedence bug)" with the dash still on it until an agent renames it.
//
// Two separate faults, so two rules. The title is derived by `splitMessage`,
// which took the first line as typed; a bullet is a mark about the shape of the
// text and never part of the name of anything. And the card can see that a
// message is a list of peers, so it says so and offers the other reading.
//
// The offer is DELIBERATELY NARROW. Every line has to carry a mark of its own,
// at the same indent: a paragraph above the bullets is context that belongs to
// all of them, and a nested list is not a list of peers, so splitting either
// would lose what the writer meant. One thread stays the default in every case.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listedTasks, splitMessage } from '../renderer/src/message-split.ts';
import { threadMessage } from '../renderer/src/threads/composer-rules.ts';
import { sendingLine, sentLine } from '../renderer/src/compose-says.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const PASTED = '- Fix the failing unittest in f_to_c (operator precedence bug)\n- Add a --version flag to the CLI';

describe('the title a bulleted message gets', () => {
  it('loses the dash the person pasted', () => {
    expect(splitMessage(PASTED).title).toBe('Fix the failing unittest in f_to_c (operator precedence bug)');
  });

  it('keeps every line of the message itself, marks and all', () => {
    expect(splitMessage(PASTED).body).toBe(PASTED);
  });

  it('loses a star, a bullet and a number the same way', () => {
    expect(splitMessage('* Ship the pricing page').title).toBe('Ship the pricing page');
    expect(splitMessage('• Ship the pricing page').title).toBe('Ship the pricing page');
    expect(splitMessage('1. Ship the pricing page').title).toBe('Ship the pricing page');
    expect(splitMessage('2) Ship the pricing page').title).toBe('Ship the pricing page');
  });

  it('leaves a dash that is part of what was written', () => {
    expect(splitMessage('-5 degrees is what the test expects').title).toBe('-5 degrees is what the test expects');
    expect(splitMessage('--version is missing from the CLI').title).toBe('--version is missing from the CLI');
    expect(splitMessage('Fix f_to_c - the precedence is wrong').title).toBe('Fix f_to_c - the precedence is wrong');
  });

  it('is the same title the card sends', () => {
    expect(threadMessage(PASTED, []).title).toBe('Fix the failing unittest in f_to_c (operator precedence bug)');
  });
});

describe('what the card offers to split', () => {
  it('reads a pasted list as one task per line, each without its mark', () => {
    expect(listedTasks(PASTED)).toEqual([
      'Fix the failing unittest in f_to_c (operator precedence bug)',
      'Add a --version flag to the CLI',
    ]);
  });

  it('reads a numbered list the same way, and ignores the blank lines between', () => {
    expect(listedTasks('1. First thing\n\n2. Second thing\n\n3. Third thing')).toHaveLength(3);
  });

  /* ------------------------- the cases that must not match ----------------- */

  it('offers nothing on one item, which is one thread already', () => {
    expect(listedTasks('- Just the one thing')).toEqual([]);
  });

  it('offers nothing on ordinary prose, however many lines it runs to', () => {
    expect(listedTasks('Fix the failing unittest.\nIt is a precedence bug.')).toEqual([]);
  });

  it('offers nothing when a line of prose sits over the list, because it is about all of them', () => {
    expect(listedTasks('Three things for the CLI:\n- the version flag\n- the quickstart\n- the failing test')).toEqual([]);
  });

  it('offers nothing on a nested list, whose lines are not peers', () => {
    expect(listedTasks('- Fix the CLI\n  - the version flag\n  - the quickstart')).toEqual([]);
  });

  it('offers nothing when an item carries more than its own line', () => {
    expect(listedTasks('- Fix the CLI\nand check the tests\n- Write the quickstart')).toEqual([]);
  });

  it('offers nothing on an empty draft', () => {
    expect(listedTasks('')).toEqual([]);
    expect(listedTasks('   \n  ')).toEqual([]);
    expect(listedTasks('-\n-')).toEqual([]);
  });
});

describe('the card, and what the send says afterwards', () => {
  const card = read('renderer/src/threads/ThreadComposer.tsx');
  const app = read('renderer/src/App.tsx');

  it('offers the other reading in one plain line, without changing Send', () => {
    // ONE LINE, NOT TWO. It read "This reads as 3 tasks. Send as 3 threads",
    // which called the same thing two names and spent a sentence saying what
    // the action says. The action is the whole offer.
    expect(card).toMatch(/Send as \{listed\.length\} separate threads/);
    expect(card).not.toMatch(/This reads as/);
    expect(card).toMatch(/sendTask\(\{ asList: true \}\)/);
    // Send itself still makes the one thread it has always made.
    expect(card).toMatch(/const send = \(\) => \(person && sendAs === 'message' \? sendMessage\(\) : sendTask\(\)\);/);
  });

  it('draws that offer as a word in the note, not as the browser\'s white slab', () => {
    // An unstyled <button> in a dark window reads as a broken app. The note
    // that offers a conversation to open had the same slab and now shares this.
    const css = read('renderer/src/threads/thread-composer.css');
    const rule = css.match(/\.tc-note button \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/background:\s*none/);
    expect(rule).toMatch(/border:\s*0/);
    expect(rule).toMatch(/text-decoration:\s*underline/);
  });

  it('stands the offer down wherever one thread is the only honest reading', () => {
    expect(card).toMatch(/const listed = person \|\| attachments\.length \|\| scripted \|\| named\.encode\(typed\.trim\(\)\) !== typed\.trim\(\)/);
  });

  it('gives each thread its own line and no copy of the others', () => {
    expect(card).toMatch(/for \(const part of parts\) rows\.push\(await api\.compose\(\{ \.\.\.fields, title: part \}\)\);/);
    expect(card).not.toMatch(/\{ \.\.\.fields, title: part, body/);
  });

  it('counts the threads in both halves of the sentence', () => {
    expect(sendingLine({ kind: 'task', to: 'Kestrel', threads: 3 })).toBe('Starting 3 threads in Kestrel…');
    expect(sentLine({ to: 'Kestrel', threads: 3 })).toBe('Started 3 threads in Kestrel · Z to undo');
    // One thread says nothing about counting, exactly as it always has.
    expect(sentLine({ to: 'Kestrel', threads: 1 })).toBe('Started in Kestrel · Z to undo');
    expect(sentLine({ to: 'Kestrel' })).toBe('Started in Kestrel · Z to undo');
  });

  it('takes every thread of a split back with one Z', () => {
    expect(app).toMatch(/const all = \[\{ product: made\.product, id: made\.id \}, \.\.\.\(how\?\.alsoMade \?\? \[\]\)\]/);
    expect(app).toMatch(/Withdrawn: \$\{all\.length\} threads/);
    expect(app).toMatch(/for \(const one of open\) await api\.answer\(/);
  });

  it('leaves a thread an agent has already answered, and says so when that is all of them', () => {
    // A Z that reaches none of them has to be refused, not reported: the single
    // send's rule (`TOO_LATE_TO_WITHDRAW`) over a list of them. The loop runs
    // over the ones still open, so the two cases are one line of code.
    expect(app).toMatch(/const open = all\.filter\(\(one\) => !answeredAlready\(rowOf\(one\)\)\);/);
    expect(app).toMatch(/if \(!open\.length\) return \{ refused: TOO_LATE_TO_WITHDRAW, open: rowOf\(all\[0\]\) \};/);
  });
});
