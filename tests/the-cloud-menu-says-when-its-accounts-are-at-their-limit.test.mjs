// THE CLOUD MENU SAYS WHEN ITS ACCOUNTS ARE AT THEIR LIMIT, AND UNTIL WHEN.
//
// What happened (2026-10-16, 8:13pm): she wrote "our cloud must be broken
// given only a few of my agents are running". Nothing was broken: both cloud
// accounts had hit their session limit at 7:01pm and were benched until
// 10:10pm (main/cloud/logins.mjs 'limited'), so every thread ran on the one
// free login on this Mac, five at a time, and fourteen waited. The menu said
// only "Nothing running in the cloud now".
//
// Now the menu's last line says the account is at its limit and when it comes
// back; otherwise it says what runs there. It asked for every account to be
// out until w-dac993a554, when the cloud stopped rotating.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudFootLine } from '../renderer/src/cloud-menu';

const at = (h, m) => { const d = new Date(2026, 9, 16, h, m, 0, 0); return d.getTime(); };
const now = at(20, 13);
// The app marks the one the cloud runs on (Supervisor#_cloudAccounts): here
// the first, as no account on this Mac is one of them.
const acct = (key, limitedUntil = null) => ({ engine: 'claude', key, name: null, ready: !limitedUntil, state: limitedUntil ? 'limited' : 'ready', limitedUntil, inUse: key === 'a' });
const cloud = (accounts, running = 0, mode = 'all') => ({ setUp: true, mode, whenOn: 'all', running, accounts, signIns: [], month: { runs: 0, agentHours: 0 } });

describe('the last line of the cloud menu', () => {
  // SAID IN THE SINGULAR, HOWEVER MANY ARE SIGNED IN (w-dac993a554): the cloud
  // runs on one account, so "your cloud accounts" was the menu promising a
  // rotation the cloud does not do.
  it('says the account is at its limit, and when the first comes back', () => {
    const line = cloudFootLine(cloud([acct('a', at(22, 10)), acct('b', at(22, 40))]), now);
    expect(line).toBe('Your cloud account is at its usage limit until 10:10pm. Threads wait for the cloud until then.');
  });

  // THE ACCOUNT IT RUNS ON, NOT ANY ACCOUNT (w-dac993a554). This read "while
  // any account can still run", which was the rotation: a second signed-in
  // login kept the cloud going. The cloud takes the first account and waits
  // for it, so a limit on that one is the whole story and the next login's
  // room is not an answer.
  it('says what runs there while the account it runs on can still run', () => {
    expect(cloudFootLine(cloud([acct('a'), acct('b', at(22, 40))], 2), now)).toBe('2 running in the cloud now');
    expect(cloudFootLine(cloud([acct('a')]), now)).toBe('Nothing running in the cloud now');
  });

  it('says the limit of the account it runs on, with a free login behind it', () => {
    expect(cloudFootLine(cloud([acct('a', at(22, 10)), acct('b')], 2), now))
      .toBe('Your cloud account is at its usage limit until 10:10pm. Threads wait for the cloud until then.');
  });

  it('forgets a limit that has passed, and says nothing of limits with the cloud off', () => {
    expect(cloudFootLine(cloud([acct('a', at(20, 0))]), now)).toBe('Nothing running in the cloud now');
    expect(cloudFootLine(cloud([acct('a', at(22, 10))], 0, 'mac'), now)).toBe('Nothing running in the cloud now');
  });

  it('is what the menu draws, and the app hands the screen each account\'s limit', () => {
    expect(fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8')).toMatch(/<span>\{cloudFootLine\(cloud\)\}<\/span>/);
    expect(fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8')).toMatch(/limitedUntil: r\.limitedUntil \?\? null/);
    expect(fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8')).toMatch(/inUse: r\.key === inUse/);
  });
});
