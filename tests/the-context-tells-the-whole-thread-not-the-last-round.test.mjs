// THE CONTEXT TELLS THE WHOLE THREAD, NOT THE LAST ROUND (w-65bcefb857).
//
// "previously the premise of our summary card... was that it gave context on
// the entire thread. It identified what this thread was doing but now this one
// doesn't really functionally do that. It sort of gives context on the last
// round." The thread's Context read "Approved and labelled to ship: the
// \"Context\" word removed and the spacing around it evened out (17, 13 and
// 27px)", which names neither the page nor what the thread is building.
//
// Read on 13 open threads: four Contexts held only the last round (this one,
// "You saw no indent under the Chats list's folding headers", "You picked
// round 3 option 4 for the empty inbox", "The work is built, green and
// labelled to ship"). The rule agents follow changed on 2026-10-05 (3b8db5df)
// from "Problem is what this thread is for" to "what was asked, what was found
// and the facts needed to decide", and an agent that rewrites the summary on
// every note writes what it just found. Now the rule says what the Context is
// for, first, and that the round's news belongs to the answer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const raw = read('briefs/worker.md');
// The brief is wrapped; its sentences are read as one line.
const brief = raw.replace(/\s+/g, ' ');
const tools = read('mcp/tools.mjs');
const defaults = JSON.parse(read('shared/instruction-defaults.json'));

describe('the worker brief', () => {
  it('says the Context is about the whole thread, and opens with what it is for', () => {
    expect(brief).toMatch(/`problem` is shown as CONTEXT[^.]*: the whole thread, for someone who has forgotten it\./);
    expect(brief).toContain('Open with what the thread is for, then where it stands overall');
  });
  it('and that the latest round is the answer\'s, not the Context\'s', () => {
    expect(brief).toContain("never only this round's news, which your answer already gives");
  });
  it('no longer asks for what was found, which is what pulled it to the last round', () => {
    expect(brief).not.toContain('what was asked, what was found and the facts needed to decide');
  });
  it('and the app\'s copy of the brief is the same', () => {
    expect(defaults.system).toBe(raw);
  });
});

describe('the store tool\'s own words', () => {
  it('say the same', () => {
    expect(tools).toMatch(/the summary's CONTEXT[^`]*the whole thread for someone who has forgotten it: what the thread is for, then where it stands overall\. Never only the latest round/);
    expect(tools).not.toContain('what was asked, what was found, the facts needed to decide');
  });
});
