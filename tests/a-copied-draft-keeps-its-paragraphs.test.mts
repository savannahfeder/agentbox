// (hers, 2026-08-30, three screenshots.)
//
// WHAT IS ACTUALLY WRONG, and it is in her store rather than in the pane. The
// block she copied is the email draft on: the last patch of 2026-08-29 carries
// a fenced block whose prose lines run 75 to 82 characters and then stop. Those
// newlines are real characters, so the copy button hands them over faithfully
// and the mail client draws every one of them. Her third screenshot proves it
// from the other end: she has joined the first paragraph by hand and it reflows
// with the window, while the paragraphs below it break at exactly the same
// words as the block she copied from. A soft wrap would move.
//
// It is not one bad message. Across her five product ledgers on 2026-08-30 there
// were 70 fenced blocks and 12 were prose hard wrapped this way, so the fix is
// on the way OUT: it repairs the drafts already sitting in her store as well as
// the next one a worker writes.
//
// THE COST OF GETTING IT WRONG IS HIGHER THAN THE BUG. 58 of those 70 blocks are
// real commands and tables, and this feature exists to hand her commands to
// paste (2026-08-05). So the fixture below is a real command, a real log table
// and a real draft side by side, and the command and the table have to come
// through byte for byte.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWrappedProse, unwrapWrappedProse } from '../renderer/src/unwrap-lines.ts';
import { Name } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Her draft, exactly as it is stored on (patch of 2026-08-29 20:12),
// trimmed to the part her first screenshot shows.
const DRAFT = [
  'Hey Austin,',
  '',
  "That makes sense, thanks for spelling it out! Here's everything in writing so",
  "I'm not the thing holding up your approval.",
  '',
  `${Name} is software for solo founders growing a product without a marketing team.`,
  "It's an inbox for all of your agents: they work in the background, and anything",
  'that needs your call arrives like an email you answer. What they mostly do right',
  "now is the marketing, specifically building in public. They watch what you're",
  'actually shipping, write the posts about it, find where your first users are, run',
  'the outreach, and come back with what to try next.',
  '',
  'So, your questions:',
].join('\n');

// From, which is the thing that must not break.
const COMMAND = [
  'git checkout refs/heads/main',
  'npm install --no-audit --no-fund   # only if it complains',
  'npm run build',
].join('\n');

// From Cascade. Wide, wordy, unindented sentences by every measure except the
// one that counts: the newlines are the rows of a table.
const LOG = [
  '13:06  create_your_workspace  do I need admin access on the Google Analytics property',
  '13:05  create_your_workspace  do I need admin on the Shopify store',
].join('\n');

describe('a draft she copies out', () => {
  it('arrives as the paragraphs she can see, not the lines a worker typed', () => {
    const out = unwrapWrappedProse(DRAFT);
    expect(out).toBe([
      'Hey Austin,',
      '',
      "That makes sense, thanks for spelling it out! Here's everything in writing so I'm not the thing holding up your approval.",
      '',
      `${Name} is software for solo founders growing a product without a marketing team. It's an inbox for all of your agents: they work in the background, and anything that needs your call arrives like an email you answer. What they mostly do right now is the marketing, specifically building in public. They watch what you're actually shipping, write the posts about it, find where your first users are, run the outreach, and come back with what to try next.`,
      '',
      'So, your questions:',
    ].join('\n'));
  });

  it('keeps every blank line, so the paragraphs stay where they were', () => {
    const out = unwrapWrappedProse(DRAFT);
    expect(out.split('\n').filter((l) => l === '').length).toBe(3);
  });

  // The two lines that stop well short of the width stopped because she meant
  // them to. This is the whole reason the test is "nearly as long as the longest
  // line" rather than "ends without a full stop".
  it('leaves a short line that was meant to be short', () => {
    const out = unwrapWrappedProse(DRAFT).split('\n');
    expect(out[0]).toBe('Hey Austin,');
    expect(out[out.length - 1]).toBe('So, your questions:');
  });

  it('loses not one word', () => {
    const words = (s) => s.split(/\s+/).filter(Boolean);
    expect(words(unwrapWrappedProse(DRAFT))).toEqual(words(DRAFT));
  });
});

describe('anything that might be a command', () => {
  it('comes through byte for byte', () => {
    expect(unwrapWrappedProse(COMMAND)).toBe(COMMAND);
    expect(isWrappedProse(COMMAND)).toBe(false);
  });

  it('still comes through byte for byte when it is a table of sentences', () => {
    expect(unwrapWrappedProse(LOG)).toBe(LOG);
    expect(isWrappedProse(LOG)).toBe(false);
  });

  it('is refused when it is indented, whatever else it looks like', () => {
    const indented = [
      '    Akaki Darbuashvili is a full-stack developer working in Node and React',
      '    Marin Begic is an automation engineer and has been with us all of 2025',
    ].join('\n');
    expect(unwrapWrappedProse(indented)).toBe(indented);
  });

  it('is refused when there is nothing to unwrap', () => {
    const one = 'A single line that nobody wrapped, however long it happens to run on for.';
    expect(unwrapWrappedProse(one)).toBe(one);
    expect(unwrapWrappedProse('')).toBe('');
  });
});

// Her letter to the accountant: 51 lines of wrapped prose with an indented cost
// table and an indented numbered list sitting inside it. It is the case that
// says the indentation test has to be per line and not per block, because
// refusing the whole letter over its table was the first thing this did.
describe('a letter with a table inside it', () => {
  const LETTER = [
    'Hi Alisha,',
    '',
    'Our 2025 engineering spend went into a SaaS agent product that we have',
    'since discontinued, and I had assumed that would change the treatment.',
    '',
    '  Foreign engineering time, calendar 2025           $145,699.00',
    '',
    'Thanks,',
    'the founder',
  ].join('\n');

  it('unwraps the prose and leaves the table exactly as drawn', () => {
    const out = unwrapWrappedProse(LETTER).split('\n');
    expect(out).toContain('  Foreign engineering time, calendar 2025           $145,699.00');
    expect(out).toContain('Our 2025 engineering spend went into a SaaS agent product that we have since discontinued, and I had assumed that would change the treatment.');
  });

  it('does not fold her sign-off into the line above it', () => {
    const out = unwrapWrappedProse(LETTER).split('\n');
    expect(out[out.length - 2]).toBe('Thanks,');
    expect(out[out.length - 1]).toBe('the founder');
  });
});

// The suite has no DOM, so these hold the WIRING: a rule nothing calls repairs
// nothing, and there are two ways a block leaves the pane. She used the button
// in her screenshot, but a drag is the other one and it has to agree.
describe('both ways out of the pane', () => {
  it('runs the copy button through the rule instead of raw innerText', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toContain('blockCopyText');
    expect(focus).toContain('writeText(blockCopyText(ref.current))');
    // The old behaviour, which is what put the breaks on her clipboard.
    expect(focus).not.toContain('writeText(ref.current?.innerText ?? \'\')');
  });

  it('runs a hand selection through it too, in both flavours', () => {
    const out = read('renderer/src/copy-out.ts');
    expect(out).toContain("import { unwrapWrappedProse, isWrappedProse } from './unwrap-lines'");
    // The words flavour, which is the one her mail client took.
    expect(out).toContain("unwrappable ? unwrapWrappedProse(plain) : plain");
    // And the formatted one, so an app that prefers html is not left behind.
    expect(out).toContain('holder.textContent = unwrapWrappedProse(text)');
  });

  it('never unwraps a fence a worker tagged with a language', () => {
    const out = read('renderer/src/copy-out.ts');
    expect(out).toContain('function taggedAsCode');
    expect(out).toMatch(/if \(taggedAsCode\(pre\)\) return text;/);
  });
});
