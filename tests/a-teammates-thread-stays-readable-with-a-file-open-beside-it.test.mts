// A TEAMMATE'S THREAD STAYS READABLE WITH A FILE OPEN BESIDE IT.
//
// Found by the team test on w-1fc102959f (2026-11-09) and photographed in two
// copies: Maya opened Theo's prototype page from his thread, the page took the
// right half of the window, and the thread squeezed into the rest with its
// two columns kept. Theo's message wrapped one letter per line, the About card
// lay over the conversation and the buttons broke across lines; a tester read
// it as the page not opening at all. The page's narrow layout was keyed to the
// window (@media max-width 1100px), and opening a file narrows the page, not
// the window.
//
// 2026-11-21 (w-8a8eac7620): the page is drawn in the thread page's own
// column, which measures itself (narrow-conversation.css); there is no second
// column, since About became the summary at the top, and the corner is
// Message and the ⋯ menu, with no long words left to break.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('renderer/src/threads/pages.css');
const page = read('renderer/src/threads/TeammateThread.tsx');

describe("a teammate's thread page", () => {
  it('measures its own width, as the thread page it is drawn in does', () => {
    expect(page).toContain('<div className="focus-pane tp-thread">');
    expect(read('renderer/src/narrow-conversation.css')).toMatch(/\.focus-pane \{ container: talk \/ inline-size; \}/);
  });

  it('keeps one column, with nothing beside it to squeeze', () => {
    expect(page).not.toMatch(/<aside/);
  });

  it('keeps only Message and the ⋯ menu in its corner', () => {
    expect(page).toMatch(/<span className="ts-top tp-acts">\s*<MessagePerson person=\{person\} onMessage=\{onMessage\} \/>\s*<ThreadMenu /);
  });

  it('keys none of its layout to the window', () => {
    for (const m of css.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)) expect(m[1]).not.toMatch(/\.tp-(grid|side|bar|acts|summary)\b/);
  });
});
