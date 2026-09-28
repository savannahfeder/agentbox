// THE CODE VIEWER HAS NO GLASS ON IT —, 2026-09-18.
//
// This replaces two tests that asserted the opposite, because the requirement
// they encoded is the one she withdrew: `soft-glass-code-does-not-stack-
// charcoal` and `review-documents-share-the-glass-surface`, both written that
// same week. They are deleted rather than skipped, so nothing has to work out
// which of two contradictory tests is the live one.
//
// WORTH KNOWING BEFORE ANYBODY PUTS IT BACK FOR SPEED: the blur was not the
// jitter. Measured on her own 2,562-row change with the processor turned down
// six times, the blurred build
// and the plain one both scrolled at a 16.7ms median frame and neither dropped
// a frame past 50ms. The cost was in the pane's own script, and that is fixed
// in CodeArtifact.tsx. This test is about what she asked to look at, not speed.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../renderer/src/' + p, import.meta.url), 'utf8');
// THE RULES, NOT THE PROSE. The comment where the glass used to be says what
// was deleted and names it, which is the point of it; a check that read the
// comments would fail on the note explaining why it should pass.
const css = read('components/direct-review.css').replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule in that stylesheet that reaches the change, by the selectors the
// code viewer is built out of. A rule may name them only if it also excludes
// the code pane.
const CODE_ONLY = ['.code-file-head', '.code-file-block', '.code-tree', '.code-body', '.code-row', '.cr-plus', '.cr-minus', '.code-file-picker'];

it('puts no blur over the change, and none anywhere near it', () => {
  // The whole point, stated the shortest way it can be: there is no
  // backdrop-filter in this stylesheet at all any more.
  expect(css).not.toMatch(/backdrop-filter/);
});

it('draws the change with no treatment of its own', () => {
  for (const sel of CODE_ONLY) expect(css).not.toContain(sel);
  // And the `.doc-code` pane itself is not restyled from here either, which is
  // the door the file blocks and the tree came through.
  expect(css).not.toContain('.doc-code');
});

it('leaves the text artifact and the review card exactly as they were', () => {
  // A markdown artifact kept the card she has been reading all week; only the
  // code half was withdrawn, so the two rules that reach it are narrowed
  // rather than deleted.
  expect(css).toContain(':root[data-code-review]:not([data-code-review="original"]) .doc-pane.doc-md .doc-card');
  expect(css).toContain(':root[data-code-review]:not([data-code-review="original"]) .doc-pane.doc-md .doc-head');
  // The card in the conversation is a different surface and is untouched.
  expect(css).toContain('.direct-review');
});

it('no longer offers the four code treatments as a choice', () => {
  const app = read('App.tsx');
  // The picker is gone from the lab along with the rules it switched between,
  // and the attribute stays, because the card and the text artifact read it.
  expect(app).not.toContain('codeReviewStyle');
  expect(app).not.toContain('Code viewer style');
  expect(app).toContain("dataset.codeReview='glass'");
});
