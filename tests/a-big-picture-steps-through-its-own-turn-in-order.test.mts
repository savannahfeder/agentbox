// A picture opened big from a thread steps, with the arrow keys, through the
// pictures of its own turn in the order that turn draws them.
//
// What broke: an answer drew tag-other-icon.png, then tag-other-icon-v2.png,
// then the v2 again large. A click opened the big view (ArtifactView), and its
// arrows stepped through every file family in the whole thread, each landing on
// its newest version: the v2 beside the v1 was never an arrow away, and the
// arrows went to pictures from rounds long past. The ask: "They should all be
// shown to me in the order they appear in the doc." The smaller picture view
// already kept to the clicked picture's turn
// (a-picture-steps-only-through-its-own-part-of-the-thread); the big view, which
// is what a click opens on a computer, never got that list.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { filesInLines, stepsThrough, threadFiles, whereAPressLands, nextStep } from '../shared/artifact-marks.mts';
import { picturesFor } from '../renderer/src/components/PictureView.tsx';

const said = (ts, text) => ({ id: `l${ts}`, ts, source: 'agent', patch: { result: text } });
// An early round drew a mock, a later round drew two versions of the icon and the mock again.
const lines = [
  said(1, '![](designs/r1/mock.png)\n![](designs/r1/other.png)'),
  said(2, 'The next version of [tag-other-icon.png](designs/r2/tag-other-icon.png) is [tag-other-icon-v2.png](designs/r2/tag-other-icon-v2.png).\n\n![](designs/r2/tag-other-icon.png) ![](designs/r2/tag-other-icon-v2.png)\n\n![](designs/r2/tag-other-icon-v2.png)\n\n![](designs/r1/mock.png)'),
];
const families = threadFiles(filesInLines(lines));
const nameAt = (s) => families[s.fi].versions[s.vi].path;
// The turn's pictures as the thread draws them, as the click reads them off the page.
const turn = ['designs/r2/tag-other-icon.png', 'designs/r2/tag-other-icon-v2.png', 'designs/r1/mock.png'];

describe('the pictures the big view steps through', () => {
  // Since 2026-11-08 versions are one step, at the newest the turn drew
  // (the-arrows-in-a-picture-walk-the-agents-latest-pictures-never-their-versions).
  it('are each picture the turn draws, its v1 and v2 as one step', () => {
    expect(stepsThrough(families, turn).map(nameAt)).toEqual(['designs/r2/tag-other-icon-v2.png', 'designs/r1/mock.png']);
  });

  it('follow the turn, not the order the thread first named each file', () => {
    const steps = stepsThrough(families, ['designs/r1/mock.png', 'designs/r2/tag-other-icon-v2.png']);
    expect(steps.map(nameAt)).toEqual(['designs/r1/mock.png', 'designs/r2/tag-other-icon-v2.png']);
  });

  it('leave out a picture only another turn drew', () => {
    expect(stepsThrough(families, turn).map(nameAt)).not.toContain('designs/r1/other.png');
  });

  it('count a file once, and skip a path the thread never named', () => {
    const steps = stepsThrough(families, ['designs/r2/tag-other-icon.png', './designs/r2/tag-other-icon.png', 'designs/nowhere.png']);
    expect(steps.map(nameAt)).toEqual(['designs/r2/tag-other-icon.png']);
  });

  it('are none when nothing was handed over', () => {
    expect(stepsThrough(families, undefined)).toEqual([]);
  });
});

describe('an arrow press', () => {
  const steps = stepsThrough(families, turn);
  const opened = whereAPressLands(families, { path: 'designs/r2/tag-other-icon.png' });

  it('goes from the v1 past the v2 beside it, on to the next picture', () => {
    expect(nameAt(nextStep(families, steps, opened, 1))).toBe('designs/r1/mock.png');
  });

  it('goes back the same way, and stops at either end', () => {
    expect(nextStep(families, steps, opened, -1)).toBeNull();
    const last = whereAPressLands(families, { path: 'designs/r1/mock.png' });
    expect(nextStep(families, steps, last, 1)).toBeNull();
    expect(nameAt(nextStep(families, steps, last, -1))).toBe('designs/r2/tag-other-icon-v2.png');
  });

  it('keeps its place in the turn after the version arrows moved off it', () => {
    const mockFamily = steps[1].fi;
    expect(nameAt(nextStep(families, steps, { fi: mockFamily, vi: 99 }, -1))).toBe('designs/r2/tag-other-icon-v2.png');
  });

  it('steps through every file, newest version each, when nothing was handed over', () => {
    const first = { fi: 0, vi: 0 };
    const next = nextStep(families, [], first, 1);
    expect(next).toEqual({ fi: 1, vi: families[1].versions.length - 1 });
  });
});

// Just enough of a page for picturesFor: turns holding pictures and links.
function el(data = {}, kids = [], tag = 'div') {
  const node = { tag, dataset: data, kids, parent: null, currentSrc: '', src: data.src ?? '' };
  for (const k of kids) k.parent = node;
  const all = () => kids.flatMap((k) => [k, ...k.all()]);
  const is = (n, sel) => (sel === 'img' ? n.tag === 'img' : sel === '[data-picture]' ? 'picture' in n.dataset : 'exchange' in n.dataset);
  Object.assign(node, {
    all,
    querySelectorAll: (sel) => all().filter((n) => is(n, sel)),
    querySelector: (sel) => all().find((n) => is(n, sel)) ?? null,
    closest: (sel) => { for (let n = node; n; n = n.parent) if (is(n, sel)) return n; return null; },
    contains: (n) => n === node || all().includes(n),
  });
  return node;
}
const door = (path) => el({ picture: path }, [el({ src: `img://${path}` }, [], 'img')]);

describe('a link in the words opens the picture its own turn draws', () => {
  const link = el({}, [], 'a');
  const page = el({}, [
    el({ exchange: '1' }, [door('designs/r1/mock.png')]),
    el({ exchange: '3' }, [link, door('designs/r2/tag-other-icon.png'), door('designs/r2/tag-other-icon-v2.png'), door('designs/r1/mock.png')]),
    el({ exchange: '5' }, [door('designs/r1/mock.png'), door('designs/r3/later.png')]),
  ]);

  it('steps through that turn, even when a later turn draws the same file', () => {
    const { pictures, start } = picturesFor(page, 'designs/r1/mock.png', link);
    expect(pictures.map((p) => p.path)).toEqual(['designs/r2/tag-other-icon-v2.png', 'designs/r1/mock.png']);
    expect(start).toBe(1);
  });

  it('still finds the picture in another turn when its own draws none', () => {
    const { pictures } = picturesFor(page, 'designs/r3/later.png', link);
    expect(pictures.map((p) => p.path)).toEqual(['designs/r1/mock.png', 'designs/r3/later.png']);
  });
});

describe('a click hands the big view its turn', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');

  it('reads the pressed picture\'s turn off the page, as the small view does', () => {
    expect(focus).toMatch(/opensBig\(href\)\) \{ openBig\(href, from\); return; \}/);
    expect(focus).toMatch(/steps: picturesFor\(paneRef\.current, path, from\)\.pictures\.map/);
  });

  it('a link in the words says where it was clicked', () => {
    expect(focus).toMatch(/onOpen\(e, e\.currentTarget\)/);
    expect(focus).not.toMatch(/openHref\(\w+, undefined, click\)/);
  });

  it('steps by that list', () => {
    expect(view).toMatch(/stepsThrough\(families, open\.steps\)/);
    expect(view).toMatch(/nextStep\(families, steps, at, by\)/);
  });
});
