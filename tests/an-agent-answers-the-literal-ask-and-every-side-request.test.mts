// AN AGENT ANSWERS THE LITERAL ASK, AND EVERY SIDE REQUEST, UP TOP.
//
// On one thread the person had to correct the run five times. Three of those
// came from the briefs, not the model:
// - "A LIST IS A TABLE" turned interview questions to practise from into a
//   .csv with columns. They wanted "an md file not a csv. just need the
//   questions".
// - Asked to file a bug beside a bigger question, the run filed it and said so
//   in its last paragraph. The person read that as "you ignored this CRITICAL
//   message".
// - The primary teammate's brief listed handing work on before doing it, so on
//   a research question the run offered to hand on work only mentioned in
//   passing.
// Checked by reading the shipped briefs for each rule.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(path.join(root, 'briefs/message-rules.md'), 'utf8');
const rules = raw.replace(/\s+/g, ' ');
const shipped = JSON.parse(fs.readFileSync(path.join(root, 'shared/instruction-defaults.json'), 'utf8')).messages;
const teammates = fs.readFileSync(path.join(root, 'main/teammates.mts'), 'utf8').replace(/\s+/g, ' ');

describe('a list to read or practise from', () => {
  it('stays a list in markdown, not a table', () => {
    expect(rules).toMatch(/A list to read through or practise from[^.]*stays a markdown list/);
  });
  it('leaves the table rule for lists of things that share the same facts', () => {
    expect(rules).toMatch(/A LIST IS A TABLE/);
    expect(rules).toMatch(/\.csv with a header row/);
  });
});

describe('a side request', () => {
  it('is confirmed right under the first line, never only at the end', () => {
    expect(rules).toMatch(/EVERY REQUEST IN THEIR MESSAGE IS ANSWERED/);
    expect(rules).toMatch(/right under line one/);
  });
});

describe('the shipped copy', () => {
  it('is the same as the brief', () => {
    expect(shipped).toBe(raw);
  });
});

describe('the primary teammate', () => {
  it('does a question or research itself', () => {
    expect(teammates).toMatch(/A question, research or anything they asked of you: do it yourself in this run/);
  });
  it('does not offer to hand on work only mentioned in passing', () => {
    expect(teammates).toMatch(/mentioned in passing/);
  });
});
