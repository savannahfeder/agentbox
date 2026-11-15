// AFTER ALLOW, THE SHEET SAYS WHAT THE CHECK FOUND, AND A DOWN TILE SAYS SINCE WHEN.
//
// What broke (2026-10-31): after Allow the sheet went straight to a
// state word, so nobody knew whether the connection had ever worked ("after
// Allow, one test call, and a plain 'Connected: I can see 12 issues'"). A down
// tile said "Check again in a while" with no time of the last try and no word
// on whether the app would try by itself. Measured here on the words the page
// draws, from tiles a real check on the fixture made, and on the sheet's source.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';
import { createConnections } from '../main/connections/index.mts';
import { checkResultLine, stateLine, whenLine } from '../renderer/src/connections/connections-shown';
import { catalogFor, CHECK_LIMIT } from '../shared/connections-catalog.mts';

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
const at = (h, m) => new Date(2026, 9, 31, h, m).getTime();

let fx; let dir; let conn; let clock;
beforeEach(async () => {
  fx = await startToolsFixture();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-sheet-'));
  clock = at(6, 5);
  conn = createConnections({ vaultFile: path.join(dir, 'c.enc'), cipher, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }), openExternal: browser, now: () => clock });
});
afterEach(async () => { await conn.stop(); await fx.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('right after Allow', () => {
  it('says what the check read, counted', async () => {
    const out = await conn.connect('test-tracker');
    expect(checkResultLine(out.tile, 'connect', clock)).toBe('Connected, I can see 3 issues.');
  });

  it('one is one issue', async () => {
    await conn.connect('test-tracker');
    expect(checkResultLine({ ...(await conn.check('test-tracker')), seen: 1 }, 'connect', clock)).toBe('Connected, I can see 1 issue.');
  });

  it('a full page reads as at least, since the check asks for no more than that', async () => {
    const out = await conn.connect('test-tracker');
    expect(checkResultLine({ ...out.tile, seen: CHECK_LIMIT, seenAtLeast: true }, 'connect', clock)).toBe(`Connected, I can see at least ${CHECK_LIMIT} issues.`);
  });

  it('signed in but down: says so, with the time, not Connected alone', async () => {
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    const t = await conn.check('test-tracker');
    expect(checkResultLine(t, 'connect', clock)).toBe('Signed in, but it did not answer at 6:05am.');
  });

  it('signed in to the wrong address: says it could not reach its tools', async () => {
    const wrong = createConnections({ vaultFile: path.join(dir, 'w.enc'), cipher, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.url }, packaged: false }), openExternal: browser, now: () => clock });
    const out = await wrong.connect('test-tracker');
    expect(checkResultLine(out.tile, 'connect', clock)).toBe('Signed in, but it could not reach its tools.');
    await wrong.stop();
  });

  it('Check now answers with what it found and when', async () => {
    await conn.connect('test-tracker');
    expect(checkResultLine(await conn.check('test-tracker'), 'check', clock)).toBe('Works, I can see 3 issues.');
    fx.switches.errors = true;
    clock = at(6, 20);
    expect(checkResultLine(await conn.check('test-tracker'), 'check', clock)).toBe('It did not answer at 6:20am.');
    clock = at(6, 39);
    expect(checkResultLine(await conn.check('test-tracker'), 'check', clock)).toBe('Still down at 6:39am.');
  });

  it('the sheet shows it after Connect and after Check now', () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../renderer/src/connections/ConnectionsPlace.tsx'), 'utf8');
    expect(src).toMatch(/checkResultLine\(out\.tile, 'connect'/);
    expect(src).toMatch(/checkResultLine\(tile, 'check'|checkResultLine\(checked, 'check'/);
  });
});

describe('a down tile', () => {
  it('says since when on the tile itself', async () => {
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    await conn.check('test-tracker');
    clock = at(9, 14);
    const t = await conn.check('test-tracker');
    expect(stateLine(t, clock)).toBe('Down since 6:05am');
  });

  it('the sheet says when it last tried and when it tries again', async () => {
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    await conn.check('test-tracker');
    clock = at(9, 14);
    const t = await conn.check('test-tracker');
    expect(whenLine(t, clock)).toBe('Last tried 9:14am. Tries again by itself at 9:16am.');
  });

  it('past the deadline it says it stopped, and that Check now still tries', async () => {
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    await conn.check('test-tracker');
    clock = at(14, 30);
    const t = await conn.check('test-tracker');
    expect(whenLine(t, clock)).toBe('Last tried 2:30pm. Stopped trying by itself at 2:05pm, so Check now is the way to try again.');
  });

  it('a wrong address says when it was last tried and nothing about trying again', async () => {
    const t = { state: 'unreachable', word: 'Could not reach its tools', since: at(6, 5), at: at(9, 14), nextTryAt: null, stoppedTryingAt: null };
    expect(stateLine(t, at(9, 20))).toBe('Could not reach its tools');
    expect(whenLine(t, at(9, 20))).toBe('Since 6:05am. Last tried 9:14am.');
    expect(whenLine({ ...t, since: t.at }, at(9, 20))).toBe('Last tried 9:14am.');
    expect(checkResultLine({ ...t, things: null, seen: null }, 'check', at(9, 20))).toBeNull();
  });

  it('works and not connected carry no time line', () => {
    expect(whenLine({ state: 'works', at: at(9, 0) }, at(9, 5))).toBeNull();
    expect(whenLine({ state: 'not_connected', at: null }, at(9, 5))).toBeNull();
  });

  it('the old "Check again in a while" is gone', () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../shared/connections-catalog.mts'), 'utf8');
    expect(src).not.toMatch(/again in a while/i);
  });
});
