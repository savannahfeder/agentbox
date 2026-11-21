// The demo copy opened on the welcome screen, not on its invented inbox
// (2026-11-21, measured by opening one in the browser copy: its snapshot held
// one project, My Workspace, and no rows). The demo seeds its products under a
// fixed account id, and since the config began minting a random id per install
// the copy looked in a folder of its own that nothing was written to.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../main/config.mts';
import { DEMO_ACCOUNT, demoPaths, seedDemoStore } from '../main/demo.mts';
import { DEMO_ENV } from '../shared/demo-world.mts';

const made: string[] = [];
const dir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-account-')); made.push(d); return d; };
afterEach(() => { while (made.length) fs.rmSync(made.pop()!, { recursive: true, force: true }); });

describe('a demo copy reads the account its store was seeded under', () => {
  it('takes the demo account when it has no config file', () => {
    const home = dir();
    const config = loadConfig(dir(), { home, env: { [DEMO_ENV]: '1' } });
    expect(config.accountId).toBe(DEMO_ACCOUNT);
    expect(config.accountRoot).toBe(demoPaths(home).accountRoot);
  });

  it('finds every seeded product in that account', () => {
    const home = dir();
    seedDemoStore(home);
    const config = loadConfig(dir(), { home, env: { [DEMO_ENV]: '1' } });
    expect(fs.readdirSync(config.accountRoot).length).toBeGreaterThan(0);
  });

  it('leaves an id already in the config alone', () => {
    const appDir = dir();
    fs.writeFileSync(path.join(appDir, 'zero.config.json'), JSON.stringify({ accountId: 'kept' }));
    expect(loadConfig(appDir, { home: dir(), env: { [DEMO_ENV]: '1' } }).accountId).toBe('kept');
  });

  it('and a copy that is not a demo still gets an id of its own', () => {
    const config = loadConfig(dir(), { home: dir(), env: {} });
    expect(config.accountId).not.toBe(DEMO_ACCOUNT);
    expect(config.accountId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
