// THE REPLY BOX ASKS ONE QUESTION, IN THE APP'S OWN VOICE.
//
// This test is here because copy has no compiler: nothing else in the repo
// would notice a second sentence growing back onto that placeholder, or a
// clause being appended to explain the first one, which is exactly how the old
// line got there.
//
// It reads the placeholder attribute out of the source rather than a copy of
// the string, so the test cannot pass against a constant nobody renders. It
// asserts on that attribute only, never on the file: the comment above the
// attribute quotes the old line on purpose, and a test that banned the words
// anywhere in the file would forbid the note explaining why they went.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Every placeholder that asks her for words, with the file it lives in. The
// search box and the schedule fields are not here: they take a value, not a
// sentence, and their hints are examples rather than questions.
const ASKING_FIELDS = [
  ['renderer/src/components/Focus.tsx', 'the reply box'],
  ['renderer/src/components/Compose.tsx', 'the new task card'],
];

const placeholderIn = (file) => {
  const m = read(file).match(/placeholder="([^"]+)"/);
  expect(m, `${file} has no literal placeholder`).toBeTruthy();
  return m[1];
};

describe('the reply box', () => {
  it('asks one sentence, and it is the question she has to answer', () => {
    expect(placeholderIn('renderer/src/components/Focus.tsx'))
      .toBe('What should the agent do next?');
  });
});

describe('every field that asks her for words', () => {
  for (const [file, name] of ASKING_FIELDS) {
    it(`${name} asks in one sentence`, () => {
      const copy = placeholderIn(file);
      // One terminator, and it is the last character: two sentences, or a
      // sentence with an explanation bolted after it, both fail here.
      const ends = copy.match(/[.?!]/g) ?? [];
      expect(ends.length, `"${copy}" is more than one sentence`).toBe(1);
      expect(copy.trim().endsWith(ends[0])).toBe(true);
    });

    it(`${name} asks a question rather than describing itself`, () => {
      expect(placeholderIn(file).trim().endsWith('?')).toBe(true);
    });
  }
});
