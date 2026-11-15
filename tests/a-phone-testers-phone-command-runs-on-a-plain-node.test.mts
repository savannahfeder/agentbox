// A PHONE TESTER'S `phone` COMMAND RUNS ON A PLAIN NODE.
//
// The workday writes each tester a `phone` script that runs phone.mjs on the
// node it was started with, with no flags. On 2026-11-09, on this Mac's node
// 22.14, every `phone` call died with ERR_UNKNOWN_FILE_EXTENSION on
// shared/hidden-browser.mts (loaded through verify-agentbox's cdp.mjs), so a
// whole workday's testers had no way to touch the app. Measured by running a
// tester's `phone look` from that day's folder.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PHONE = path.resolve('.claude/skills/product-loop/scripts/phone.mjs');

describe('phone.mjs run the way a tester runs it', () => {
  it('loads its .mts without the flags being passed', () => {
    const env = { ...process.env, NODE_OPTIONS: '' };
    delete env.PHONE_OUT; delete env.PHONE_URL;
    const ran = spawnSync(process.execPath, [PHONE, 'look'], { encoding: 'utf8', timeout: 60_000, env });
    expect(ran.stderr).not.toMatch(/ERR_UNKNOWN_FILE_EXTENSION/);
    expect(ran.stdout).toMatch(/No phone test is running/);
  });

  it('re-runs itself with the flags before it loads anything typed', () => {
    const src = fs.readFileSync(PHONE, 'utf8');
    const rerun = src.indexOf('rerunWithStripTypes(import.meta.url)');
    expect(rerun).toBeGreaterThan(0);
    expect(rerun).toBeLessThan(src.indexOf("await import(path.resolve(here, '../../verify-agentbox/scripts/cdp.mjs'))"));
  });
});
