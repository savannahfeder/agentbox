// "NOTHING IS RUNNING." WITH THE THREAD SITTING IN THE TAB BESIDE IT (F-142).
//
// A brand new user's first task finished and asked them a question, so it
// moved to Needs you. They looked at In progress, which said "Nothing is
// running." and nothing else, and read it as the task having gone. The
// sentence was true and it was the only thing on the page; the count on the
// tab next to it was the whole answer, and nobody looks there after reading a
// line that says there is nothing.
//
// Measured from shot 12 on the QA row: NEEDS YOU 1 beside an In progress tab
// holding one grey line. F-134 is the other half of this moment and is held by
// tests/the-progress-tab-says-a-task-is-starting-until-its-row-arrives.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { emptyTabWords } from '../renderer/src/threads/page-rules.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the In progress tab with nothing in it', () => {
  it('says only that nothing is running when nothing waits either', () => {
    expect(emptyTabWords('progress', false, 0)).toBe('Nothing is running.');
  });

  it('names Needs you when one thread is there', () => {
    expect(emptyTabWords('progress', false, 1)).toBe('Nothing is running. One thread waits in Needs you.');
  });

  it('counts them when several are', () => {
    expect(emptyTabWords('progress', false, 4)).toBe('Nothing is running. 4 threads wait in Needs you.');
  });

  // A task on its way is the newer news, and saying both would be the page
  // pointing two ways at once.
  it('still says the task is starting while one is on its way', () => {
    expect(emptyTabWords('progress', true, 2)).toBe('Starting your task…');
  });

  it('changes nothing on Later or Done, which are not about what is running', () => {
    expect(emptyTabWords('snoozed', false, 3)).toBe(emptyTabWords('snoozed', false, 0));
    expect(emptyTabWords('done', false, 3)).toBe(emptyTabWords('done', false, 0));
  });
});

describe('where the count comes from', () => {
  it('is the one the Needs you tab itself draws', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('<EmptyTab view={view} starting={!!landOn || justSent} waiting={needsYouCount.inbox} />');
  });

  it('reaches the words through the component', () => {
    const pages = read('renderer/src/threads/Pages.tsx');
    expect(pages).toContain('emptyTabWords(view, starting, waiting)');
  });
});
