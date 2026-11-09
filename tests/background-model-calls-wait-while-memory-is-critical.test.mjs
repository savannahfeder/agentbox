// BACKGROUND MODEL CALLS WAIT WHILE MEMORY IS CRITICAL.
//
// What broke (w-8918e86ce0, 2026-11-08): measured on a browser copy of the app
// with a store of 540 threads nobody had named, the app started the Codex CLI
// every 7.5 seconds for three minutes, each run about 11 s and about 215 MB,
// to write a name for a row. Naming, sorting a teammate's message by urgency
// and rewriting an imported chat are tidying: nothing waits on them. They went
// ahead whatever the Mac's memory said, so on a Mac already swapping hard each
// one was another 200 to 300 MB process. Now they wait while the reading is
// critical, without counting a miss, and go ahead the moment it is not.
// Routing a message with Auto is not tidying and is left alone.
import { describe, it, expect, vi } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';
import { SWAP_CRITICAL_MBPS } from '../main/memory-gate.mts';
import { STALE_MS } from '../main/start-hold.mts';

const NOW = 1_800_000_000_000;
const row = { id: 'w-aaaaaaaaaa', product: 'p', status: 'open', title: 'I have been thinking about the inbox and', body: 'x', updatedAt: NOW - 1000 };

function standIn(reading) {
  const asked = vi.fn(async () => '');
  const self = Object.create(Supervisor.prototype);
  Object.assign(self, { _memReading: reading, _askSmall: asked, store: { nameItem() {}, listProducts: () => [] } });
  return { self, asked };
}

describe('naming a row', () => {
  it('waits while the Mac swaps hard, and does not count it as a miss', async () => {
    const { self, asked } = standIn({ level: 1, freePct: 40, swapInMbps: SWAP_CRITICAL_MBPS, at: NOW });
    expect(self.nameTheRows([row], NOW)).toBeUndefined();
    expect(asked).not.toHaveBeenCalled();
    expect(self._nameMisses?.size ?? 0).toBe(0);
    // The reading eases: the same row is named on the next tick.
    self._memReading = { level: 1, freePct: 40, swapInMbps: 1, at: NOW };
    await self.nameTheRows([row], NOW);
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('waits on the kernel\'s own critical too', () => {
    const { self, asked } = standIn({ level: 4, freePct: 40, at: NOW });
    self.nameTheRows([row], NOW);
    expect(asked).not.toHaveBeenCalled();
  });

  it('goes ahead while memory is only tight, which a 16 GB Mac reads all day', async () => {
    const { self, asked } = standIn({ level: 2, freePct: 30, swapInMbps: SWAP_CRITICAL_MBPS - 0.1, at: NOW });
    await self.nameTheRows([row], NOW);
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('goes ahead on a reading too old to trust, or none', async () => {
    const stale = standIn({ level: 4, freePct: 2, at: NOW - STALE_MS - 1 });
    await stale.self.nameTheRows([row], NOW);
    expect(stale.asked).toHaveBeenCalledTimes(1);
    const none = standIn(null);
    await none.self.nameTheRows([row], NOW);
    expect(none.asked).toHaveBeenCalledTimes(1);
  });
});

it('sorting a teammate\'s message and catching up an import wait the same way', () => {
  const source = Supervisor.prototype;
  for (const name of ['nameTheRows', 'sortTheMessages', 'catchUpTheImports']) {
    expect(String(source[name])).toMatch(/this\._memoryCritical\(/);
  }
  // Routing is how a message reaches someone, so it never waits on tidying's rule.
  expect(String(source.routeTheThreads)).not.toMatch(/_memoryCritical/);
});
