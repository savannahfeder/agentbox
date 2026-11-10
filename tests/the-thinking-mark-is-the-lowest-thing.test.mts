// THE COMMANDS ARE IN ONE PLACE, NOT TWO.
//
// Two rules in those two sentences, and both are tested here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { withoutTrailingWork } from '../renderer/src/trailing-work.ts';

const msg = (text) => ({ kind: 'said', who: 'them', text, at: 1 });
const work = (subject) => ({ kind: 'work', verb: 'ran', subject, at: 1 });

describe('the work the thinking mark is already speaking for', () => {
  it('takes the run of commands at the very bottom', () => {
    expect(withoutTrailingWork([msg('on it'), work('npm test'), work('git status')]))
      .toEqual([msg('on it')]);
  });

  it('leaves behind the steps that have text after them', () => {
    // Her own sentence: "If there's text in between, it can leave behind those
    // steps." The agent ran something, then said something, and the mark has
    // moved on from what it ran.
    const events = [work('npm test'), msg('tests pass'), work('git commit')];
    expect(withoutTrailingWork(events)).toEqual([work('npm test'), msg('tests pass')]);
  });

  it('is the identity when the last thing said was words', () => {
    const events = [work('npm test'), msg('tests pass')];
    expect(withoutTrailingWork(events)).toBe(events);
  });

  it('is the identity on a conversation with no work in it at all', () => {
    const events = [msg('hello'), msg('hello back')];
    expect(withoutTrailingWork(events)).toBe(events);
  });

  it('can empty the list, and says so rather than keeping one back', () => {
    // A run that has said nothing yet is all work and no words. Nothing is kept
    // for the thread, because the mark under it is drawing every one of them.
    expect(withoutTrailingWork([work('npm test'), work('git status')])).toEqual([]);
  });

  it('holds on an empty list', () => {
    expect(withoutTrailingWork([])).toEqual([]);
  });
});

describe('where the rule is applied', () => {
  const thread = fs.readFileSync(
    new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');

  it('only while a session is up', () => {
    // ONCE THE RUN ENDS THEY COME BACK. There is no mark to stand in for them
    // then, and they are the record of what the run did. A version of this that
    // hid them unconditionally would be deleting history off her screen.
    expect(thread).toContain('const shown = session ? withoutTrailingWork(said) : said;');
  });

  it('does not turn a live thread into "nothing has been said here yet"', () => {
    // The emptiness check reads the UNTRIMMED list. Without that, a run in its
    // first seconds -- all commands, no words -- would draw the line that means
    // an empty row, over a task with an agent working on it.
    expect(thread).toContain('if (!said.length && !opening && !outcome)');
  });
});
