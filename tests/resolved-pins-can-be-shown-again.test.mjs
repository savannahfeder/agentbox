// RESOLVED PINS CAN BE SHOWN AGAIN.
//
// Sofia resolved two pins on v2 and then could not check what she had closed:
// "Once resolved they are gone from view." Measured in ArtifactView: a quiet
// "2 resolved" line opened the cards, but pinsToDraw left every resolved pin
// off the picture unless it was the one picked. "Show resolved" now opens the
// cards and draws their pins, greyed.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import { pinsToDraw } from '../renderer/src/artifact-pins.ts';

const note = (id, resolved) => ({ id, file: 'f', place: { kind: 'pin', x: 0.5, y: 0.5 }, text: 't', by: 'a', at: 1, ...(resolved ? { resolved: true } : {}) });

describe('pins on the picture', () => {
  it('leaves resolved pins off by default', () => {
    expect(pinsToDraw([note('a', false), note('b', true)], [], null).map((p) => p.id)).toEqual(['a']);
  });
  it('draws them, marked settled, when resolved are shown', () => {
    const drawn = pinsToDraw([note('a', false), note('b', true)], [], null, { resolved: true });
    expect(drawn.map((p) => [p.id, p.settled])).toEqual([['a', false], ['b', true]]);
  });
  it('still draws a picked resolved pin', () => {
    expect(pinsToDraw([note('b', true)], [], 'b').map((p) => p.id)).toEqual(['b']);
  });
});

it('the list says Show resolved and the stage is told', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
  expect(view).toMatch(/Show resolved/);
  expect(view).toMatch(/Hide resolved/);
  expect(view).toMatch(/showResolved=\{showSettled\}/);
});
