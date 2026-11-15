// A FILE OPENED BIG STAYS OPEN WHEN THE THREAD'S FILES ARRIVE.
//
// Clicking cut-v43-small.mp4 in a long video thread crashed the window, every
// time: "This screen hit an error twice in a row." PostHog had the report
// three times in a minute (TypeError reading a property of undefined), and
// building the same commit gave the same bundle, whose column lands on
// `v{version!.n} of {family.versions.length}` in ArtifactView. The view kept
// the open file as a position in the thread's file list. That list fills in
// steps (the version line, then the thread's own messages), and a later step
// reorders families or folds two copies of a file into one version, so the
// old position pointed past the end of its family and the header read it
// while drawing, before any effect could move it.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import { threadFiles, stillInHand } from '../shared/artifact-marks.mts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const D = 'designs/w-1';
const cuts = [`${D}/take1/cut-v43-small.mp4`, `${D}/take1/cut-v43-small-v2.mp4`, `${D}/take1/cut-v43-small-v9.mp4`];
const at = (families, place) => families[place.fi]?.versions[place.vi];

describe('the file in hand after the list changes', () => {
  it('follows its file when another family comes ahead of it', () => {
    const before = threadFiles(cuts.map((path) => ({ path })));
    const after = threadFiles([{ path: `${D}/opt-2.jpg` }, { path: `${D}/opt-2-v2.jpg` }, ...cuts.map((path) => ({ path }))]);
    const was = { fi: 0, vi: 2 };
    expect(at(after, was)).toBeUndefined();
    const v = before[0].versions[2];
    const now = stillInHand(after, was, { id: v.id, path: v.path });
    expect(at(after, now).path).toBe(`${D}/take1/cut-v43-small-v9.mp4`);
  });

  it('follows its file when two copies fold into one version', () => {
    const files = [{ path: `${D}/cut-v43-small.mp4` }, ...cuts.map((path) => ({ path }))];
    const before = threadFiles(files);
    expect(before[0].versions).toHaveLength(4);
    const numbers = { [`${D}/cut-v43-small.mp4`]: 1, [cuts[0]]: 1, [cuts[1]]: 2, [cuts[2]]: 3 };
    const after = threadFiles(files, numbers);
    expect(after[0].versions).toHaveLength(3);
    const v = before[0].versions[3];
    const now = stillInHand(after, { fi: 0, vi: 3 }, { id: v.id, path: v.path });
    expect(at(after, now).path).toBe(cuts[2]);
    // The copy that folded in is found by its path, since its id went with it.
    const copy = before[0].versions[1];
    expect(copy.id).toBe('cut-v43-small.mp4#2');
    expect(at(after, stillInHand(after, { fi: 0, vi: 1 }, { id: copy.id, path: copy.path })).n).toBe(1);
  });

  it('keeps the same place, as the same object, when nothing moved', () => {
    const families = threadFiles(cuts.map((path) => ({ path })));
    const place = { fi: 0, vi: 1 };
    const v = families[0].versions[1];
    expect(stillInHand(families, place, { id: v.id, path: v.path })).toBe(place);
    expect(stillInHand(families, place, null)).toBe(place);
  });

  it('never answers with a place that has no version', () => {
    const families = threadFiles(cuts.map((path) => ({ path })));
    expect(stillInHand(families, { fi: 0, vi: 3 }, null)).toBeNull();
    expect(stillInHand(families, { fi: 4, vi: 0 }, { id: 'gone.mp4', path: `${D}/gone.mp4` })).toBeNull();
    expect(stillInHand([], { fi: 0, vi: 0 }, null)).toBeNull();
    expect(stillInHand(families, null, null)).toBeNull();
  });
});

describe('the wiring', () => {
  it('the big view draws from the place still in hand, never a stale position', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/const at = useMemo\(\(\) => stillInHand\(families, placed/);
    expect(view).not.toContain('version!.n');
  });
  it('a step to another version holds that version, not the one shown before it', () => {
    // Taking the id from the version on screen undid every step: it is only
    // updated after the step has drawn.
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/const v = familiesNow\.current\[p\.fi\]\?\.versions\[p\.vi\];\s*setPlaced\(\{ fi: p\.fi, vi: p\.vi, held: v \?/);
  });
});
