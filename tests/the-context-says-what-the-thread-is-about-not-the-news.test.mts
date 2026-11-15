// THE CONTEXT SAYS WHAT THE THREAD IS ABOUT, NOT THE NEWS (w-6bcb0f93ab).
//
// A Context read: "Enable cloud workers to publish the approved dismiss
// button. Earlier work recorded repository access and code on main, with
// deployment awaiting restricted Cloudflare access. The latest startup failed
// because the task branch was already assigned to another folder; this run
// now has its own checkout." The person read it to the end several times
// without getting it. A first fix put where things stand in the first
// sentence, and was turned down: "i read summary because i can't remember
// what the thread was about ... the recent stuff is given to me typically in
// the message itself." So the Context now says what was asked for and why,
// in the person's words, and leaves where it stands to the answer.
//
// Measured by handing ten real threads (the person's opening message and the
// old Context) and the new rule, and nothing else, to a separate agent; the
// before and after are in this thread's designs folder.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const raw = read('briefs/worker.md');
const brief = raw.replace(/\s+/g, ' ');
const tools = read('mcp/tools.mts');
const catchUp = read('main/catch-up.mts');
const defaults = JSON.parse(read('shared/instruction-defaults.json'));

describe('the worker brief', () => {
  it('says the Context is what the thread is about, not the news', () => {
    expect(brief).toContain('PEOPLE OPEN IT WHEN THEY CANNOT REMEMBER WHAT THE THREAD IS ABOUT, SO IT SAYS THAT AND NOT THE NEWS.');
  });
  it('opens with what was asked for and why, in their words', () => {
    expect(brief).toContain('Open with what was asked for and why, named the way they would name it');
    expect(brief).toContain('"You wanted cloud agents to put approved work live on their own, starting with the dismiss button."');
  });
  it('leaves where it stands to the answer', () => {
    expect(brief).toContain("Where it stands, the latest round and what comes next are your answer's, never the Context's.");
  });
  it('no longer asks for where it stands in the first sentence', () => {
    expect(brief).not.toContain('what it is for and where it stands now');
    expect(brief).not.toContain('Say where things stand');
  });
  it('keeps out the machinery and the story of each attempt, in plain sentences', () => {
    expect(brief).toContain('Leave out the machinery (runs, branches, folders, checkouts) and the story of each attempt.');
    expect(brief).toContain('no colon or dash joining two of them');
  });
  it('and stays put until what the thread is about changes', () => {
    expect(brief).toContain('It changes only when what the thread is about changes.');
  });
  it('and the app\'s copy of the brief is the same', () => {
    expect(defaults.system).toBe(raw);
  });
});

describe('the other places a Context is written', () => {
  it('the store tool asks for what was asked and why, not where it stands', () => {
    expect(tools).toMatch(/the summary's CONTEXT[^`]*what was asked for and why, in the words the person would use\. Not where it stands or the latest round, which the answer gives/);
  });
  it('an imported chat\'s write-up asks the same, and puts where it stands in what the agent said', () => {
    expect(catchUp).toMatch(/"context": "[^"]*what the person asked for and why, in their words[^"]*where it stands goes in said, not here/);
  });
});
