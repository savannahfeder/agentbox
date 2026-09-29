// THE CHANGE IS NOT A CARD IN THE CONVERSATION —, 2026-09-20.
//
// She is right that it was the same thing twice. `.change-figures`, the
// "+2,209 −137 in 17 files" at the right-hand end of the byline, already opens
// `changePathFor(item.id)`, and the card in the conversation opened that exact
// same path. So the card goes and the byline keeps it: one run, one door.
//
// A DESIGN OR A NOTE STILL GETS ITS CARD, and that is the line to hold. An html
// page and a markdown file have no second door anywhere in the app, and her own
// screenshot had one of each sitting above the code card she was pointing at.
// Only code was doubled up.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const focus = readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

// The one line that decides what gets a card in the conversation.
const list = focus.slice(focus.indexOf('const previewPaths ='), focus.indexOf('const showOptions'));

it('does not give a change its own card in the conversation', () => {
  // The real branch, not the fixture-lab ones above it, is the last arm of that
  // conditional: the set built out of the message's own referenced files.
  const real = list.slice(list.lastIndexOf('[...new Set('));
  expect(real).not.toMatch(/changePathFor/);
  expect(real).not.toMatch(/change\)\$/);
  expect(real).toMatch(/\\\.\(md\|markdown\)\$/);
});

it('still gives a design and a note theirs', () => {
  const real = list.slice(list.lastIndexOf('[...new Set('));
  expect(real).toContain('htmlArtifacts');
  expect(real).toContain('referencedFiles');
});

it('keeps the byline figures, which are now the only way in', () => {
  // The figures were a moving part of w-581dbc6cc4's round for two rounds and
  // are not any more: Done went to the corner row instead, so this line keeps
  // the right-hand end it has held since w-8019e8476e.
  expect(focus).toContain('className="change-figures"');
  expect(focus).toContain('onClick={() => onOpenDoc?.(changePathFor(item.id))}');
});
