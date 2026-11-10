// A DOWN CONNECTION IS TRIED AGAIN ON ITS OWN, UNTIL A DEADLINE, AND SAYS WHEN IT IS BACK.
//
// What broke (2026-10-31): the tracker read "Temporarily down" for
// three hours with no time on it. Nothing tried it again unless somebody
// pressed Check now, and three people pressed it over and over; nothing said
// when it came back. Measured here on the fixture: `since` holds the first
// failure through later ones, a background check runs on its schedule and
// stops at its deadline, and a recovery files one row in Needs you.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';
import { createConnections, nextTryAt, RETRY_FOR_MS, RETRY_STEPS_MS } from '../main/connections/index.mts';
import { recoveryProduct, recoveryRow } from '../main/connections/start.mts';
import { catalogFor, STATES } from '../shared/connections-catalog.mts';

const key = crypto.randomBytes(32);
const cipher = {
  available: () => true,
  encrypt: (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); const out = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), out]); },
  decrypt: (b) => { const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); },
};
const browser = async (url) => {
  const allowed = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000) });
  await fetch(allowed.headers.get('location'), { signal: AbortSignal.timeout(5000) });
};
const MIN = 60_000;

let fx; let dir; const made = [];
const service = (opts = {}) => {
  const c = createConnections({ vaultFile: path.join(dir, 'c.enc'), cipher, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }), openExternal: browser, ...opts });
  made.push(c);
  return c;
};
beforeEach(async () => { fx = await startToolsFixture(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-retry-')); });
afterEach(async () => { for (const c of made.splice(0)) await c.stop(); await fx.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
const tile = async (c) => (await c.list()).tiles.find((t) => t.id === 'test-tracker');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the schedule', () => {
  const T0 = 1_800_000_000_000;
  it('tries after 1, 2, 5, 10, 15 and 30 minutes, then every 30', () => {
    expect(RETRY_STEPS_MS).toEqual([1, 2, 5, 10, 15, 30].map((m) => m * MIN));
    expect(nextTryAt({ state: 'down', since: T0, at: T0, tries: 1 })).toBe(T0 + MIN);
    expect(nextTryAt({ state: 'down', since: T0, at: T0 + MIN, tries: 2 })).toBe(T0 + 3 * MIN);
    expect(nextTryAt({ state: 'down', since: T0, at: T0 + 2 * 3600_000, tries: 12 })).toBe(T0 + 2 * 3600_000 + 30 * MIN);
  });

  it('stops at the deadline, eight hours after it went down', () => {
    expect(RETRY_FOR_MS).toBe(8 * 3600_000);
    expect(nextTryAt({ state: 'down', since: T0, at: T0 + RETRY_FOR_MS - 30 * MIN, tries: 20 })).toBe(T0 + RETRY_FOR_MS);
    expect(nextTryAt({ state: 'down', since: T0, at: T0 + RETRY_FOR_MS - 29 * MIN, tries: 20 })).toBeNull();
  });

  it('tries nothing that waiting cannot fix, or that works', () => {
    for (const state of ['works', 'unreachable', 'not_signed_in', 'not_allowed', 'nothing_to_read']) {
      expect(nextTryAt({ state, since: T0, at: T0, tries: 1 })).toBeNull();
    }
    expect(nextTryAt(undefined)).toBeNull();
  });
});

describe('since when, and when next', () => {
  it('since is the first failure, however many follow, and the tile says when it tries next', async () => {
    let clock = Date.now();
    const conn = service({ now: () => clock });
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    const first = await conn.check('test-tracker');
    expect(first.since).toBe(clock);
    expect(first.nextTryAt).toBe(clock + MIN);
    const wentDown = clock;
    clock += 4 * MIN;
    const second = await conn.check('test-tracker');
    expect(second.since).toBe(wentDown);
    expect(second.at).toBe(clock);
    expect(second.nextTryAt).toBe(clock + 2 * MIN);
  });

  it('past the deadline the tile says it stopped trying, and when', async () => {
    let clock = Date.now();
    const conn = service({ now: () => clock });
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    await conn.check('test-tracker');
    const wentDown = clock;
    clock += RETRY_FOR_MS;
    const t = await conn.check('test-tracker');
    expect(t.nextTryAt).toBeNull();
    expect(t.stoppedTryingAt).toBe(wentDown + RETRY_FOR_MS);
  });

  it('a tile that works carries no next try', async () => {
    const conn = service();
    await conn.connect('test-tracker');
    expect((await tile(conn)).nextTryAt).toBeNull();
    expect((await tile(conn)).stoppedTryingAt).toBeNull();
  });
});

describe('the background check', () => {
  it('runs by itself, finds it back, and then stops', async () => {
    const conn = service({ retrySteps: [60], retryFor: 60_000 });
    await conn.connect('test-tracker');
    let checks = 0;
    const real = conn.check;
    conn.check = (id) => { checks += 1; return real(id); };
    fx.switches.errors = true;
    await real('test-tracker');
    conn.startRetrying();
    await wait(250);
    expect(checks).toBeGreaterThan(0);
    expect((await tile(conn)).state).toBe(STATES.DOWN);
    fx.switches.errors = false;
    for (let i = 0; i < 40 && (await tile(conn)).state !== STATES.WORKS; i += 1) await wait(25);
    expect((await tile(conn)).state).toBe(STATES.WORKS);
    const after = checks;
    await wait(250);
    expect(checks).toBe(after);
  });

  it('gives up at its deadline', async () => {
    const conn = service({ retrySteps: [40], retryFor: 200 });
    await conn.connect('test-tracker');
    let checks = 0;
    const real = conn.check;
    conn.check = (id) => { checks += 1; return real(id); };
    fx.switches.errors = true;
    await real('test-tracker');
    conn.startRetrying();
    await wait(600);
    const settled = checks;
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThan(8);
    await wait(300);
    expect(checks).toBe(settled);
  });

  it('stops with the app', async () => {
    const conn = service({ retrySteps: [60], retryFor: 60_000 });
    await conn.connect('test-tracker');
    let checks = 0;
    const real = conn.check;
    conn.check = (id) => { checks += 1; return real(id); };
    fx.switches.errors = true;
    await real('test-tracker');
    conn.startRetrying();
    await conn.stop();
    await wait(200);
    expect(checks).toBe(0);
  });
});

describe('when it works again', () => {
  it('says so once, with since when it was out', async () => {
    let clock = Date.now();
    const back = [];
    const conn = service({ now: () => clock, onRecovered: (b) => back.push(b) });
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    await conn.check('test-tracker');
    const wentDown = clock;
    clock += 10 * MIN;
    await conn.check('test-tracker');
    fx.switches.errors = false;
    clock += 10 * MIN;
    await conn.check('test-tracker');
    await conn.check('test-tracker');
    expect(back).toEqual([{ id: 'test-tracker', name: 'Test tracker', since: wentDown, at: clock, before: true }]);
  });

  it('an agent\'s read that works counts as back', async () => {
    let clock = Date.now();
    const back = [];
    const conn = service({ now: () => clock, onRecovered: (b) => back.push(b) });
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    await conn.check('test-tracker');
    clock += 10 * MIN;
    await conn._noteRead('test-tracker');
    expect(back).toHaveLength(1);
  });

  it('a blip of a minute files nothing', async () => {
    let clock = Date.now();
    const back = [];
    const conn = service({ now: () => clock, onRecovered: (b) => back.push(b) });
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    await conn.check('test-tracker');
    clock += MIN;
    fx.switches.errors = false;
    await conn.check('test-tracker');
    expect(back).toEqual([]);
  });

  it('the row in Needs you names the tool and the times', () => {
    const now = new Date(2026, 9, 31, 9, 50).getTime();
    const row = recoveryRow({ name: 'Test tracker', since: new Date(2026, 9, 31, 6, 5).getTime(), at: new Date(2026, 9, 31, 9, 44).getTime(), before: true }, now);
    expect(row.title).toBe('Test tracker works again');
    expect(row.problem).toBe('Test tracker was out from 6:05am and answered at 9:44am.');
    expect(row.body).not.toContain(row.problem);
    expect(recoveryRow({ name: 'Linear', since: now, at: now, before: false }, now).title).toBe('Linear works now');
  });

  it('goes to the project a run last met it in, or the first that is not a chat', () => {
    const store = { listProducts: () => [{ slug: 'dm-dev', team: { direct: true } }, { slug: 'lumen' }, { slug: 'web' }] };
    expect(recoveryProduct(store, 'web')).toBe('web');
    expect(recoveryProduct(store, 'gone')).toBe('lumen');
    expect(recoveryProduct(store, null)).toBe('lumen');
    expect(recoveryProduct({ listProducts: () => [] }, null)).toBeNull();
  });

  it('is wired: the app files it with fileItem, which waits in Needs you', () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../main/connections/start.mts'), 'utf8');
    expect(src).toMatch(/onRecovered:[\s\S]*supervisor\.store\.fileItem\(slug, recoveryRow\(back\)\)/);
    expect(src).toMatch(/connections\.startRetrying\(\)/);
  });
});
