// A REPLY WHOSE RUN IS STILL BEING SET UP IS NOT A STOPPED AGENT.
//
// 2026-10-21: a thread read "Stopped" right after the person replied. The
// cloud run carrying the reply handed the thread back to this Mac and exited at
// 11:17:34; the run here spawned at 11:17:53. In between, the reply's delivery
// mark was already written and the app was making the thread's folder ready
// (`_preparing`: leftovers settling, the folder being restored, the checkout
// photographed), so no session existed yet. `status().stalled` read that as
// "a worker died on it" and the row said Stopped, the word for an agent that
// died and that nothing will retry. Measured off the run logs and the
// person's two screenshots, both timed by the row's "5 min ago".
import { describe, it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

const T = 1_792_606_358_625;

const replied = {
  id: 'w-3d0fa23ffb', product: 'team', status: 'open', kind: 'directive',
  labels: ['founder'], priority: 3,
  title: 'Multiplayer',
  answer: 'You can do that yourself; I give you full permission',
  createdAt: T - 90_000_000, updatedAt: T,
  wrote: { answer: { ts: T, source: 'founder' } },
};
const other = { ...replied, id: 'w-other', answer: 'and this one too' };

const build = (items) => new Supervisor(
  { storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 3, authProfiles: ['default'] },
  { listItems: () => items, listProducts: () => [], isDue: () => true },
  '/nonexistent-app',
);

// The queue writes the delivery mark before the spawn; this is that state.
const delivered = (sup, item) => sup._handledAnswers.add(sup._answerKey(item));
const preparing = (sup, item) => sup._preparing.set(item.id, { item, opts: { continuation: true }, engine: 'claude' });

describe('a reply whose run is being set up', () => {
  it('is not stopped while its folder is being made ready', () => {
    const sup = build([replied]);
    delivered(sup, replied);
    preparing(sup, replied);
    expect(sup.status().stalled).not.toContain(replied.id);
  });

  it('reads as waiting its turn instead', () => {
    const sup = build([replied]);
    delivered(sup, replied);
    preparing(sup, replied);
    expect(sup.status().queued).toContain(replied.id);
  });

  it('is neither once its run has started', () => {
    const sup = build([replied]);
    delivered(sup, replied);
    sup.sessions.set(replied.id, { itemId: replied.id, product: replied.product, tail: [], startedAt: T });
    const s = sup.status();
    expect(s.stalled).not.toContain(replied.id);
    expect(s.queued).not.toContain(replied.id);
  });
});

describe('a reply nothing is setting up', () => {
  it('still reads stopped when its run died', () => {
    const sup = build([replied]);
    delivered(sup, replied);
    expect(sup.status().stalled).toContain(replied.id);
    expect(sup.status().queued).not.toContain(replied.id);
  });

  it('is not hidden by another row being set up', () => {
    const sup = build([replied, other]);
    delivered(sup, replied);
    delivered(sup, other);
    preparing(sup, other);
    const s = sup.status();
    expect(s.stalled).toContain(replied.id);
    expect(s.stalled).not.toContain(other.id);
  });

  it('is not queued while the fleet is paused', () => {
    const sup = build([replied]);
    delivered(sup, replied);
    preparing(sup, replied);
    sup.paused = true;
    expect(sup.status().queued).toEqual([]);
  });
});
