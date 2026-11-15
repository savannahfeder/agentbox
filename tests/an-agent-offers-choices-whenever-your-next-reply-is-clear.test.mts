// AN AGENT OFFERS CHOICES WHENEVER YOUR NEXT REPLY IS CLEAR (w-65bcefb857).
//
// Asked while designing the one-at-a-time page: "we should really encourage
// the agent to, in as many cases as possible, give options rather than leaving
// empty reply boxes. It's not a forced thing." And for designs: "We recommend
// arranging it all vertically, stacked with the bigger images ... We should
// give it some freedom (with suggestions)."
//
// Measured on that thread's real Needs you list: 8 of 23 open answers offered
// no choices, most of them steps for the person to take, so the page drew an
// empty reply box where one number would have done. Read in the shipped rule:
// it said to end with options only "if anything at all is left for them to
// decide", and nothing about the reply that follows steps.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flat = fs.readFileSync(path.join(root, 'briefs/message-rules.md'), 'utf8').replace(/\s+/g, ' ');

describe('the rule asks for choices wherever the next reply is clear', () => {
  it('says so as a rule of its own', () => {
    expect(flat).toMatch(/OFFER CHOICES WHENEVER THEIR NEXT REPLY IS CLEAR/);
  });
  it('covers the reply that follows steps they take', () => {
    expect(flat).toMatch(/offer the reply they would send once the steps are done/);
  });
  it('and still leaves a plain answer to a question without any', () => {
    expect(flat).toMatch(/a question answered ends with no options/);
    expect(flat).toMatch(/NEVER INVENT A PICK OUT OF WORK THEY DID NOT ASK FOR/);
  });
});

describe('designs to choose between are a suggestion, not a format', () => {
  it('suggests showing them stacked, each named by its choice', () => {
    expect(flat).toMatch(/stacked one under the next, in the order of your options/);
  });
  it('and leaves the arrangement to the agent', () => {
    expect(flat).toMatch(/The arrangement is yours/);
  });
});
