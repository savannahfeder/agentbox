// Weekly security audit, 2026-11-16. A team trial gives each member 50 cloud
// hours, "the trial's, once", but the gateway kept trial use per team id and
// opened the trial from the team's created_at. Any signed-in account may leave
// its team and make a new one, so each new team was a fresh trial. Measured
// with the real gateway and the real migrations in PGlite: one free account
// got three full 50-hour trials from three teams it made in turn.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const HOUR = 60 * 60_000;
const START = Date.UTC(2026, 10, 17, 9);

// Each team's trial is a week given by hand, the only one without a card since 2026-11-21.
const WEEK = TEAM.trialDays * 24 * HOUR;

function setup() {
  let clock = START;
  let team = { id: 'team-1', createdAt: START, freeUntil: START + WEEK, members: [A], owners: [A] };
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => `https://b/${k}`, put: async (k: string) => `https://b/${k}`, head: async (k: string) => `https://b/${k}` },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t: string) => (t === 'session-a' ? { id: A } : null),
    teams: async () => team,
    now: () => clock,
    plans: PLANS,
  });
  let key = '';
  const call = async (method: string, path: string, body?: unknown) => {
    key ||= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}` }, body: body ? JSON.stringify(body) : '' });
  };
  let n = 0;
  return {
    start: async () => { n += 1; return (await call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'start', runId: `r${n}` } })).body; },
    finishAll: async () => { for (let i = 1; i <= n; i++) await gw.objectCreated(`runs/u-${A}/r${i}/done.json`); },
    later: (ms: number) => { clock += ms; },
    newTeam: (id: string) => { team = { id, createdAt: clock, freeUntil: clock + WEEK, members: [A], owners: [A] }; },
  };
}

describe("a person's free team-trial hours come once, whatever team they make", () => {
  it('spends the trial on one team, then gets none on a team made afterwards', async () => {
    const g = setup();
    const runs = Math.ceil(TEAM.trialHoursPerMember / 7);
    for (let i = 0; i < runs; i++) expect((await g.start()).ok).not.toBe(false);
    g.later(8 * HOUR);
    await g.finishAll();
    expect((await g.start())).toMatchObject({ error: 'hours' });

    g.later(2 * HOUR);
    g.newTeam('team-2');
    expect((await g.start())).toMatchObject({ error: 'hours' });
  });

  it('a team made before the trial is spent still has what is left of it', async () => {
    const g = setup();
    expect((await g.start()).ok).not.toBe(false);
    g.later(HOUR);
    await g.finishAll();
    g.newTeam('team-2');
    expect((await g.start()).ok).not.toBe(false);
  });
});
