// A JUMP ALWAYS LANDS, AND ] LANDS ON THE CHANGE ITSELF.
//
// From the GPT-6.1-Sol tester's third round, 2026-10-04:
//
// - After opening "139 lines not shown", ] landed on unchanged line 20, and a
//   second ] skipped the changed call entirely. ] aimed at the top of each
//   hunk's BLOCK, and the opened lines sit at the top of that block. It aims at
//   the hunk's own rows now.
// - On a 64-file change, End then Home in the tree marked index.mjs while the
//   code stayed at 83,231, twice. A scroll that had not been processed yet was
//   queued in the same render as the jump; its update marks the move as "she
//   scrolled there herself", so the jump effect stood down. A jump she asked
//   for is now known by its own counter, which nothing from scrolling touches.
// - Opened lines closed again when their file was folded and reopened.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const tsx = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');

describe('] and [', () => {
  it('aim at the rows of each change, not the block that may hold opened lines', () => {
    expect(tsx).toMatch(/querySelectorAll<HTMLElement>\('\.code-hunk, \.code-unfilled'\)/);
    expect(tsx).not.toMatch(/'\.code-hunk-block, \.code-unfilled'/);
  });
});

describe('a jump she asked for', () => {
  it('is told apart from a scroll by its own counter', () => {
    expect(tsx).toMatch(/const asked = jump !== seenJump\.current;/);
    expect(tsx).toMatch(/const cameFromScroll = fromScroll\.current && !asked;/);
  });
});

describe('opened lines', () => {
  it('are kept per file outside the file, so folding does not close them', () => {
    expect(tsx).toMatch(/gaps=\{gapsFor\(file\.path\)\}/);
  });
});
