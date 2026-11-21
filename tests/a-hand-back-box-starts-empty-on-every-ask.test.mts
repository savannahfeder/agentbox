// A HAND-BACK BOX STARTS EMPTY ON EVERY ASK (w-f702d60afe, round six, 2026-11-20).
//
// Two testers sent hand-backs with words they had not typed for that ask: "The
// sent message included an earlier sentence immediately followed by the new
// text with no space", and "Two similar hand-back sentences are joined without
// a space". The box keeps what you typed in the component's state, and moving
// from one ask to the next drew the same component again with the old words in
// it, out of sight until the box opened. Each ask now draws its own box.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the hand-back box', () => {
  it('is drawn anew for each ask, on the task page and on the thread', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/<AskBar key=\{`\$\{focused\.product\}\/\$\{focused\.id\}`\} task=\{focused\}/);
    expect(read('renderer/src/threads/TeammateThread.tsx')).toMatch(/<AskBar key=\{`\$\{ask\.product\}\/\$\{ask\.id\}`\} task=\{ask\}/);
  });
});

// Round seven: under a help ask on the task page there was only Hand back, so
// the way to the owner's agent was a link in the words, and the helper wrote in
// the task's own reply box instead. The first button opens the owner's thread.
describe('the buttons under an ask on the task page', () => {
  it('open the owner\'s thread first', () => {
    const bar = read('renderer/src/team/AskBar.tsx');
    expect(bar).toMatch(/\{onOpenThread && <button type="button" onClick=\{onOpenThread\}>Open \{first\}'s thread<\/button>\}/);
    expect(read('renderer/src/App.tsx')).toMatch(/<AskBar key=\{`\$\{focused\.product\}\/\$\{focused\.id\}`\} task=\{focused\}[^\n]*under onOpenThread=\{\(\) => openContinuedFrom\(focused\.ask!\.owner, focused\.ask!\.thread\)\}/);
  });
});
