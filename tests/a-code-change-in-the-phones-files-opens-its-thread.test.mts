// A CODE CHANGE IN THE PHONE'S FILES OPENS ITS THREAD.
//
// Phone workday 2026-11-23: "Tapping the FizzBuzz change in Files does nothing",
// logged 48 times by two testers. Reproduced on the preview: Files > All lists
// the-change-it-made.change, and a tap handed its raw file to the browser
// (openingOf answers `elsewhere` for a `.change`), which on a phone is a page
// of JSON and on the preview a tab nobody sees. The change is read in its
// thread, whose change card opens each file; holding the row already offered
// "Open the thread it came from".
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { threadOfChange, type PhoneFile } from '../mobile/src/lib/files-place';

const thread = (id: string, at: number) => ({ product: 'app@aaaaaaaaaaaa', id, title: `Thread ${id}`, at });
const file = (path: string, threads = [thread('w-2', 5), thread('w-1', 1)]) => ({ path, threads }) as Pick<PhoneFile, 'path' | 'threads'>;

describe('a press on a file in Files', () => {
  it("opens a run's change in the newest thread that sent it", () => {
    expect(threadOfChange(file('runs/w-2/the-change-it-made.change'))).toMatchObject({ id: 'w-2' });
  });
  it('knows a change by its ending, whatever its case or a query after it', () => {
    expect(threadOfChange(file('runs/w-2/The-Change-It-Made.CHANGE?v=2'))).toMatchObject({ id: 'w-2' });
  });
  it('leaves every other file to open as it did', () => {
    expect(threadOfChange(file('src/fizz.js'))).toBeNull();
    expect(threadOfChange(file('designs/inbox.png'))).toBeNull();
    expect(threadOfChange(file('notes/change.md'))).toBeNull();
    expect(threadOfChange(file('runs/w-2/the-change-it-made.change.json'))).toBeNull();
  });
  it('has nothing to open for a change no thread names', () => {
    expect(threadOfChange(file('runs/w-2/the-change-it-made.change', []))).toBeNull();
  });
  it('is what Files asks before it opens anything', () => {
    const src = fs.readFileSync(new URL('../mobile/src/ui/FilesPlace.tsx', import.meta.url), 'utf8');
    const open = src.slice(src.indexOf('const open = (f: PhoneFile)'));
    expect(open.indexOf('threadOfChange(f)')).toBeGreaterThan(-1);
    expect(open.indexOf('threadOfChange(f)')).toBeLessThan(open.indexOf('openingOf('));
  });
});
