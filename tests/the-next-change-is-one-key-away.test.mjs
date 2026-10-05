// THE NEXT CHANGE IS ONE KEY AWAY: ] FOR THE NEXT, [ FOR THE ONE BEFORE.
//
// Found by the GPT-6.1-Sol tester on 2026-10-04: App.tsx in a real change has
// 27 separate changes and nothing moved between them, so reviewing it was
// scroll-and-hunt. VS Code has next and previous difference; this is that, on
// two keys the app does not use anywhere else, so neither can mean two things.
// J and K stay inert here (one-key-does-one-thing-in-a-change.test.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { nextChange } from '../renderer/src/code-keys.ts';
import { changeOwnsKey } from '../renderer/src/code-keys.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsx = fs.readFileSync(path.join(root, 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer', 'src', 'App.tsx'), 'utf8');

// Where each change starts in the column, and where the column is scrolled to.
const starts = [0, 400, 900, 2000];

describe('where the next change is', () => {
  it('is the first one below the top of the screen', () => {
    expect(nextChange(starts, 0, 1)).toBe(400);
    expect(nextChange(starts, 500, 1)).toBe(900);
  });

  it('skips the one she is already standing on', () => {
    expect(nextChange(starts, 400, 1)).toBe(900);
    expect(nextChange(starts, 402, 1)).toBe(900);
  });

  it('goes back to the one before', () => {
    expect(nextChange(starts, 900, -1)).toBe(400);
    expect(nextChange(starts, 950, -1)).toBe(900);
  });

  it('stays put at either end', () => {
    expect(nextChange(starts, 2000, 1)).toBeNull();
    expect(nextChange(starts, 0, -1)).toBeNull();
    expect(nextChange([], 0, 1)).toBeNull();
  });
});

describe('the keys', () => {
  it('are answered by the pane and kept from the app', () => {
    expect(changeOwnsKey(']')).toBe(true);
    expect(changeOwnsKey('[')).toBe(true);
    expect(tsx).toMatch(/e\.key === '\]' \|\| e\.key === '\['/);
  });

  it('mean nothing else anywhere in the app', () => {
    expect(app).not.toMatch(/key === '\['|key === '\]'/);
  });
});
