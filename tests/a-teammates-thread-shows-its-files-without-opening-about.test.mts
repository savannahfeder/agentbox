// A TEAMMATE'S THREAD SHOWS ITS FILES WITHOUT OPENING ABOUT (w-f702d60afe, round six, 2026-11-20).
//
// The founder asked for the About card beside a teammate's thread to go (it
// made the page unlike an opened thread), so it opens only on pressing About.
// The PM tester then reviewed Priya's thread and could not reach the document
// it made: "its name is plain text and there is no file control on this
// screen." The files were only on that card. They are under the thread's name
// now, one button each, and About keeps the rest.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');

describe("a teammate's thread page", () => {
  it('lists its files under its name, each opening the file', () => {
    expect(page).toMatch(/\{files\.length > 0 && <ul className="tp-files" aria-label="Files on this thread">/);
    expect(page).toMatch(/<button type="button" onClick=\{f\.open\} title=\{`Open \$\{f\.name\}`\}>/);
  });
  it('lays them out as a wrapping row of rounded buttons', () => {
    expect(css).toMatch(/\.tp-files \{[^}]*display: flex; flex-wrap: wrap;/);
    expect(css).toMatch(/\.tp-files button \{[^}]*border-radius: var\(--radius\)/);
  });
});
