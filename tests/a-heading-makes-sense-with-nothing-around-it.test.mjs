// A HEADING THAT ONLY MAKES SENSE AFTER READING THE SECTION UNDER IT.
//
// w-32efa85cd6, 2026-10-23. The guide pages were rewritten and came back with
// "Five surfaces, four of them graphical" over the section explaining what a
// surface is. She read the page cold and said it "is incoherent if reading on
// my own, it's weirdly phrased and means nothing".
//
// It was not one bad heading. Reading all 118 of them as a list, with no body
// text, three shapes failed:
//
//   - a word the page invents and defines below it: "Five surfaces, four of
//     them graphical", "The four shapes the third-party ones come in";
//   - a pronoun with no referent above it: "The CLI answers it too", "Where
//     Anthropic's own answer stops", "Six of the twenty-one are not what a
//     roundup implies";
//   - a heading that names things its own section does not: "Emdash and
//     Nimbalyst for the board" sat over a paragraph naming Agentbox,
//     claudecodeui and Orca.
//
// The design-taste list already carried "every header stands on its own" from
// ten earlier threads, so this is a repeat, which is what makes it worth a
// test rather than another note.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const body = fs
  .readFileSync(path.join(root, '.claude', 'skills', 'unslop', 'SKILL.md'), 'utf8')
  .replace(/^---\n[\s\S]*?\n---\n/, '')
  .toLowerCase();

describe('the skill asks a heading to stand on its own', () => {
  it('states the test, which is reading it with nothing around it', () => {
    expect(body).toMatch(/stands? on its own|with nothing around it|on its own, with no/);
  });

  it('keeps the heading she caught, so the rule has an example', () => {
    expect(body).toMatch(/five surfaces/);
  });
});

describe('it names the three shapes that fail', () => {
  it('a word the page invents and only defines underneath', () => {
    expect(body).toMatch(/invent|defines it below|coined/);
  });

  it('a pronoun with nothing above it to point at', () => {
    expect(body).toMatch(/no referent|nothing to point at|pronoun/);
  });

  it('a heading naming things its own section does not', () => {
    expect(body).toMatch(/nam(e|es|ing) things its own section does not/);
  });
});

describe('it says what to do instead', () => {
  it('asks for the concrete words a stranger already knows', () => {
    expect(body).toMatch(/stranger|newcomer|somebody who has read nothing/);
  });

  it('warns that a longer heading beats a clever one', () => {
    expect(body).toMatch(/longer.{0,40}clever|clever.{0,40}longer|plainer and longer/);
  });
});
