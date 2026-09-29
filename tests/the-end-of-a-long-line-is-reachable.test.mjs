// THE END OF A LONG LINE IS REACHABLE, AND THE WALK MOVES ONE THING.
//
// The keyboard half of that answer is on, which found the same fault from the
// other end and fixed it more thoroughly than this row did. These are the
// three things that round did not cover, all measured on her own eighteen-file
// change.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const codeArtifact = read('renderer', 'src', 'components', 'CodeArtifact.tsx');
const styles = read('renderer', 'src', 'styles.css');

// A line that ran past the right edge was cut off with nothing to scroll to it:
// the line could not grow, so the column never overflowed, so there was nothing
// sideways to reach. Measured 2026-08-27: 18 of the 833 lines drawn were cut,
// the worst by 745 pixels, and the pane would not move to any of them.
describe('the end of a long line', () => {
  const rule = styles.split('\n').find((l) => l.startsWith('.code-line {'));

  it('has a rule to read at all', () => {
    expect(rule).toBeTruthy();
  });

  it('wraps rather than hiding what runs past the edge', () => {
    expect(rule).not.toContain('overflow-x: hidden');
    expect(rule).toContain('white-space: pre-wrap');
  });

  it('can break the 918-character line in her store that has no space in it', () => {
    expect(rule).toContain('overflow-wrap: anywhere');
  });

  it('keeps the leading spaces, so the indentation still reads', () => {
    // `pre-wrap` and not `normal`: the difference is every leading space in
    // every line of code.
    expect(rule).not.toMatch(/white-space:\s*normal/);
  });
});

describe('walking the files moves the code and nothing else', () => {
  // scrollIntoView walks EVERY scrollable ancestor it can find, so walking the
  // files was also dragging the card behind the pane up and down.
  it('sets one scrollTop instead of asking every ancestor to scroll', () => {
    const walk = codeArtifact.slice(codeArtifact.indexOf('const cameFromScroll'));
    expect(walk.slice(0, 1400)).not.toMatch(/\.scrollIntoView\(/);
    expect(codeArtifact).toContain('body.scrollTop = Math.max(0, Math.min(max, body.scrollTop + delta))');
  });

  // The header is `position: sticky`, so once the column has scrolled its own
  // rectangle is pinned to the top and the distance comes out zero every time.
  //
  // This named the whole expression
  // `heads.current.get(current.path)?.parentElement` until 2026-09-20, when the
  // jump grew a settle loop and the path it carries became a local. What is
  // worth holding is `.parentElement`, the step off the sticky header onto the
  // block. The name inside the brackets is not, and pinning it only made this
  // go red for a rename.
  it('measures from the file block and not from its sticky header', () => {
    expect(codeArtifact).toMatch(/heads\.current\.get\([\w.?]+\)\?\.parentElement/);
  });

  // AND IT KEEPS PUTTING IT THERE UNTIL THE COLUMN STOPS MOVING.Measured on her
  // seventeen-file change before this existed: clicking main.mjs left the tree
  // marking main.mjs while working-from-your-phone.html was the file actually
  // at the top of the screen, 1 landing in 17 wrong. The cause is
  // `content-visibility` resolving guessed hunk heights AFTER the jump has
  // landed, so everything below it slides out from under her.
  it('re-asserts the jump until the file has sat at the top for three frames', () => {
    const walk = codeArtifact.slice(codeArtifact.indexOf('const cameFromScroll'));
    expect(walk).toMatch(/still \+= 1/);
    expect(walk).toMatch(/still >= 3/);
    expect(walk).toMatch(/requestAnimationFrame\(put\)/);
  });

  // A jump she asked for arrives as scroll events, and repointing off those is
  // exactly what carried her to a file she had not chosen.
  it('leaves the file alone while a jump she asked for is in flight', () => {
    expect(codeArtifact).toContain('if (holding.current) return;');
  });

  // And her own hand cancels it at once, so she is never held anywhere.
  it('releases the hold on her own wheel, touch, click or key', () => {
    for (const ev of ['wheel', 'touchstart', 'mousedown', 'keydown']) {
      expect(codeArtifact).toMatch(new RegExp(`addEventListener\\('${ev}', release`));
    }
  });

  it('keeps the row she is standing on visible in the tree', () => {
    expect(codeArtifact).toContain('treeRowRefs');
    expect(codeArtifact).toContain('tree.scrollTop += r.top - t.top');
    expect(codeArtifact).toContain('tree.scrollTop += r.bottom - t.bottom');
  });

  // She may arrive at a file by pressing a key or by scrolling to it. Where am
  // I is the same question either way, so the tree follows in both cases.
  it('follows her whether she walked there or scrolled there', () => {
    const walk = codeArtifact.slice(codeArtifact.indexOf('const cameFromScroll'));
    const guard = walk.indexOf('if (!cameFromScroll)');
    const tree = walk.indexOf('const tree = treeRef.current');
    const closes = walk.indexOf('\n    }\n', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(tree).toBeGreaterThan(closes);
  });
});
