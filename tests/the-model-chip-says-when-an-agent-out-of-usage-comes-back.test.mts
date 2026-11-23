// THE MODEL CHIP SAYS WHEN AN AGENT OUT OF USAGE COMES BACK.
//
// The first try put a full sentence and a link under the words, and it read as
// clutter. The design picked instead puts a gauge and the reset ("Sun 6:10pm")
// on the model chip, in Home's box and in a thread's reply box. And the bar must
// never wrap: as it narrows, Send's keys go before the reset time does.
import { describe, it, expect } from 'vitest';
import { outOfUsageWhen } from '../renderer/src/compose-says';
import { DROP_ORDER, dropRank } from '../renderer/src/threads/fit-row';

const NOW = new Date(2026, 10, 11, 10, 0, 0).getTime();

describe('the words on the chip', () => {
  it('is the day and the hour when the reset is not today', () => {
    expect(outOfUsageWhen({ tool: 'Codex', until: new Date(2026, 10, 15, 18, 10).getTime() }, NOW)).toBe('Sun 6:10pm');
  });
  it('is the hour alone when it is today', () => {
    expect(outOfUsageWhen({ tool: 'Codex', until: new Date(2026, 10, 11, 18, 10).getTime() }, NOW)).toBe('6:10pm');
  });
  it('says Out when nobody said when it comes back', () => {
    expect(outOfUsageWhen({ tool: 'Codex', until: 0 }, NOW)).toBe('Out');
  });
  it('says nothing when the agent has room or its reset has passed', () => {
    expect(outOfUsageWhen(null, NOW)).toBeNull();
    expect(outOfUsageWhen({ tool: 'Codex', until: NOW - 1 }, NOW)).toBeNull();
  });
});

describe('a narrow bar', () => {
  it("hides Send's keys before the reset time, and the time before the model", () => {
    expect(DROP_ORDER).toContain('out-when');
    expect(dropRank('send-keys')).toBeLessThan(dropRank('out-when'));
    expect(dropRank('out-when')).toBeLessThan(dropRank('model'));
  });
});
