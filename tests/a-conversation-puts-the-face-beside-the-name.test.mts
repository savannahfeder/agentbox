// A CONVERSATION PUTS THE FACE BESIDE THE NAME (w-f702d60afe, 2026-11-20).
//
// The founder, on Theo's review task with the change open beside it: "this is
// doing some really weird indenting with the profile picture ... Why is all the
// text just indented, taking up very little space?" A message between people
// kept a 28px face column and a 14px gap down its whole height: in a 328px pane
// the words got 286px of it. That was fixed under 560px only, and on a task
// handed over at full width she said the same again: "all of the text below
// the profile picture is indented and it looks really funky."
//
// The face now sits on the name's line at every width, as an agent's does in a
// thread, and the words, files and timeline start at the column's edge.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/team/chat.css', import.meta.url), 'utf8');
const thread = fs.readFileSync(new URL('../renderer/src/components/Thread.tsx', import.meta.url), 'utf8');

describe('a message between people', () => {
  it('puts the face on the name\'s line only', () => {
    expect(css).toMatch(/^\.chat-gutter \{ grid-column: 1; grid-row: 1; align-self: center; \}/m);
    expect(css).toMatch(/^\.chat-msg \{ display: grid; grid-template-columns: 22px minmax\(0, 1fr\); column-gap: 10px; \}/m);
  });
  it('gives everything under the name the whole width', () => {
    expect(css).toMatch(/^\.chat-msg > :not\(\.chat-gutter, \.msg-head\) \{ grid-column: 1 \/ -1;/m);
  });
  it('is the same at every width, with no narrow rule of its own', () => {
    expect(css).not.toContain('@container (max-width: 560px)');
  });
  it('draws no face beside a message that carries on a run', () => {
    expect(thread).toMatch(/\{slot\.head && <div className="chat-gutter">/);
    expect(css).toMatch(/\.chat-msg\.cont \.chat-gutter \{ display: none; \}/);
  });
});
