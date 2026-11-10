// The left and right arrows in a picture step to the agent's other pictures,
// never to another version of the same picture.
//
// What broke: an agent's answer drew round-4-tour-1-hand-off.png and its -v2
// side by side. A click opened the big view at v2 of 2, and the arrows stepped
// v1, v2, then the next picture, because the list of steps held every version
// the turn drew. The ask: "When I click right or left while in an image
// preview, I expect it to show me the next image that the agent has returned.
// Instead it's been rotating between versions." Versions stay one press away on
// the ‹ v2 of 2 › control in the header. Measured with stepsThrough and nextStep
// on the turn below: the right arrow from the v1 landed on the v2.
//
// And a picture opened from somewhere other than the thread (a Needs you row, a
// comment) stepped through every file the thread ever named. It now steps
// through the pictures of the agent's latest answer when it is one of them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { filesInLines, latestPicturesSaid, nextStep, stepsThrough, threadFiles, whereAPressLands } from '../shared/artifact-marks.mts';
import { picturesBeside } from '../renderer/src/picture-view.ts';

const agent = (ts, text) => ({ id: `l${ts}`, ts, source: 'agent', patch: { result: text } });
const you = (ts, text) => ({ id: `l${ts}`, ts, source: 'founder', patch: { answer: text } });
const lines = [
  agent(1, '![](designs/r1/old.png)\n![](designs/r1/tour.png)'),
  you(2, 'Another round please'),
  agent(3, 'Working on it. ![](designs/r2/tour.png)'),
  agent(4, 'The next version of [tour.png](designs/r2/tour.png) is [tour-v2.png](designs/r2/tour-v2.png).\n\n![](designs/r2/tour.png) ![](designs/r2/tour-v2.png)\n\n![](designs/r2/board.png)\n\n![](designs/r2/board-v2.png)\n\n![](designs/r2/menu.png)'),
];
const families = threadFiles(filesInLines(lines));
const nameAt = (s) => (s ? families[s.fi].versions[s.vi].path : null);
const turn = ['designs/r2/tour.png', 'designs/r2/tour-v2.png', 'designs/r2/board.png', 'designs/r2/board-v2.png', 'designs/r2/menu.png'];
const steps = stepsThrough(families, turn);
const at = (path) => whereAPressLands(families, { path });

describe('the pictures the arrows step through', () => {
  it('hold each picture once, at the newest version its turn drew, in the order the turn drew them', () => {
    expect(steps.map(nameAt)).toEqual(['designs/r2/tour-v2.png', 'designs/r2/board-v2.png', 'designs/r2/menu.png']);
  });

  it('keep a picture the turn drew only once as it is', () => {
    expect(stepsThrough(families, ['designs/r2/menu.png']).map(nameAt)).toEqual(['designs/r2/menu.png']);
  });

  it('keep the order of the paths handed over, at the version they name', () => {
    expect(stepsThrough(families, ['designs/r2/menu.png', 'designs/r2/tour.png']).map(nameAt)).toEqual(['designs/r2/menu.png', 'designs/r2/tour.png']);
  });
});

describe('an arrow press', () => {
  it('goes from the newest version to the next picture, not back to the v1', () => {
    expect(nameAt(nextStep(families, steps, at('designs/r2/tour-v2.png'), 1))).toBe('designs/r2/board-v2.png');
    expect(nameAt(nextStep(families, steps, at('designs/r2/board-v2.png'), -1))).toBe('designs/r2/tour-v2.png');
  });

  it('from an older version a click opened, goes on to the next picture too', () => {
    expect(nameAt(nextStep(families, steps, at('designs/r2/tour.png'), 1))).toBe('designs/r2/board-v2.png');
    expect(nameAt(nextStep(families, steps, at('designs/r2/board.png'), 1))).toBe('designs/r2/menu.png');
  });

  it('never lands on another version of the picture it is on, in either direction', () => {
    for (const s of steps) {
      for (const by of [1, -1]) {
        const next = nextStep(families, steps, s, by);
        if (next) expect(next.fi).not.toBe(s.fi);
      }
    }
  });

  it('stops at either end', () => {
    expect(nextStep(families, steps, at('designs/r2/tour.png'), -1)).toBeNull();
    expect(nextStep(families, steps, at('designs/r2/menu.png'), 1)).toBeNull();
  });
});

describe('the agent\'s latest pictures', () => {
  it('are the pictures of every message since you last spoke, each once', () => {
    expect(latestPicturesSaid(lines)).toEqual(['designs/r2/tour.png', 'designs/r2/tour-v2.png', 'designs/r2/board.png', 'designs/r2/board-v2.png', 'designs/r2/menu.png']);
  });

  it('reach back to the last answer that drew any when the newest drew none', () => {
    expect(latestPicturesSaid([...lines, you(5, 'Thanks'), agent(6, 'Done, nothing else changed.')])).toContain('designs/r2/menu.png');
  });

  it('leave out the files that are not pictures, and the pictures you sent', () => {
    const said = latestPicturesSaid([agent(1, 'See [notes.md](plans/notes.md) and ![](designs/a.png)'), you(2, 'What about ![](attachments/mine.png)'), agent(3, 'Here: ![](designs/b.png)')]);
    expect(said).toEqual(['designs/b.png']);
  });

  it('are none on a thread that drew no picture', () => {
    expect(latestPicturesSaid([agent(1, 'No pictures here.')])).toEqual([]);
    expect(latestPicturesSaid(undefined)).toEqual([]);
  });
});

describe('the small picture view', () => {
  const shot = (path, section = '3') => ({ path, url: `img://${path}`, section });

  it('shows each picture once, at the newest version its part drew', () => {
    const { pictures, start } = picturesBeside(turn.map((p) => shot(p)), 4);
    expect(pictures.map((p) => p.path)).toEqual(['designs/r2/tour-v2.png', 'designs/r2/board-v2.png', 'designs/r2/menu.png']);
    expect(start).toBe(2);
  });

  it('opens the version that was clicked, in its picture\'s place', () => {
    const { pictures, start } = picturesBeside(turn.map((p) => shot(p)), 0);
    expect(pictures.map((p) => p.path)).toEqual(['designs/r2/tour.png', 'designs/r2/board-v2.png', 'designs/r2/menu.png']);
    expect(start).toBe(0);
  });

  it('keeps two pictures with one name in two folders as two', () => {
    const { pictures } = picturesBeside([shot('designs/a/shot.png'), shot('designs/b/shot.png')], 0);
    expect(pictures).toHaveLength(2);
  });
});

describe('the big view', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');

  it('steps through the agent\'s latest pictures when no turn was handed over', () => {
    expect(view).toMatch(/latestPicturesSaid\(lines\)/);
  });

  it('leaves the versions to the header control, not the arrow keys', () => {
    const keys = view.slice(view.indexOf('const rest = (e: KeyboardEvent)'), view.indexOf("window.addEventListener('keydown', escape, true)"));
    expect(keys).toMatch(/stepFile\(1\)/);
    expect(keys).not.toMatch(/stepVersion/);
  });
});
