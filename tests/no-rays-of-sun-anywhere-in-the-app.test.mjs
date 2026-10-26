// NO RAYS OF SUN ANYWHERE IN THE APP (2026-10-26, w-fadbbea8ef).
//
// The orange sunburst was taken out of the app's look, yet agents kept drawing
// it into new designs: an onboarding proposal put it behind the welcome screen.
// It came from the code. Ember Grid still defined `--skin-rays` ("the brand's 24
// rays"), the unreachable inbox zero page drew it behind its 0, and the
// onboarding walk copied that page's markup, so anyone reading the stylesheet
// for the house style found rays described as the brand.
//
// Measured before the fix: `--skin-rays` was defined three times in
// renderer/src/styles.css and drawn once in renderer/src/workspace-navigation.css.
// This holds every file an agent builds or draws from to no rays at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);

// A ray drawing by any of its names. "arrays" and "strays" are not rays.
const RAYS = /\b(sun ?rays?|sunburst|sun ?burst|rays)\b|skin-rays/i;

const READ = ['renderer', 'shared', 'main', 'scripts', 'docs', 'designs', 'mobile', 'cloud', 'bin', '.claude'];
const SKIP = new Set(['node_modules', 'scratch', 'dist', '.git', 'worktrees']);
const TEXT = /\.(css|tsx?|mjs|cjs|js|html|md|json|svg)$/;

function* files(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('dist-')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (TEXT.test(e.name)) yield p;
  }
}

describe('the word test', () => {
  it('finds rays by any of their names', () => {
    for (const s of ['the brand\'s 24 rays', 'var(--skin-rays)', 'a sunburst behind the mark', 'Sun rays', 'RAYS']) expect(s).toMatch(RAYS);
  });
  it('does not mistake arrays, strays or grays for rays', () => {
    for (const s of ['two arrays of slugs', 'kills the strays', 'warm grays', 'raysync']) expect(s).not.toMatch(RAYS);
  });
});

describe('the app', () => {
  it('defines no rays token in any look', () => {
    const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
    expect(css).not.toContain('--skin-rays');
  });

  it('draws no rays behind inbox zero', () => {
    const css = fs.readFileSync(path.join(root, 'renderer/src/workspace-navigation.css'), 'utf8');
    expect(css).not.toMatch(RAYS);
  });

  it('mentions rays nowhere an agent reads for the house style', () => {
    const found = [];
    for (const dir of READ) {
      for (const f of files(path.join(root, dir))) {
        if (f === SELF) continue;
        fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          if (RAYS.test(line)) found.push(`${path.relative(root, f)}:${i + 1}`);
        });
      }
    }
    for (const f of ['CLAUDE.md', 'AGENTS.md', 'README.md']) {
      const p = path.join(root, f);
      if (fs.existsSync(p) && RAYS.test(fs.readFileSync(p, 'utf8'))) found.push(f);
    }
    expect(found).toEqual([]);
  });
});
