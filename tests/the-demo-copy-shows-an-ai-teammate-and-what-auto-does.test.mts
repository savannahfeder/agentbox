// On the Nov 23 onboarding call the founder explained AI teammates (Auto offers
// one for work that comes back, then sends later work to it) and went to show
// one, and "it's not showing up in the demo environment": the demo store had no
// teammate and no thread Auto had decided, and the switch was off. Seeded store
// read back here: one teammate at work, a thread Auto gave it waiting on you, a
// thread where Auto offers a second, and nothing that wakes it on a call.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEMO_ACCOUNT, demoPaths, seedDemoStore } from '../main/demo.mts';
import { readChat, readTeammates, teamDir } from '../main/store/teammates-files.mts';
import { foldWorkItems } from '../shared/work-items.mts';
import { planWakes, teammateIdOf } from '../shared/teammates.mts';
import { DEMO_AI_TEAMMATE } from '../shared/demo-world.mts';

const made: string[] = [];
afterEach(() => { while (made.length) fs.rmSync(made.pop()!, { recursive: true, force: true }); });

function seeded(now: number) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-mate-'));
  made.push(home);
  const { products } = seedDemoStore(home, { now });
  const { storeRoot } = demoPaths(home);
  const items = products.flatMap((p) => {
    const lines = fs.readFileSync(path.join(p.machinery, 'work-items.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return [...foldWorkItems(lines, now).values()].map((i) => ({ ...i, product: p.slug }));
  });
  const dir = teamDir(storeRoot, DEMO_ACCOUNT);
  return { items, dir, home, products };
}

// A Tuesday, before the teammate's 9:00 round and after it.
const BEFORE_ROUND = new Date(2026, 10, 24, 8, 50).getTime();
const AFTER_ROUND = new Date(2026, 10, 24, 14, 0).getTime();

describe('the demo copy has an AI teammate', () => {
  it('one, at work on Shuttle, made from a starter', () => {
    const { dir } = seeded(AFTER_ROUND);
    const team = readTeammates(dir, AFTER_ROUND);
    expect(team.map((t) => [t.id, t.name, t.status, t.product, t.paused])).toEqual([[DEMO_AI_TEAMMATE.id, 'Quality lead', 'active', 'shuttle', false]]);
    expect(team[0].works).toEqual({ every: 'weekday', at: '09:00' });
  });

  it('a thread Auto gave it, answered and waiting on you', () => {
    const { items } = seeded(AFTER_ROUND);
    const theirs = items.filter((i) => teammateIdOf(i) === DEMO_AI_TEAMMATE.id);
    const waiting = theirs.filter((i) => i.status === 'open');
    expect(waiting).toHaveLength(1);
    expect(waiting[0].routed).toMatchObject({ to: `mate:${DEMO_AI_TEAMMATE.id}`, by: 'auto' });
    expect(waiting[0].result).toMatch(/## Options/);
    expect(theirs.filter((i) => i.status === 'done')).toHaveLength(1);
  });

  it('a thread an agent took, where Auto offers to make a teammate for it', () => {
    const { items } = seeded(AFTER_ROUND);
    const offered = items.filter((i) => i.routed?.offer);
    expect(offered).toHaveLength(1);
    expect(offered[0]).toMatchObject({ status: 'open', routed: { to: 'agent', offer: { role: 'Support lead' } } });
    expect(offered[0].routed!.offer!.answered).toBeUndefined();
    expect(offered[0].routed!.offer!.gains).toHaveLength(3);
    expect(teammateIdOf(offered[0])).toBeNull();
  });

  it('its words in the team chat', () => {
    const { dir } = seeded(AFTER_ROUND);
    const said = readChat(dir).messages.filter((m) => m.kind === 'msg' && m.from === DEMO_AI_TEAMMATE.id);
    expect(said.length).toBeGreaterThanOrEqual(2);
  });
});

describe('nothing of it starts an agent while the demo is on a screen', () => {
  for (const [when, at] of [['seeded before its round', BEFORE_ROUND], ['seeded after its round', AFTER_ROUND]] as const) {
    it(`${when}, through the next round`, () => {
      const { dir, items } = seeded(at);
      const teammates = readTeammates(dir, at);
      const chat = readChat(dir);
      for (const later of [at, at + 3_600_000, at + 4 * 3_600_000]) {
        const runs = planWakes({ teammates, chat, items, now: later }).filter((a) => a.type === 'run');
        expect(runs, new Date(later).toString()).toEqual([]);
      }
    });
  }

  it('but the round after that is its own again, as for anyone', () => {
    const { dir, items } = seeded(AFTER_ROUND);
    const dayAfter = new Date(2026, 10, 26, 9, 30).getTime();
    const runs = planWakes({ teammates: readTeammates(dir, dayAfter), chat: readChat(dir), items, now: dayAfter }).filter((a) => a.type === 'run');
    expect(runs).toHaveLength(1);
  });

});
