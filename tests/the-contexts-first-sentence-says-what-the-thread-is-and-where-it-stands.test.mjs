// THE CONTEXT'S FIRST SENTENCE SAYS WHAT THE THREAD IS AND WHERE IT STANDS (w-6bcb0f93ab).
//
// "This requires so much cognitive effort, i've had to read to the end
// (annoying), and i've done so several times without getting it." The Context
// read: "Enable cloud workers to publish the approved dismiss button. Earlier
// work recorded repository access and code on main, with deployment awaiting
// restricted Cloudflare access. The latest startup failed because the task
// branch was already assigned to another folder; this run now has its own
// checkout." The rule said "Open with what the thread is for, then where it
// stands overall", and agents read that as a story in time order: a goal in
// the system's words, then the history, so where it stands came last and
// was buried under plumbing (branches, folders, checkouts).
//
// Measured by handing ten real Contexts and the new rule, and nothing else,
// to a separate agent: every rewrite put the state in its first sentence.
// Now the rule asks for a first sentence that carries the thread alone, says
// where things stand rather than how they got there, and leaves out the
// machinery unless it is what is stuck.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const raw = read('briefs/worker.md');
const brief = raw.replace(/\s+/g, ' ');
const tools = read('mcp/tools.mjs');
const catchUp = read('main/catch-up.mts');
const defaults = JSON.parse(read('shared/instruction-defaults.json'));

describe('the worker brief', () => {
  it('puts what the thread is for and where it stands in the first sentence', () => {
    expect(brief).toContain('MOST PEOPLE READ ONLY ITS FIRST SENTENCE, SO THAT SENTENCE CARRIES THE THREAD ALONE: what it is for and where it stands now');
  });
  it('shows a first sentence that does, naming the thing a person sees', () => {
    expect(brief).toContain('"The dismiss button is on main but can\'t go live until it has Cloudflare access."');
  });
  it('in plain sentences, not two thoughts joined by a colon', () => {
    expect(brief).toContain('no colon or dash joining two of them');
  });
  it('asks for where things stand, not the story of how they got there', () => {
    expect(brief).toContain('Say where things stand, never the story of how they got there');
  });
  it('keeps the machinery out unless it is what is stuck', () => {
    expect(brief).toContain('Leave out the machinery (runs, branches, folders, checkouts) unless it is what is stuck');
  });
  it('no longer orders it goal first and state after', () => {
    expect(brief).not.toContain('Open with what the thread is for, then where it stands overall');
  });
  it('and the app\'s copy of the brief is the same', () => {
    expect(defaults.system).toBe(raw);
  });
});

describe('the other places a Context is written', () => {
  it('the store tool says the first sentence carries it', () => {
    expect(tools).toMatch(/the summary's CONTEXT[^`]*The first sentence alone says what the thread is for and where it stands now/);
    expect(tools).toMatch(/the summary's CONTEXT[^`]*not the story of how they got there/);
  });
  it('an imported chat\'s write-up asks the same', () => {
    expect(catchUp).toMatch(/"context": "[^"]*the first sentence alone says both[^"]*not the story of how they got there/);
  });
});
