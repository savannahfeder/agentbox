// CLOSING A TASK WHOSE ONLY CHOICE IS "CLOSE THIS TASK" SAYS NOTHING ABOUT STUCK.
//
// Sofia, twice: pressing "1 Close this task" on the finished teaser
// thread, the agent's one choice, said "This agent is waiting on your answer,
// and marking it done leaves it stuck. Press again to go ahead." Dev hit the
// same on E. Measured with holdForStoppedAgent: a row whose live offer is the
// single option "Close this task" counted as stopped, so the first close was
// held. An agent whose only open choice is to close is asking to be closed;
// closing it leaves nothing stuck. The agent's own close, picked, is never held.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { holdForStoppedAgent, stoppedWaiting } from '../renderer/src/stopped-agent.ts';

const row = (options) => ({
  id: 'w-teaser', product: 'lumen',
  result: `The teaser is approved.\n\n## Options\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
  wrote: { result: { ts: 2000 } },
});
const hold = (r) => holdForStoppedAgent({ rows: [r], key: 'E', warned: false, walking: false });

describe('an offer of only closing', () => {
  it('"Close this task" alone is not an agent waiting', () => {
    expect(stoppedWaiting(row(['Close this task (recommended)']))).toBe(false);
    expect(hold(row(['Close this task']))).toBe(null);
  });

  it('a close with its reason, alone, is not either', () => {
    expect(stoppedWaiting(row(['Close this task, since both items are confirmed missing']))).toBe(false);
  });

  it('a close beside a real choice still waits: the other choice is work', () => {
    expect(stoppedWaiting(row(['Close this task', 'Redo the end card first']))).toBe(true);
    expect(hold(row(['Close this task', 'Redo the end card first']))).toBeTruthy();
  });

  it('a choice that only sounds like closing still waits', () => {
    expect(stoppedWaiting(row(['Close this task, then file the follow-up']))).toBe(true);
  });
});

describe('the wiring', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('the agent\'s own close, picked, goes past the warning', () => {
    expect(app).toMatch(/if \(closesTheTask\(option\.text\)\) \{ await markDone\(item, \{ chosen: true \}\)/);
    expect(app).toMatch(/if \(!chosen && nudgeOnStopped\(\[item\], 'E'\)\) return;/);
  });
});
