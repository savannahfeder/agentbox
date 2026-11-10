// The new-task card comes back on the project she used last.
//
// Two things were wrong, both measured against the real built renderer in
// headless Chrome before anything was changed:
//
//  1. The choice was written only when she SENT. Picking Personal and closing
//     the card left nothing behind, so the next card opened on the first
//     project. Her sentence says "select", and selecting is the act.
//  2. The choice was held as an INDEX into the displayed chip row. With her
//     real picker (22 projects, 12 hidden) opening the menu and clicking the
//     "12 hidden" pill moved the card off Personal and onto Delete, because
//     twelve chips appeared above it and the index now meant something else.
//     Nothing said so; the sentence just quietly read a different project.
//
// The second one is why the resolution lives in its own module. An index is
// correct on the render it is taken and wrong on the next one, which is a
// defect that cannot be seen in a diff, so it is pinned here instead.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProject, stepProject } from '../renderer/src/compose-project.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const compose = fs.readFileSync(path.join(root, 'renderer/src/components/Compose.tsx'), 'utf8');

const p = (slug) => ({ slug, name: slug[0].toUpperCase() + slug.slice(1) });
// Her real shape on 2026-08-14: the order she ranked, with twelve filed away.
const ALL = ['agentbox', 'harbour-new', 'meadow-3', 'harbour', 'harbour-2', 'personal',
  'meadow', 'orchard', 'quarry', 'delete'].map(p);
const HIDDEN = new Set(['meadow-3', 'harbour', 'harbour-2', 'delete']);
const SHOWN = ALL.filter((x) => !HIDDEN.has(x.slug));

describe('the project she picked is the project she keeps', () => {
  it('comes back on the one she chose', () => {
    expect(resolveProject(ALL, SHOWN, 'personal').slug).toBe('personal');
  });

  it('does not move when the hidden projects are revealed', () => {
    // This is the bug, stated as the two lists it happened between. Revealing
    // puts three projects above Personal; the answer must not notice.
    const before = resolveProject(ALL, SHOWN, 'personal');
    const after = resolveProject(ALL, ALL, 'personal');
    expect(after.slug).toBe(before.slug);
    expect(after.slug).toBe('personal');
    // And the position it USED to be read at now names something else, which
    // is the whole shape of what she saw: the card kept the slot and lost the
    // project.
    expect(SHOWN.indexOf(before)).not.toBe(ALL.indexOf(after));
    expect(ALL[SHOWN.indexOf(before)].slug).toBe('meadow-3');
  });

  it('does not move when a chip is dragged to a new rank', () => {
    const reordered = [p('personal'), ...ALL.filter((x) => x.slug !== 'personal')];
    expect(resolveProject(reordered, reordered, 'personal').slug).toBe('personal');
  });

  it('keeps a project she chose even after it is hidden from the row', () => {
    // Hiding is a filing decision about this picker, not an off switch.
    expect(resolveProject(ALL, SHOWN, 'delete').slug).toBe('delete');
  });

  it('falls back to the first chip she can see, never to nothing', () => {
    expect(resolveProject(ALL, SHOWN, '').slug).toBe('agentbox');
    expect(resolveProject(ALL, SHOWN, 'a-project-she-deleted').slug).toBe('agentbox');
    expect(resolveProject([], [], 'personal')).toBe(null);
  });
});

describe('tab still walks the row she can see', () => {
  it('steps forward and back over the shown projects', () => {
    expect(stepProject(SHOWN, 'agentbox', 1).slug).toBe('harbour-new');
    expect(stepProject(SHOWN, 'agentbox', -1).slug).toBe('quarry');
    expect(stepProject(SHOWN, 'quarry', 1).slug).toBe('agentbox');
  });

  it('starts at the near end when the current project is not on the row', () => {
    // Tab lands on the first chip, shift-Tab on the last. A project she chose
    // while the row was revealed is still selected once the row collapses, and
    // Tab has to do something sensible from there rather than nothing.
    expect(stepProject(SHOWN, 'delete', 1).slug).toBe('agentbox');
    expect(stepProject(SHOWN, 'delete', -1).slug).toBe('quarry');
  });

  it('has nothing to step to on an empty row', () => {
    expect(stepProject([], 'agentbox', 1)).toBe(null);
  });
});

describe('the card writes the choice down when she makes it', () => {
  it('remembers on picking, not only on sending', () => {
    // The old version had exactly one setItem and it was inside send. If this
    // ever goes back to that, picking-then-closing silently forgets again.
    const pick = compose.match(/const pick = \(slug: string\) => \{[\s\S]*?\}/);
    expect(pick, 'Compose still has a pick() that records the choice').toBeTruthy();
    expect(pick[0]).toContain('localStorage.setItem(LAST_PRODUCT_KEY, slug)');
  });

  it('never reads the selection out of a position in the row', () => {
    expect(compose).not.toMatch(/shown\[productIndex\]/);
    expect(compose).not.toMatch(/setProductIndex/);
  });
});
