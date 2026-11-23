// A CODEX LOGIN AT ITS LIMIT IS NOT SWAPPED FOR ANOTHER FOLDER (2026-11-16).
//
// What broke: in the overnight Cloud power test, a Codex thread nobody touched
// was started 6 times in 5 minutes, each run dying in about a second on "try
// again at Nov 18th", then held, retried and held again; 25 sightings across
// threads. Measured by driving `_pickProfile`, `noteExitForBackoff`,
// `noteFreshRun` and `restingUntil` in a row: when the one Codex account is a
// folder other than 'default', its bench left `_pickProfile` with nothing
// live and it fell back to the folder called 'default', another login. That
// run died on the limit too, and `_accountMovedOn` read its key against the
// one account as "she switched accounts", so the row woke at once, every tick.
//
// Now a benched account's next pick is that same account, so the row rests on
// the account it ran on and nothing reaches for a second login.
import { describe, it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';

const SAID = 'You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at Nov 18th, 2099 11:01 PM.';
const MIN = 60_000;

function bare(config: Record<string, unknown>) {
  const s = Object.create(Supervisor.prototype);
  const item = { id: 'w-1', product: 'p', title: 'T', status: 'open', engine: 'codex', labels: ['founder'] };
  s.config = { authProfiles: ['default'], maxConcurrentSessions: 3, ...config };
  s._profileCooldown = {}; s._profileStrikes = {}; s._profileTrouble = {}; s._fruitless = {};
  s._saveState = () => {};
  s.store = { listItems: () => [item] };
  s._engineFor = () => 'codex';
  return { s, item };
}

// One start on whatever `_pickProfile` answers, ending on the limit.
function runIntoTheLimit(s: Supervisor, item: { id: string; product: string }) {
  const profile = s._pickProfile('codex');
  const session = { itemId: item.id, product: item.product, engine: 'codex', profile, startedAt: Date.now() - 1200, result: SAID, resultIsError: true, tail: [`stderr: usageLimitExceeded: ${SAID}`] };
  s.noteExitForBackoff(session);
  s.noteFreshRun(item, { everRan: true, account: session.accountFault?.account ?? null });
  return profile;
}

describe('a Codex login at its usage limit', () => {
  const shapes = {
    'the first of two folders, neither called default': { codexProfiles: ['/h/.codex-a', '/h/.codex-b'] },
    'the one picked in Settings': { codexProfiles: ['default', '/h/.codex-b'], activeAccount: { codex: '/h/.codex-b' } },
  };

  for (const [shape, config] of Object.entries(shapes)) {
    it(`is still the pick once benched, when it is ${shape}`, () => {
      const { s, item } = bare(config);
      const first = runIntoTheLimit(s, item);
      expect(s._pickProfile('codex')).toBe(first);
    });

    it(`keeps its thread resting rather than waking it at once, when it is ${shape}`, () => {
      const { s, item } = bare(config);
      for (let i = 0; i < 3; i += 1) {
        runIntoTheLimit(s, item);
        expect(s.restingUntil(item)).toBeGreaterThan(Date.now() + 10 * MIN);
      }
    });
  }

  it('must NOT stop the folder called default from being the pick when it is the one account', () => {
    const { s, item } = bare({ codexProfiles: ['default', '/h/.codex-b'] });
    expect(runIntoTheLimit(s, item)).toBe('default');
    expect(s._pickProfile('codex')).toBe('default');
    expect(s.restingUntil(item)).toBeGreaterThan(Date.now() + 10 * MIN);
  });

  it('must NOT hold back a login with room', () => {
    const { s } = bare({ codexProfiles: ['/h/.codex-a', '/h/.codex-b'] });
    expect(s._pickProfile('codex')).toBe('/h/.codex-a');
  });
});
