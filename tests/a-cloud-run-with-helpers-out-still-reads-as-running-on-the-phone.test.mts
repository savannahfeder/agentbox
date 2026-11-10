// A phone screenshot on 2026-10-30 showed "Nothing running" on a cloud thread
// whose agent was still at work. Its log has the agent answering a reply and
// ending its turn at 23:21:31 UTC, then a helper's edits carrying on from
// 23:21:34. The server's running stamp read every end of turn as the end of the
// work, so a helper out in the background could be drawn as nothing at all.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const PHONE = { device: 'a1b2c3d4e5f6', project: 'alpha', item: 'w-0123456789' };
const started = (id) => ({ type: 'system', subtype: 'task_started', task_id: id });
const updated = (id, status) => ({ type: 'system', subtype: 'task_updated', task_id: id, patch: { status } });
const turnEnds = { type: 'result', subtype: 'success', result: 'Will do.' };
const speaks = { type: 'assistant', message: { content: [] } };

async function run() {
  let clock = Date.UTC(2026, 9, 30);
  const updates = [];
  const output = [];
  const gw = createGateway({
    objects: memoryObjects(), now: () => clock, whoIs: async () => ({ id: OWNER }),
    plans: { test: { agents: 2, hoursPerMonth: 100 } },
    agentcore: { invoke: async (_s, p) => (p.action === 'events' ? { ok: true, state: 'running', events: output.slice(p.since), more: false } : { ok: true }), stop: async () => {} },
    links: { get: async () => 'https://files.example/file' },
    removeObject: async () => {},
    phone: { db: {
      cloudRuns: async () => [],
      runStatus: async (...args) => { updates.push(args); return true; },
      waitingReplies: async () => [], waitingApprovals: async () => [], waitingWebTests: async () => [],
    }, runFiles: { get: async () => null } },
  });
  const device = await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer signed-in' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: OWNER, plan: 'test' });
  await gw.handle({ method: 'POST', path: '/v1/invoke', headers: { authorization: `Bearer ${device.body.key}` }, body: JSON.stringify({ sessionId: `agentbox-${PHONE.item}-run-1`, payload: { action: 'start', runId: 'run-1', phone: PHONE } }) });
  // What the phone is told after the agent has said these things.
  return async (...messages) => {
    output.push(...messages.map((m) => ({ kind: 'stdout', data: Buffer.from(`${JSON.stringify(m)}\n`).toString('base64') })));
    clock += 60_000;
    await gw.phoneSweep();
    return updates.at(-1)[2].at;
  };
}

describe('a cloud run with helpers out reads as running on the phone', () => {
  it('stays running when the agent ends its turn with a helper still out, the reported case', async () => {
    const after = await run();
    await after(speaks, started('helper-1'));
    expect(await after(turnEnds)).not.toBeNull();
  });

  it('stays running across a sweep where the helper says nothing', async () => {
    const after = await run();
    await after(speaks, started('helper-1'), turnEnds);
    expect(await after()).not.toBeNull();
  });

  it('stays running while a second helper is still out after the first finished', async () => {
    const after = await run();
    await after(started('helper-1'), started('helper-2'), updated('helper-1', 'completed'));
    expect(await after(turnEnds)).not.toBeNull();
  });

  it('stops when the last helper is done and the agent ends its turn', async () => {
    const after = await run();
    await after(started('helper-1'), turnEnds);
    expect(await after(updated('helper-1', 'completed'), speaks, turnEnds)).toBeNull();
  });

  it('counts a helper that failed as finished', async () => {
    const after = await run();
    await after(started('helper-1'));
    expect(await after(updated('helper-1', 'failed'), turnEnds)).toBeNull();
  });

  it('keeps a helper counted while its update says it is still going', async () => {
    const after = await run();
    await after(started('helper-1'));
    expect(await after(updated('helper-1', 'in_progress'), turnEnds)).not.toBeNull();
  });

  it('stops at the end of a turn that never had a helper', async () => {
    const after = await run();
    await after(speaks);
    expect(await after(turnEnds)).toBeNull();
  });
});
