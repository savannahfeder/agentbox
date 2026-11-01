// SIDE BY SIDE GIVES BOTH PICTURES THE ROOM.
//
// Sofia pressed Side by side on v2 and got two pictures at 26% with dark space
// above and below and a third of the width taken by the comment list. Measured
// in the browser copy at 1440x900 with two 1600x1000 versions: each picture
// was drawn 446x279 (28%). The comment list kept its 340 px, and the stage
// sized each picture as if it had the single view's 52 px of air either side
// when the split has 16. The split now takes the whole width, and the picture
// is sized by the air its box really has.
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

it('side by side takes the comment list away and the stage reads its own padding', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
  const stage = fs.readFileSync(new URL('../renderer/src/components/ArtifactStage.tsx', import.meta.url), 'utf8');
  expect(view).toMatch(/\{!compare && \(found === 'looking'/);
  expect(stage).toMatch(/roomInside\(/);
  expect(stage).not.toMatch(/PICTURE_AIR/);
});
