// A WAITING CHAT'S QUESTION SHOWS TO ITS END.
//
// On setup's "Pick up where you left off" (w-62228098e6), each chat waiting on
// you shows the question it ended on. The line was cut to one row with an
// ellipsis, so in a full window "…Shall I add the migration?" read "Shall I
// add t…" and "Should I also update the docs?" read "update the do…": the
// question, the one part that says what the chat wants, was the part cut.
// Seen in the power test's first pass over a copy with eight waiting chats.
//
// The question is already kept short where it is read (ASK_CHARS in
// shared/agent-import.mjs), so the line may wrap rather than be cut.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { howTheChatEnded } from '../shared/agent-import.mjs';

const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  expect(at, `no ${sel} rule`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe("a waiting chat's question", () => {
  it('wraps instead of being cut with an ellipsis', () => {
    const ask = rule('.ia-ask');
    expect(ask).not.toMatch(/nowrap|ellipsis/);
    // It sits inside the name, which keeps to one line, and would inherit that.
    expect(rule('.ia-line-row .ia-agent-name')).toMatch(/white-space: nowrap/);
    expect(ask).toMatch(/white-space: normal/);
  });

  it('is kept short enough to wrap onto two lines at most', () => {
    const long = howTheChatEnded(`${'I changed a great many things in the handler and its tests. '.repeat(4)}Can I run the migration on staging?`);
    expect(long.ask.length).toBeLessThanOrEqual(140);
    expect(long.ask.endsWith('Can I run the migration on staging?')).toBe(true);
  });
});
