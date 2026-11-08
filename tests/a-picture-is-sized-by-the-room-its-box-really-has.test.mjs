// A PICTURE IS SIZED BY THE ROOM ITS BOX REALLY HAS.
//
// Two versions side by side once drew each picture at 28% (446x279 of a
// 1600x1000 picture, at 1440x900), because the stage assumed the single
// view's 52 px of air either side. Side by side is gone (2026-11-08), but the
// stage still sizes a picture from the padding its box has, not a constant.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { roomInside } from '../renderer/src/artifact-pins.ts';

it('sizes a picture by the padding its box has', () => {
  const split = { clientWidth: 720, clientHeight: 800, paddingLeft: '16px', paddingRight: '16px', paddingTop: '16px', paddingBottom: '16px' };
  expect(roomInside(split)).toEqual({ w: 688, h: 768 });
  const single = { clientWidth: 1100, clientHeight: 856, paddingLeft: '52px', paddingRight: '52px', paddingTop: '24px', paddingBottom: '24px' };
  expect(roomInside(single)).toEqual({ w: 996, h: 808 });
});

it('never gives a negative room', () => {
  expect(roomInside({ clientWidth: 10, clientHeight: 10, paddingLeft: '16px', paddingRight: '16px', paddingTop: '16px', paddingBottom: '16px' })).toEqual({ w: 0, h: 0 });
});

it('the stage reads its own padding', () => {
  const stage = fs.readFileSync(new URL('../renderer/src/components/ArtifactStage.tsx', import.meta.url), 'utf8');
  expect(stage).toMatch(/roomInside\(/);
  expect(stage).not.toMatch(/PICTURE_AIR/);
});
