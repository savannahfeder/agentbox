// A THREAD RUN HERE BECAUSE THE CLOUD'S ACCOUNT IS OUT SAYS SO.
//
// Reported 2026-10-26 (w-ef0997d135): with the cloud set to Everything, the
// cloud's Claude account hit its usage limit and every thread sat "Queued".
// Since 7cdbfd2e those threads run on this Mac instead, and their Status cell
// says "Working locally" or "Queued", with a card saying why. Measured on a
// supervisor with the cloud's account at its limit: `_whyLocal` had no reason
// for it and answered 'other', so the card read "The cloud couldn't take it
// when it started", which does not say the limit is why.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { recordCloudLogin, markCloudLogin } from '../main/cloud/logins.mts';
import { forgetDiscovery } from '../main/account-discovery.mjs';
import { whyWords } from '../renderer/src/where-why.ts';

const dirs = [];
const noCloud = process.env.AGENTBOX_CLOUD_CONFIG;
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
  forgetDiscovery?.();
  process.env.AGENTBOX_CLOUD_CONFIG = noCloud;
});

// This Mac signed in to one Claude account, the cloud set to Everything, and
// that account signed in to the cloud too.
function setUp({ limitedFor = 3_600_000, inCloud = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-out-'));
  dirs.push(home);
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'work@example.test', accountUuid: 'uuid-work', organizationUuid: 'org-work' } }));
  fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agentbox', 'cloud.json'), JSON.stringify({ gateway: 'https://cloud.example.test' }));
  process.env.AGENTBOX_CLOUD_CONFIG = path.join(home, '.agentbox', 'cloud.json');
  recordCloudLogin('claude', 'cloud-work', { id: 'id-work', savedAt: 1, org: inCloud ? 'org-work' : 'org-someone-else' }, { home });
  if (limitedFor !== null) markCloudLogin('claude', 'cloud-work', 'id-work', { limitedUntil: Date.now() + limitedFor }, { home });
  const product = { slug: 'p', dir: home, repoPath: '/r' };
  const sup = new Supervisor(
    { storeRoot: home, home, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => [], listProducts: () => [product], isDue: () => true },
    home,
  );
  sup._cloudVersionGaps = () => [];
  return { sup, product };
}

const thread = { id: 'w-looms', product: 'p', status: 'open' };
const cwd = '/r/.claude/worktrees/w-looms';

describe('the cloud\'s account at its usage limit', () => {
  it('the reported case: the thread runs here, and its card says the cloud\'s account is at its limit', () => {
    const { sup, product } = setUp();
    expect(sup._whereToRun({ item: thread, product, cwd, engine: 'claude' })).toBe('local');
    const why = sup._whyLocal({ item: thread, product, engine: 'claude' });
    expect(why).toEqual({ why: 'cloud-account-limited' });
    expect(whyWords({ at: 'mac', ...why })).toEqual({
      head: 'Running locally',
      body: 'The cloud’s account is at its usage limit, so this runs on the account this computer uses.',
    });
  });

  it('a thread still waiting for a slot here says the same, and that it starts when there is room', () => {
    const { sup, product } = setUp();
    const why = sup._whyLocal({ item: thread, product, engine: 'claude' });
    expect(whyWords({ at: 'wait-mac', ...why }).body)
      .toBe('The cloud’s account is at its usage limit, so this runs on the account this computer uses. It starts when this computer has room.');
  });
});

// THE BOUNDARY: once the limit has passed, the thread goes to the cloud and
// nothing is said about a limit.
describe('the limit has passed', () => {
  it('the thread goes to the cloud', () => {
    const { sup, product } = setUp({ limitedFor: -60_000 });
    expect(sup._whereToRun({ item: thread, product, cwd, engine: 'claude' })).toBe('cloud');
    expect(sup._whyLocal({ item: thread, product, engine: 'claude' })).toEqual({ why: 'other' });
  });
});

// THE CASE THAT MUST NOT MATCH: a reason ahead of it keeps its own words. An
// account that is not signed in to the cloud is not "at its limit" there.
describe('this Mac\'s account is not signed in to the cloud', () => {
  it('says that, not the limit', () => {
    const { sup, product } = setUp({ inCloud: false });
    expect(sup._whyLocal({ item: thread, product, engine: 'claude' })).toEqual({ why: 'no-account', detail: 'claude' });
  });
});
