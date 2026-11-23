// A THREAD ITS MODEL TURNS AWAY IS TOLD SO BEFORE A SLOT FREES.
//
// Test day 2026-11-18, cloud copy with only Codex: the tester picked an option
// on a thread set to Claude Code's opus at 19:55:54. Its sentence ("…would run
// it with Codex. Nothing has been done.") was written at 19:58:11; for those
// 2m17s it sat in In progress as "Nothing running" with Try again, because the
// tick's queue asked for room before it reached `spawnWorker`, the only place
// that says so, and every slot was busy. The refusal costs no slot, so it is
// now reached with the fleet full, and an ordinary row still waits.
import { it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';

const NOW = 1_795_031_754_000;
const answered = (id: string, extra = {}) => ({
  id, product: 'payments', status: 'open', kind: 'question', labels: ['founder'],
  priority: 5, answer: 'Option 1: Keep two (recommended)', createdAt: NOW - 60_000, updatedAt: NOW - 60_000,
  claim: null, claimExpired: false,
  wrote: { answer: { ts: NOW - 60_000, source: 'founder' } },
  ...extra,
});

function fullFleet(items: ReturnType<typeof answered>[]) {
  const sup = new Supervisor(
    { home: '/nonexistent-home-with-no-second-account', storeRoot: '/nonexistent-zero-root', codexBin: '/nonexistent/codex', engine: 'codex', maxConcurrentSessions: 2, authProfiles: ['default'] },
    { listItems: () => items, listProducts: () => [], isDue: () => true, settleAnswer() {} },
    '/nonexistent-app',
  );
  sup._enginesFound = () => ({ claude: false, codex: true });
  const reached: string[] = [];
  sup.spawnWorker = (item: { id: string }) => { reached.push(item.id); };
  for (let i = 0; i < 2; i += 1) sup.sessions.set(`w-busy-${i}`, { itemId: `w-busy-${i}`, product: 'payments', engine: 'codex' });
  return { sup, reached };
}

it('a reply on a thread set to opus, on a computer with only Codex, is turned away with every slot busy', async () => {
  const { sup, reached } = fullFleet([answered('w-pricing', { engine: 'claude', model: 'opus' })]);
  await sup.tick();
  expect(reached).toEqual(['w-pricing']);
});

it('a reply on a thread set to a Codex model still waits for a slot', async () => {
  const { sup, reached } = fullFleet([answered('w-ordinary', { engine: 'codex', model: 'gpt-6.1-sol' })]);
  await sup.tick();
  expect(reached).toEqual([]);
});
