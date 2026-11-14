// A POWER TEST RUNS ON A PLAIN NODE.
//
// On 2026-11-13 the daily test day ran `node .claude/skills/power-test/scripts/power-test.mjs`
// as the skill writes it, on this Mac's node 22.14, and it died with
// ERR_UNKNOWN_FILE_EXTENSION on shared/fresh-user-home.mts before any tester
// started. It imports live.mjs, whose .mts imports need the type-stripping
// flags, and live.mjs adds them only when it is the script being run. With
// that fixed, the tester's `app` command (browse.mjs) died the same way on
// shared/hidden-browser.mts, which it reaches through cdp.mjs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const POWER_TEST = path.resolve('.claude/skills/power-test/scripts/power-test.mjs');
const BROWSE = path.resolve('.claude/skills/verify-agentbox/scripts/browse.mjs');

describe('power-test.mjs run as the skill writes it', () => {
  it('gets past loading the app to read who is testing', () => {
    const ran = spawnSync(process.execPath, [POWER_TEST, '--who', 'nobody-in-the-pool'], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_OPTIONS: '' } });
    expect(ran.stderr).not.toMatch(/ERR_UNKNOWN_FILE_EXTENSION/);
    expect(ran.stderr).toMatch(/^power-test: /m);
  });

  it('re-runs itself with the flags before it imports live.mjs', () => {
    const source = fs.readFileSync(POWER_TEST, 'utf8');
    const rerun = source.indexOf('rerunWithStripTypes(import.meta.url)');
    expect(rerun).toBeGreaterThan(-1);
    expect(rerun).toBeLessThan(source.indexOf('await import(LIVE)'));
  });
});

describe("the tester's app command, browse.mjs, run as the tester's script writes it", () => {
  it('gets past loading the browser to answer in its own words', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'browse-'));
    const ran = spawnSync(process.execPath, [BROWSE, 'look'], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_OPTIONS: '', VERIFY_INSTANCE: `plain-node-${process.pid}`, BREAKER_OUT: out } });
    expect(ran.stderr).not.toMatch(/ERR_UNKNOWN_FILE_EXTENSION/);
    expect(ran.stdout + ran.stderr).toMatch(/No live copy is running/);
  });
});
