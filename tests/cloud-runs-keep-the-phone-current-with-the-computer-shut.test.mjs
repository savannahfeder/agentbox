// Desktop-started cloud runs lost their phone indicator when the Mac stopped
// publishing snapshots. Exercise the server clock, completion and a newer run.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { cloudRunSnapshot } from '../cloud/gateway/phone-status.mjs';
import { supabaseRest } from '../cloud/gateway/phone.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const PHONE = { device: DEVICE, project: 'alpha', item: 'w-0123456789' };

async function setup({ objects = memoryObjects(), clock: initial = Date.UTC(2026, 9, 27), startAnswer = { ok: true }, statusReadError = false } = {}) {
  let clock = initial;
  const updates = [];
  const output = [];
  const published = [];
  let commandsRead = 0;
  const gw = createGateway({
    objects, now: () => clock, whoIs: async () => ({ id: OWNER }),
    plans: { test: { agents: 2, hoursPerMonth: 100 } },
    agentcore: { invoke: async (_s, p) => p.action === 'events' ? { ok: true, state: 'running', events: output.slice(p.since), more: false } : startAnswer, stop: async () => {} },
    links: { get: async () => 'https://files.example/file' },
    removeObject: async () => {},
    phone: { db: {
      cloudRuns: async () => { if (statusReadError) throw new Error('temporary status read failure'); return published; },
      runStatus: async (...args) => { updates.push(args); return true; },
      waitingReplies: async () => { commandsRead += 1; return []; }, waitingApprovals: async () => [], waitingWebTests: async () => [],
    }, runFiles: { get: async () => null } },
  });
  const device = await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer signed-in' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: OWNER, plan: 'test' });
  const call = (payload) => gw.handle({ method: 'POST', path: '/v1/invoke', headers: { authorization: `Bearer ${device.body.key}` }, body: JSON.stringify({ sessionId: `agentbox-${PHONE.item}-run-1`, payload }) });
  const stop = () => gw.handle({ method: 'POST', path: '/v1/stop', headers: { authorization: `Bearer ${device.body.key}` }, body: JSON.stringify({ sessionId: `agentbox-${PHONE.item}-run-1` }) });
  return { gw, updates, objects, call, stop, published, commandsRead: () => commandsRead, say: (...messages) => output.push({ kind: 'stdout', data: Buffer.from(messages.map(m => JSON.stringify(m) + '\n').join('')).toString('base64') }), now: () => clock, tick: (ms) => { clock += ms; } };
}

describe('the cloud owns the phone running indicator', () => {
  it('refreshes a desktop-started run after the Mac has been shut for an hour, then clears it on completion', async () => {
    const t = await setup();
    expect((await t.call({ action: 'start', runId: 'run-1', phone: PHONE })).status).toBe(200);
    t.tick(60 * 60_000);
    await t.gw.phoneSweep();
    expect(t.updates.at(-1)).toEqual([OWNER, PHONE, { runId: 'run-1', since: t.now() - 60 * 60_000, at: t.now() }]);
    await t.objects.put(`runs/u-${OWNER}/run-1/done.json`, '{}');
    await t.gw.phoneSweep();
    expect(t.updates.at(-1)).toEqual([OWNER, PHONE, { runId: 'run-1', since: t.now() - 60 * 60_000, at: null }]);
    const n = t.updates.length;
    await t.gw.phoneSweep();
    expect(t.updates).toHaveLength(n);
  });

  it('does not publish runs without a phone address or with a malformed one', async () => {
    const t = await setup();
    await t.call({ action: 'start', runId: 'run-1', phone: { ...PHONE, device: '../other' } });
    await t.gw.phoneSweep();
    expect(t.updates).toEqual([]);
    const u = await setup();
    await u.call({ action: 'start', runId: 'run-1' });
    await u.gw.phoneSweep();
    expect(u.updates).toEqual([]);
  });

  it('does not mark a refused cloud start as running', async () => {
    const t = await setup({ startAnswer: { ok: false, error: 'bad-start' } });
    await t.call({ action: 'start', runId: 'run-1', phone: PHONE });
    await t.gw.phoneSweep();
    expect(t.updates.filter((u) => u[2].at !== null)).toEqual([]);
  });

  it('keeps refreshing after the cloud server restarts', async () => {
    const t = await setup();
    await t.call({ action: 'start', runId: 'run-1', phone: PHONE });
    t.tick(60 * 60_000);
    const restarted = await setup({ objects: t.objects, clock: t.now() });
    await restarted.gw.phoneSweep();
    expect(restarted.updates.at(-1)).toEqual([OWNER, PHONE, { runId: 'run-1', since: t.now() - 60 * 60_000, at: t.now() }]);
  });

  it('clears a completed Codex turn while its process waits for another reply, then follows the next turn', async () => {
    const t = await setup();
    await t.call({ action: 'start', runId: 'run-1', phone: PHONE });
    t.say({ method: 'turn/started', params: {} });
    await t.gw.phoneSweep();
    expect(t.updates.at(-1)[2].at).toBe(t.now());
    t.say({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
    t.tick(60_000);
    await t.gw.phoneSweep();
    expect(t.updates.at(-1)[2].at).toBeNull();
    t.say({ method: 'turn/started', params: {} });
    t.tick(60_000);
    await t.gw.phoneSweep();
    expect(t.updates.at(-1)[2].at).toBe(t.now());
  });

  it('adopts running status when phone sharing becomes available after the cloud run started', async () => {
    const t = await setup();
    await t.call({ action: 'start', runId: 'run-1' });
    t.published.push({ owner: OWNER, ...PHONE, item: 'not-this-run', runId: 'run-1', since: t.now() });
    await t.gw.phoneSweep();
    expect(t.updates.filter((u) => u[2].at !== null)).toEqual([]);
    const u = await setup();
    await u.call({ action: 'start', runId: 'run-1' });
    u.tick(60 * 60_000);
    u.published.push({ owner: OWNER, ...PHONE, runId: 'run-1', since: u.now() - 60 * 60_000 });
    await u.gw.phoneSweep();
    expect(u.updates.at(-1)).toEqual([OWNER, PHONE, { runId: 'run-1', since: u.now() - 60 * 60_000, at: u.now() }]);
  });

  it('reads turn completion even when a large event page is returned through cloud storage', async () => {
    const t = await setup();
    await t.call({ action: 'start', runId: 'run-1', phone: PHONE });
    t.say({ method: 'turn/completed', padding: 'x'.repeat(4 * 1024 * 1024) });
    await t.gw.phoneSweep();
    expect(t.updates.at(-1)[2].at).toBeNull();
  });

  it('still checks phone commands when refreshing running status fails', async () => {
    const t = await setup({ statusReadError: true });
    await t.gw.phoneSweep();
    expect(t.commandsRead()).toBe(1);
  });

  it('clears a late Mac publication even after the run and its watcher have ended', async () => {
    const t = await setup();
    await t.call({ action: 'start', runId: 'run-1', phone: PHONE });
    await t.stop();
    await t.gw.phoneSweep();
    expect(await t.objects.list('ledger/phone/status/')).toEqual([]);
    t.updates.length = 0;
    t.published.push({ owner: OWNER, ...PHONE, runId: 'run-1', since: t.now() });
    await t.gw.phoneSweep();
    expect(t.updates).toEqual([[OWNER, PHONE, { runId: 'run-1', since: t.now(), at: null }]]);
  });
});

describe('running status cannot overwrite newer work', () => {
  const status = { runId: 'old-run', since: 100, at: 200 };
  it('keeps the answer and conversation while refreshing, and clears only its own run', () => {
    const snapshot = { item: { result: 'An answer' }, history: [{ text: 'Keep me' }], live: { runId: 'old-run', since: 100, doing: [] } };
    expect(cloudRunSnapshot(snapshot, status)).toMatchObject({ item: snapshot.item, history: snapshot.history, live: { where: 'cloud', at: 200 } });
    expect(cloudRunSnapshot(snapshot, { ...status, at: null })).toEqual({ item: snapshot.item, history: snapshot.history });
    const newer = { ...snapshot, live: { runId: 'new-run', since: 150, where: 'mac' } };
    expect(cloudRunSnapshot(newer, status)).toBeNull();
    expect(cloudRunSnapshot(newer, { ...status, at: null })).toBeNull();
  });

  it('guards database writes by owner, device and snapshot version, and retries a lost race', async () => {
    const calls = [];
    let conflict = true;
    const db = supabaseRest({ url: 'https://database.example', serviceKey: 'test-only', fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const result = init.method === 'GET' ? [{ snapshot: { item: { result: 'Keep' } }, updated_at: '2026-10-27T12:00:00Z' }] : conflict ? [] : [{}];
      return { ok: true, text: async () => JSON.stringify(result) };
    } });
    expect(await db.runStatus(OWNER, PHONE, status)).toBe(false);
    conflict = false;
    expect(await db.runStatus(OWNER, PHONE, status)).toBe(true);
    const patch = calls.find((c) => c.init.method === 'PATCH');
    expect(patch.url).toContain(`owner=eq.${OWNER}&device=eq.${DEVICE}&project=eq.alpha&item=eq.${PHONE.item}`);
    expect(patch.url).toContain('updated_at=eq.2026-10-27T12%3A00%3A00Z');
    expect(JSON.parse(patch.init.body).snapshot.item.result).toBe('Keep');
  });
});
