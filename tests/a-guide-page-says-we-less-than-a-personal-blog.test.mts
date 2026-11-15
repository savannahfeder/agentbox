// THE VOICE RULE TOLD AGENTS TO RAISE FIRST PERSON, AND THE PAGES CAME BACK
// READING LIKE SMEAGOL.
//
// w-32efa85cd6, 2026-10-22. The round before this one measured eight pieces by
// Julia Evans, Simon Willison and Dan Luu, found first person at 44.9 per
// 1,000 words against 1.3 in the guide pages, and told the next agent to put a
// person in it. Six pages came back at about 17 and she read them as "you
// overly use the word we. It feels like Smiegel is almost talking".
//
// The measurement was right and the conclusion drawn from it was wrong,
// because it counted first person as one thing. Splitting the same eight
// pieces by pronoun:
//
//           | references | guide pages
//   I/me/my |       22.8 |         0.0
//   we/our  |       15.1 |        14.5
//
// Their "we" is the reader and the writer walking through something together
// ("let's say we want to write a file safely"). The pages' "we" was a company
// reporting its own research activity: 87 of 134 were "we" followed by found,
// read, checked, counted, timed or went through. A company page has no "I"
// available, so copying a personal blog's first-person number leaves only the
// corporate plural, which is the one that grates.
//
// This pins the split, so the next agent cannot read 44.9 and chase it with
// "we" again, and pins the rule that replaced it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const body = fs
  .readFileSync(path.join(root, '.claude', 'skills', 'unslop', 'SKILL.md'), 'utf8')
  .replace(/^---\n[\s\S]*?\n---\n/, '')
  .toLowerCase();

describe('the first-person figure is split by pronoun', () => {
  it('keeps the 44.9 that started it, so the correction has something to correct', () => {
    expect(body).toMatch(/44\.9/);
  });

  it('carries the singular and plural halves separately', () => {
    expect(body).toMatch(/22\.8/);
    expect(body).toMatch(/15\.1/);
  });

  it('says a company page has no "I" to use', () => {
    expect(body).toMatch(/no "i"|has no i\b|no first-person singular/);
  });
});

describe('a fact is stated rather than reported', () => {
  it('names the shape, "we" plus a verb of having looked', () => {
    expect(body).toMatch(/we found|we read|we checked|having looked/);
  });

  it('sends the sourcing to the as-of line or the method section instead', () => {
    expect(body).toMatch(/as-of|method section|method paragraph/);
  });

  it('turns "we" meaning the product into the product name', () => {
    expect(body).toMatch(/where we lose|product's name|name of the product/);
  });
});

describe('the rule cannot be used to soften an admission', () => {
  it('warns that a concession keeps its force without the pronoun', () => {
    expect(body).toMatch(/concession|admission/);
  });
});

describe('"you" is for a reader being asked or instructed', () => {
  it('keeps it legal in an FAQ question and a how-to step', () => {
    expect(body).toMatch(/faq question|how-to step/);
  });

  it('says to name the subject everywhere else', () => {
    expect(body).toMatch(/name the subject/);
    expect(body).toMatch(/an existing claude code/);
  });
});
