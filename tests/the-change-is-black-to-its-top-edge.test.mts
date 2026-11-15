// THE WHOLE ARTIFACT IS ONE COLOUR, INCLUDING THE BAR ACROSS THE TOP.
//
// What she was looking at: `.doc-head` sets `--doc-page` on itself, so when the
// card underneath went black on 08-23 the header stayed on the app's own grey
// and drew a join the full width of the artifact.
//
// TWO THINGS ARE GUARDED AND THE SECOND IS HALF THE SENTENCE. The head takes
// the same token the card takes, so the two cannot drift apart again.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const css = fs.readFileSync(
  path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'renderer', 'src', 'styles.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule whose selector list holds this exact selector. */
function rulesFor(selector) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1].split(',').some((s) => s.trim() === selector)) out.push(m[2].trim());
  }
  return out;
}

const backgroundIn = (body) => (body.match(/(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/) ?? [])[1]?.trim();

describe('the change goes black to its top edge', () => {
  it('paints the header with the same token as the ground under it', () => {
    const head = rulesFor('.doc-pane.doc-code .doc-head').map(backgroundIn).filter(Boolean);
    const card = rulesFor('.doc-pane.doc-code .doc-card').map(backgroundIn).filter(Boolean);
    expect(head).toContain('var(--code-ground)');
    expect(card).toContain('var(--code-ground)');
    // The same token, not two colours that happen to agree today.
    expect(head[head.length - 1]).toBe(card[card.length - 1]);
  });

  it('sets that ground once and lets all sixteen skins inherit it', () => {
    // Written in the dark block and nowhere else. Sixteen skins sit under it
    // and every one of them would otherwise need its own line.
    expect(css.match(/--code-ground:\s*#0e0f12/g) ?? []).toHaveLength(1);
  });

  it('leaves the markdown and page headers alone, which is her sentence', () => {
    // The bare rule that every artifact's header takes still says --doc-page,
    // and nothing narrows it to doc-md or doc-html: a markdown file and a page
    // are untouched by this because only doc-code overrides.
    expect(rulesFor('.doc-head').map(backgroundIn)).toContain('var(--doc-page)');
    expect(css).not.toMatch(/\.doc-pane\.doc-(md|html)\s+\.doc-head\s*\{[^}]*background/);
  });

  it('a light window keeps its paper', () => {
    // --code-ground falls back to the pane's own page colour at the root, so
    // the black is a property of a dark window and not of the artifact. She
    // approved the five colours on white and a black slab was not among them.
    expect(css).toMatch(/--code-ground:\s*var\(--doc-page\)/);
  });
});
