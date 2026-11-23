// A CLOUD RUN'S PICTURE SHOWS WITHIN SECONDS OF LANDING.
//
// What was slow: a cloud run's answer names its pictures before they reach the
// Mac; the run's documents come back every 10 s (DOCS_EVERY_MS in
// main/cloud/run.mts). A picture that was not there yet looked again only 5,
// 15, 35, 75 and 155 s after the miss (renderer/src/picture-looks-again.ts), so
// one landing at 16 s showed at 35 s and one landing at 76 s showed at 155 s.
// Measured by walking the schedule: up to 80 s between landing and showing.
import { describe, it, expect } from 'vitest';
import { lookAgainAfter } from '../renderer/src/picture-looks-again.ts';

function looks() {
  const at = [];
  let t = 0;
  for (let tries = 0; lookAgainAfter(tries) !== null; tries += 1) { t += lookAgainAfter(tries); at.push(t); }
  return at;
}
const shownAfter = (landed) => looks().find((t) => t >= landed) - landed;

describe('a picture that lands after its message', () => {
  it('shows within 2 s while the run is in its first half minute', () => {
    for (let landed = 0; landed <= 30_000; landed += 500) expect(shownAfter(landed)).toBeLessThanOrEqual(2_000);
  });

  it('shows within 5 s up to two minutes after the miss', () => {
    for (let landed = 30_000; landed <= 120_000; landed += 500) expect(shownAfter(landed)).toBeLessThanOrEqual(5_000);
  });

  it('stops looking that often after two minutes, and still stops in the end', () => {
    const at = looks();
    expect(at.filter((t) => t > 120_000 && t <= 300_000).length).toBeLessThanOrEqual(10);
    expect(at.length).toBeLessThan(80);
  });
});
