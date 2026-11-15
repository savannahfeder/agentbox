// A ONE-LINE ANSWER IS NOT SAID TWICE OVER ITS OPTIONS (w-3d0fa23ffb, 2026-10-22).
//
// The power tester logged "answer text shown twice" three times in an hour, on
// Codex, Sonnet and Opus threads: 'Worked on "why is the web app bundle 2mb".
// The verify Codex stand-in answered.' stood as the answer and again, word for
// word, as the heading of the options under it. The heading is the question by
// design, the answer's first line drawn again where the options are; on an
// answer that is nothing but that line, it is the same sentence twice. Such an
// answer's options now carry the box's own heading instead.
import { it, expect } from 'vitest';
import { askHeading, askLine } from '../renderer/src/ask-line.ts';

const OPTIONS = '\n\n## Options\n1. Ship it (recommended)\n2. Change something first\n3. Throw it away';
const row = (result) => ({ title: 'why is the web app bundle 2mb', result, body: 'why is the web app bundle 2mb' });

it('an answer that is one line carries no heading of its own over its options', () => {
  expect(askHeading(row(`Worked on "why is the web app bundle 2mb". The verify Codex stand-in answered.${OPTIONS}`))).toBe('');
});

it('one bold line is still one line', () => {
  expect(askHeading(row(`**Ship the smaller bundle?**${OPTIONS}`))).toBe('');
});

it('a question with a list under it keeps its heading', () => {
  expect(askHeading(row(`**Which bundle fix first?**\n\n- drop moment\n- lazy load charts${OPTIONS}`))).toBe('Which bundle fix first?');
});

it('an answer with more under its first line keeps that line as the heading', () => {
  const r = row(`**Ship the smaller bundle?**\n\nMoment and lodash are out, and the charts route loads on its own.${OPTIONS}`);
  expect(askHeading(r)).toBe(askLine(r));
  expect(askHeading(r)).toBe('Ship the smaller bundle?');
});
