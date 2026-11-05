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
import { messageDocuments } from '../renderer/src/message-artifacts.ts';

const focus = readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

// The one line that decides what gets a card in the conversation.
const list = focus.slice(focus.indexOf('const previewPaths ='), focus.indexOf('const showOptions'));

const named = {
  result: 'Drew designs/w-1/page.html, wrote notes/plan.md, and the code is in runs/w-1/the-change.change.',
};

it('does not give a change its own card in the conversation', () => {
  // The real branch, not the fixture-lab ones above it, is the last arm.
  expect(list.slice(list.lastIndexOf(': messageDocuments('))).not.toMatch(/changePathFor/);
  expect(messageDocuments(named)).not.toContain('runs/w-1/the-change.change');
});

it('still gives a design and a note theirs', () => {
  expect(list).toContain('messageDocuments(item, productDir)');
  expect(messageDocuments(named)).toEqual(['designs/w-1/page.html', 'notes/plan.md']);
});

it('keeps the figures as the one way in, now a button in the corner', () => {
  // The figures closed the byline from w-8019e8476e until w-e731ca9376
  // (2026-10-01), when viewing the code went into the thread's three-dot menu.
  // Nobody found it there, so on w-c25aae4035 they became a button in the
  // corner beside Done, which takes the menu's row: still one door, same path.
  expect(focus).toContain('const openChange = () => onOpenDoc?.(changePathFor(item.id));');
  expect(focus).toContain('onViewChange={openChange}');
  expect(focus).toMatch(/const codeButton = figures \?/);
});
