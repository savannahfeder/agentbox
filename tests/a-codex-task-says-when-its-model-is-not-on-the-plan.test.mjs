// A CODEX TASK SAYS SO WHEN ITS MODEL IS NOT ON THE PLAN, AND ASKS FOR ANOTHER.
//
// WHAT CHANGED ON w-dac993a554. This used to be "a Codex task runs on the
// account whose plan has its model": work rotated across a person's Codex
// logins, so the model check picked the login whose plan carried the model and
// a refusal moved the task to one that did. Nothing rotates on its own now:
// work runs on the account the person picked. The task stays on the account
// in use, the model is struck off that account, and the row asks for another
// model.
//
// Everything the model check does still matters, and the incident below is
// still why it exists.
//
// What broke (w-f1c00e679d, measured 2026-10-11 on the Mac it happened on): a
// weekend testing sprint was set to GPT-6.1-Sol on Codex, with 1d 17h of the
// plan's usage left to spend. Two Codex logins were signed in: the main one on
// a Pro plan, whose model list carries gpt-6.1-sol, and a second on the FREE
// plan, whose list does not. Work round-robins across the two, and the model
// check only ever read the main login's list, so the sprint was sent to the
// free one and died in 1.7 seconds on Codex's own refusal:
//
//   The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.
//
// It was filed as a cause nobody could name ("Codex stopped before it did
// anything"), the row went to Waiting, and the next try was forty hours later,
// on the same free login, with the same result. The whole weekend's usage went
// unused.
//
// Four things are asserted: the pick stays on the account in use whatever the
// model, and reads that login's own list rather than the main one; a refusal
// Codex makes anyway (a stale list) strikes the model off that login without
// benching it for every other model; the check before the thread reads the list
// of the login that will actually run; and the words on her row say what
// happened and what to do.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { troubleCause, deadRunSentence, deadRunCause, needsHerHands, causeBreakdown } from '../shared/spawn-trouble.mjs';
import { shortNext } from '../renderer/src/trouble-row.ts';

// Copied off the two dead runs' trace logs.
const REFUSAL = "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.";
const REFUSAL_FRAME = JSON.stringify({ type: 'error', status: 400, error: { type: 'invalid_request_error', message: REFUSAL } });

let root;
let PRO;
let FREE;

// The two model lists as Codex keeps them, cut down to what is read.
const PRO_MODELS = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-terra'];
const FREE_MODELS = ['gpt-6-luna', 'gpt-5.6-terra'];

function home(name, slugs) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  if (slugs) {
    fs.writeFileSync(path.join(dir, 'models_cache.json'), JSON.stringify({
      models: slugs.map((slug, i) => ({ slug, display_name: slug, visibility: 'list', priority: i, supported_reasoning_levels: [{ effort: 'high' }] })),
    }));
  }
  return dir;
}

function bare(config = {}) {
  const s = Object.create(Supervisor.prototype);
  // 'default' is the main login, which `_codexHome` resolves through
  // `config.codexHome`; the second is a home in its own right.
  s.config = { authProfiles: ['default'], codexHome: PRO, codexProfiles: ['default', FREE], maxConcurrentSessions: 3, ...config };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  return s;
}

const refusedOn = (profile, extra = {}) => ({
  engine: 'codex',
  profile,
  model: 'gpt-6.1-sol',
  startedAt: Date.now() - 1_700,
  result: REFUSAL_FRAME,
  resultIsError: true,
  tail: [`stderr: ${REFUSAL_FRAME}`],
  ...extra,
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-plan-'));
  PRO = home('pro', PRO_MODELS);
  FREE = home('free', FREE_MODELS);
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function picks(s, model, n = 10) {
  const out = new Set();
  for (let i = 0; i < n; i += 1) out.add(s._pickProfile('codex', { model }));
  return [...out].sort();
}

describe('the pick', () => {
  it('stays on the account in use, whatever the model asks for', () => {
    for (const model of ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-9-imaginary', null, '']) {
      expect(picks(bare(), model)).toEqual(['default']);
    }
  });

  // THE CASE THAT MUST NOT MATCH: the account picked in Settings is the account
  // asked, even for a model its plan has not got. The check before the thread
  // then says why in words (below), rather than the task quietly going
  // somewhere else.
  it('stays on the account picked even when the other plan has the model', () => {
    expect(picks(bare({ activeAccount: { codex: FREE } }), 'gpt-6.1-sol')).toEqual([FREE]);
  });

  it('still reads each login s own list rather than the main one', () => {
    const s = bare();
    expect(s._planLacksModel('codex', FREE, 'gpt-6.1-sol')).toBe(true);
    expect(s._planLacksModel('codex', 'default', 'gpt-6.1-sol')).toBe(false);
    expect(s._planLacksModel('codex', FREE, 'gpt-6-luna')).toBe(false);
  });

  // A login with no list on disk cannot be judged, and a guess would be the
  // app inventing a fact about somebody's plan.
  it('does not judge a login whose list it cannot read', () => {
    const unread = home('unread', null);
    expect(bare()._planLacksModel('codex', unread, 'gpt-6.1-sol')).toBe(false);
  });

  // Claude Code keeps no per-login list to read, so nothing is ruled out.
  it('rules no claude login out', () => {
    expect(bare()._planLacksModel('claude', 'default', 'gpt-6.1-sol')).toBe(false);
  });
});

describe('the words Codex uses', () => {
  it('reads the refusal as the plan lacking the model', () => {
    expect(troubleCause(REFUSAL)).toBe('model-not-on-plan');
    expect(troubleCause(REFUSAL_FRAME)).toBe('model-not-on-plan');
  });

  // It is not a signed-out login, and must not bench the account for a person.
  it('is not a cause that needs her hands on the account', () => {
    expect(needsHerHands('model-not-on-plan')).toBe(false);
  });

  it('does not swallow a model that simply does not exist', () => {
    expect(troubleCause("The model 'gpt-9' does not exist")).not.toBe('model-not-on-plan');
  });
});

describe('a refusal Codex makes anyway', () => {
  // The free login's list is stale and still claims the model.
  function staleFree() {
    return home('stale-free', PRO_MODELS);
  }

  it('strikes that model off the login that refused it, and keeps the login for others', () => {
    const stale = staleFree();
    const s = bare({ codexProfiles: ['default', stale], activeAccount: { codex: stale } });
    expect(s._planLacksModel('codex', stale, 'gpt-6.1-sol')).toBe(false);
    s.noteExitForBackoff(refusedOn(stale));
    expect(s._planLacksModel('codex', stale, 'gpt-6.1-sol')).toBe(true);
    expect(s._planLacksModel('codex', stale, 'gpt-6-luna')).toBe(false);
    // And it is still the account in use: the strike is about a model, not
    // about where work goes.
    expect(picks(s, 'gpt-6-luna')).toEqual([stale]);
  });

  it('files no trouble and no strike against the login', () => {
    const stale = staleFree();
    const s = bare({ codexProfiles: ['default', stale] });
    for (let i = 0; i < 3; i += 1) s.noteExitForBackoff(refusedOn(stale));
    expect(s._profileTrouble[`codex:${stale}`]).toBeUndefined();
    expect(s._profileCooldown[`codex:${stale}`] ?? 0).toBe(0);
  });

  // IT IS THE ROW'S TO ANSWER, NEVER THE OTHER ACCOUNT'S (w-dac993a554). This
  // used to be filed as the account's fault whenever a second Codex login's
  // plan had the model, which is what started the move. An instant retry
  // somewhere else would be the rotation; the row asks for another model.
  it('is the row s to answer, with a second login signed in or without one', () => {
    for (const codexProfiles of [['default', staleFree()], ['default']]) {
      const s = bare({ codexProfiles });
      const session = refusedOn('default');
      s.noteExitForBackoff(session);
      expect(session.accountFault).toBeUndefined();
    }
  });

  it('does not touch her claude books', () => {
    const s = bare();
    s.noteExitForBackoff(refusedOn(FREE));
    expect(s._profileTrouble.default).toBeUndefined();
    expect(s._profileStrikes.default ?? 0).toBe(0);
  });
});

describe('the check before the thread starts', () => {
  const plan = { model: 'gpt-6.1-sol', effort: 'high', product: 'p' };

  it('reads the list of the login that will run, not the main one', () => {
    const s = bare();
    expect(() => s.codexThreadParamsFor(plan, '/tmp', [], null, PRO)).not.toThrow();
    let said = '';
    try { s.codexThreadParamsFor(plan, '/tmp', [], null, FREE); } catch (e) { said = e.message; }
    expect(said).toContain('gpt-6.1-sol');
    expect(troubleCause(said)).toBe('model-not-on-plan');
  });

  it('still calls a word no login knows an unknown model', () => {
    const s = bare();
    let said = '';
    try { s.codexThreadParamsFor({ model: 'gpt-9-imaginary' }, '/tmp', [], null, FREE); } catch (e) { said = e.message; }
    expect(said).toContain('not a model the Codex on this computer knows');
  });
});

describe('the words on her row', () => {
  it('names what happened in the first line, under the inbox clip', () => {
    const line = deadRunSentence({ engineWord: 'Codex', cause: 'model-not-on-plan' });
    const first = line.split('. ')[0] + '.';
    expect(first.length).toBeLessThan(112);
    expect(first).toMatch(/model/);
    expect(first).toMatch(/plan/);
    expect(deadRunCause(line)).toBe('model-not-on-plan');
  });

  it('asks for another model, and offers no account to sign into', () => {
    const line = deadRunSentence({ engineWord: 'Codex', cause: 'model-not-on-plan' });
    expect(line).toMatch(/Pick another model/);
    expect(line).not.toMatch(/keeps trying|sign in a Codex account|another account/);
  });

  it('is counted above the list as hers to fix, in a few words', () => {
    const [row] = causeBreakdown([{ cause: 'model-not-on-plan' }, { cause: 'interrupted' }]);
    expect(row.cause).toBe('model-not-on-plan');
    expect(row.hers).toBe(true);
    expect(shortNext(row)).toBe('need another model');
  });

  // AND THE ROW WAITS FOR HER, not for a tick. It used to come back to the
  // queue on its own when another login's plan had the model, which was the
  // first half of the move; a row whose model its plan has not got needs a
  // person to pick another one, so nothing here brings it back.
  it('leaves the row waiting rather than queueing it again', () => {
    const s = bare();
    const asked = { product: 'p', id: 'w-1', wrote: { result: { ts: 5, source: 'agent' } } };
    for (const account of [`codex:${FREE}`, undefined]) {
      s._fruitless = { 'p:w-1': { runs: 1, saidTs: 5, saidWhy: 'model-not-on-plan', account } };
      expect(s._onlyWeSpokeForAnAccount(asked)).toBe(false);
    }
    // THE CASE THAT MUST NOT MATCH: a limit still brings the row back, because
    // the account it is waiting on comes back on its own.
    s._fruitless = { 'p:w-1': { runs: 1, saidTs: 5, saidWhy: 'at-limit', account: 'codex:default' } };
    expect(s._onlyWeSpokeForAnAccount(asked)).toBe(true);
  });
});
