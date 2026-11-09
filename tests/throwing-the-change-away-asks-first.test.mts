// "DISCARD THE CHANGE" WENT STRAIGHT THROUGH ON ONE CLICK.
//
// F-84 on w-ba5540ff74, off the Linux QA box, Oct 26 2026. A thread was opened
// in Needs you and "2 Discard the change" clicked with the mouse: at 7:06:58
// the discard was sent with nothing asked, the view jumped to the next thread,
// and the unmoved pointer came to rest on that thread's "1 Ship it".
//
// Every other option in the strip sends words or closes a row, and Z takes
// both back. This one ends as `git checkout --` in a folder, and nothing
// brings that back. So it asks first, in the strip the other asks already use
// (../renderer/src/close-asks-first.ts), and the safe answer is the one under
// the pointer that just clicked.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discardsTheChange } from '../renderer/src/format.ts';
import { discardAsk } from '../renderer/src/discard-asks-first.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('which option throws the work away', () => {
  // The reported one, and the app's own wording for it (../ship-offer.ts).
  it('is the one the app and the agents both offer', () => {
    expect(discardsTheChange('Discard the change')).toBe(true);
    expect(discardsTheChange('Discard the change (recommended)')).toBe(true);
    expect(discardsTheChange('Discard it')).toBe(true);
    expect(discardsTheChange('Throw it away')).toBe(true);
    expect(discardsTheChange('Drop the changes')).toBe(true);
  });

  // Either side of it. Keeping work is not throwing it away, and an option
  // that discards one thing in order to do another is an instruction, not a
  // confirmation: asking about it would be the app second-guessing a sentence
  // it did not write.
  it('is not an option that keeps the work, or that goes on to do something', () => {
    expect(discardsTheChange('Keep the change for review')).toBe(false);
    expect(discardsTheChange('Keep the change for review (recommended)')).toBe(false);
    expect(discardsTheChange('Ship it')).toBe(false);
    expect(discardsTheChange('Commit it and ship')).toBe(false);
    expect(discardsTheChange('Close this task')).toBe(false);
    expect(discardsTheChange('Discard the first layout and ship the second')).toBe(false);
    expect(discardsTheChange('Change something first')).toBe(false);
  });
});

describe('what it asks', () => {
  const ask = discardAsk();

  it('asks the question, and keeping the work is the recommended answer', () => {
    expect(ask.ask).toBe('Discard the change?');
    expect(ask.options.map((o) => o.text)).toEqual(['Discard it', 'Keep it']);
    expect(ask.options.filter((o) => o.recommended).map((o) => o.n)).toEqual([2]);
  });

  // THE SAFE ANSWER STANDS WHERE THE PRESS THAT RAISED IT LANDED. The option
  // clicked was number 2, so a second click by habit, or a second press of the
  // same number, keeps the change rather than throwing it away twice over.
  it('puts keeping it on the number the discard was picked with', () => {
    expect(ask.options.find((o) => o.n === 2)?.act).toBe('keep');
    expect(ask.options.find((o) => o.n === 1)?.act).toBe('discard');
  });

  // A close question carries a third option because leaving the thread open
  // is an answer its first two do not cover. Here option 2 is that answer.
  it('carries no row saying what option 2 already says', () => {
    expect(ask.options).toHaveLength(2);
    expect(JSON.stringify(ask)).not.toContain('Keep the change');
  });
});

// A QUESTION THAT STANDS BETWEEN A PRESS AND A SEND CANNOT BE CHECKED BY
// RENDERING THE STRIP, so the wiring is read the way the other options tests
// read it.
describe('where it stands', () => {
  const app = read('renderer/src/App.tsx');

  it('stands in front of the send, not after it', () => {
    expect(app).toContain('if (!confirmed && discardsTheChange(option.text)) {');
    // Before the reply is queued and before the pane moves on.
    const asked = app.indexOf('if (!confirmed && discardsTheChange(option.text)) {');
    const sent = app.indexOf('const answer = `Option ${option.n}: ${option.text}`;');
    expect(asked).toBeGreaterThan(0);
    expect(asked).toBeLessThan(sent);
  });

  it('uses the strip the other asks already use', () => {
    expect(app).toContain("closeAskWhy === 'discard' ? discardAsk()");
    expect(app).toContain("if (option.act === 'keep' || option.act === 'decide') return;");
    expect(app).toContain("if (option.act === 'discard') {");
  });

  it('sends the option it was raised for, once, and only when confirmed', () => {
    expect(app).toContain('if (pick) await pickRef.current?.(item, pick.n, { confirmed: true });');
  });

  it('names no filed task, which only a close about filed tasks does', () => {
    expect(app).toContain("const named = closeAskWhy === 'filed' ?");
  });
});
