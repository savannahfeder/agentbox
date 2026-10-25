// SWITCHING TO YOUR OTHER PLAN WHEN ONE HITS ITS LIMIT IS ALLOWED.
//
// Her words, 2026-10-23: "It is 100% acceptable to have a personal and work
// plan" and "It is 100% acceptable to switch to work plan when you've hit your
// limit." On 2026-09-22 she had already withdrawn the old "do not encourage
// multi-accounting" call (w-3498e0cad2, main/settings.mjs). The comments added
// on w-dac993a554 brought that back as a claim that switching at a limit breaks
// Anthropic's Usage Policy, and an agent read that comment the same evening and
// refused to move her stuck agents: 12 of 15 threads sat on a personal login at
// its session limit while her work plan had room.
//
// What stays true: work runs on ONE account at a time, the one she picks, and
// nothing moves work on its own. What this guards is the other half. Picking
// her other plan while the first is capped takes effect at once, the capped
// login's chats are let go to the account she picked, and no file in the app
// says the pick is not allowed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSONAL = '/Users/her/.claude-personal';
const LIMIT = "You've hit your session limit · resets 8:20pm";

const bare = (config = {}) => {
  const s = Object.create(Supervisor.prototype);
  s.config = {
    home: '/nonexistent-home',
    authProfiles: ['default', PERSONAL],
    maxConcurrentSessions: 3,
    engineChoice: '2026-01-01T00:00:00.000Z',
    ...config,
  };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  s.wake = () => {};
  return s;
};

const ranOut = (s, profile) => s.noteExitForBackoff({
  engine: 'claude', profile, startedAt: Date.now() - 300_000, result: LIMIT, resultIsError: true, tail: [],
});

describe('picking your other plan while one is at its limit', () => {
  it('runs the work on the plan you picked straight away', () => {
    const s = bare({ activeAccount: { claude: PERSONAL } });
    ranOut(s, PERSONAL);
    expect(s._profileResting(PERSONAL)).toBe(true);
    s.config.activeAccount = { claude: 'default' };
    s.accountChosen('claude', 'default');
    expect(s._profilesFor('claude')).toEqual(['default']);
    expect(s._pickProfile('claude')).toBe('default');
  });

  it('lets the capped login give its threads to the plan you picked', () => {
    const s = bare({ activeAccount: { claude: 'default' } });
    ranOut(s, PERSONAL);
    expect(s._profileCannotHoldAChat(PERSONAL)).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH: with no pick, a capped login that IS the
  // account in use keeps its threads. Nothing moves work by itself.
  it('does not move anything when you have not picked another plan', () => {
    const s = bare({ activeAccount: { claude: PERSONAL } });
    ranOut(s, PERSONAL);
    expect(s._profilesFor('claude')).toEqual([PERSONAL]);
    expect(s._profileCannotHoldAChat(PERSONAL)).toBe(false);
  });
});

describe('no file says switching plans is not allowed', () => {
  const files = (dir) => fs.readdirSync(path.join(root, dir), { recursive: true })
    .map((f) => path.join(dir, String(f)))
    .filter((f) => /\.(m?js|cjs|tsx?|md)$/.test(f) && !f.includes('node_modules'));
  const self = path.join('tests', path.basename(fileURLToPath(import.meta.url)));

  it('has no comment calling a switch a breach of the usage policy', () => {
    const said = [];
    for (const f of [...files('main'), ...files('shared'), ...files('renderer/src'), ...files('tests')]) {
      if (f === self) continue;
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/circumvent|usage policy/i.test(line)) said.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(said).toEqual([]);
  });
});
