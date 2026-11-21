// A TEAMMATE'S THREAD SHOWS ITS FILES WITHOUT OPENING ABOUT (w-f702d60afe, round six, 2026-11-20).
//
// The founder asked for the About card beside a teammate's thread to go (it
// made the page unlike an opened thread), so it opens only on pressing About.
// The PM tester then reviewed Priya's thread and could not reach the document
// it made: "its name is plain text and there is no file control on this
// screen." The files were only on that card. 2026-11-21 (w-8a8eac7620): About
// became the summary at the top of the page, always there, and the files are
// in it, one button each.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = read('renderer/src/threads/TeammateThread.tsx');
const summary = read('renderer/src/threads/Summary.tsx');
const css = read('renderer/src/threads/pages.css');

describe("a teammate's thread page", () => {
  it('lists its files in the summary at its top, each opening the file', () => {
    expect(page).toContain('<TeammateSummary card={card} owner={owner} files={files} />');
    expect(summary).toMatch(/\{files\.length > 0 && <div className="ts-tk-part">[\s\S]{0,60}<ul className="tp-files" aria-label="Files on this thread">/);
    expect(summary).toMatch(/<button type="button" onClick=\{f\.open\} title=\{`Open \$\{f\.name\}`\}>/);
  });
  it('lays them out as a wrapping row of rounded buttons', () => {
    expect(css).toMatch(/\.tp-files \{[^}]*display: flex; flex-wrap: wrap;/);
    expect(css).toMatch(/\.tp-files button \{[^}]*border-radius: var\(--radius\)/);
  });
});
