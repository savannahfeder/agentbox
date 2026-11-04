// A SHIP TAKES ITS TURN AT THE MEMORY CHECK.
//
// On 2026-10-30 a 16 GB Mac swapping 14 GB showed vitest workers at 604, 522 and
// 496 MB from a ship's push. The memory check (main/memory-gate.mts) holds heavy
// commands back and judges each by what it measured, but a ship ran its script
// straight from the app (main/ship-queue.mts) and its tests from a git hook, and
// neither is an agent's shell command, so the check never saw them. A cap on
// workers was tried first and turned down: "certain actions cost memory and we'd
// built a decent system for that". So a ship asks for a slot like any heavy
// command, and holds it until it ends.
import { describe, it, expect } from 'vitest';
import { MemoryGate } from '../main/memory-gate.mts';
import { CommandHistory } from '../main/memory-gate-history.mts';
import { shipSlot } from '../main/ship-queue.mts';

const item = { id: 'w-ship', product: 'p' };
function setup(opts = {}) {
  let now = 1000;
  const gate = new MemoryGate({ slots: 1, history: new CommandHistory(), clock: () => now, ...opts });
  return { gate, later: (ms) => { now += ms; gate.tick(); } };
}
const ready = async (p) => { let done = false; p.then(() => { done = true; }); await new Promise((r) => setTimeout(r, 5)); return done; };

describe('a ship and the memory check', () => {
  it('with a slot free it goes at once, and holds the slot while it runs', async () => {
    const { gate } = setup();
    const release = await shipSlot(gate, item);
    expect(gate.running.size).toBe(1);
    gate.submit({ id: 'test-run', command: 'npm test' }, () => {});
    expect(gate.waiting.size).toBe(1);
    release();
    expect(gate.running.has('test-run')).toBe(true);
  });

  it('with every slot taken by a heavy command it waits until one comes free', async () => {
    const { gate } = setup();
    gate.submit({ id: 'build', command: 'npm run build' }, () => {});
    const turn = shipSlot(gate, item);
    expect(await ready(turn)).toBe(false);
    gate.finish('build');
    expect(await ready(turn)).toBe(true);
  });

  it('while memory is tight it waits, and goes when memory comes back', async () => {
    const { gate } = setup();
    gate.setPressure('tight');
    const turn = shipSlot(gate, item);
    expect(await ready(turn)).toBe(false);
    gate.setPressure('normal');
    expect(await ready(turn)).toBe(true);
  });

  it('told no, it says so and asks again, rather than running its tests into short memory', async () => {
    const { gate, later } = setup();
    gate.setPressure('critical');
    let said = 0;
    const turn = shipSlot(gate, item, 0, { turns: 3, onWait: () => { said += 1; } });
    expect(await ready(turn)).toBe(false);
    later(gate.maxWaitMs + 1);
    expect(await ready(turn)).toBe(false);
    expect(said).toBe(1);
    gate.setPressure('normal');
    expect(await ready(turn)).toBe(true);
    (await turn)();
    expect(gate.running.size).toBe(0);
  });

  it('it never waits for ever: after its last turn it goes anyway', async () => {
    const { gate, later } = setup();
    gate.setPressure('critical');
    const turn = shipSlot(gate, item, 0, { turns: 2 });
    later(gate.maxWaitMs + 1);
    expect(await ready(turn)).toBe(false);
    later(gate.maxWaitMs + 1);
    expect(await ready(turn)).toBe(true);
  });

  it('with the memory check off, a ship simply runs', async () => {
    const release = await shipSlot(null, item);
    expect(() => release()).not.toThrow();
  });

  it('a second ship of one thread is its own turn, not the first one\'s', async () => {
    const { gate } = setup({ slots: 2 });
    const one = await shipSlot(gate, item);
    await shipSlot(gate, item);
    expect(gate.running.size).toBe(2);
    one();
    expect(gate.running.size).toBe(1);
  });
});
