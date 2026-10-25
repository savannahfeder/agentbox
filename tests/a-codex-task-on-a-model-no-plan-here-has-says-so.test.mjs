// A CODEX TASK ON A MODEL NO PLAN HERE HAS SAYS SO, AND SAYS WHY.
//
// What broke (2026-10-19): a task set to gpt-6.1-sol on Codex died in under a
// second and its row read "Codex stopped before it did anything, so this task
// has not been started. Agentbox keeps trying, and it will keep failing the same
// way until this is fixed." The person read that as Agentbox being broken, and
// guessed the plan was out of usage.
//
// The run's whole trace was one line, written by the app itself:
//
//   this row asks to run on "gpt-6.1-sol", which is not a model the Codex on
//   this computer knows. It offers gpt-6-luna, gpt-5.6-terra, gpt-5.6-luna. ...
//
// Both Codex logins on that Mac read `chatgpt_plan_type: "free"`, the main one
// with `chatgpt_subscription_active_until` eight hours before the run: its paid
// plan had ended, and the free list has no gpt-6.1-sol. `troubleCause` knew
// only the other half of `codexModelRefusal` (another login has the model), so
// the app could not read its own sentence, filed 'unknown', and struck a
// working Codex login for it. `codexEffortRefusal` had the same hole.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { codexPlanEnded } from '../main/codex-account.mjs';
import { troubleCause, deadRunSentence, deadRunCause, runStoppedLine, causeBreakdown } from '../shared/spawn-trouble.mjs';

// Copied off the run's trace log.
const HER_REFUSAL = 'this row asks to run on "gpt-6.1-sol", which is not a model the Codex on this computer knows. It offers gpt-6-luna, gpt-5.6-terra, gpt-5.6-luna. Nothing here will pick a stand-in for her, so this run is stopping rather than doing her work on a model she did not choose';

const FREE_MODELS = ['gpt-6-luna', 'gpt-5.6-terra', 'gpt-5.6-luna'];
const DAY = 86_400_000;

let root;

function jwt(claims) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none' })}.${part(claims)}.sig`;
}

// A Codex home as codex-cli leaves it, cut down to what is read.
function home(name, { slugs = FREE_MODELS, plan = 'free', until = null } = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'models_cache.json'), JSON.stringify({
    models: slugs.map((slug, i) => ({ slug, display_name: slug, visibility: 'list', priority: i, supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] })),
  }));
  const auth = { 'https://api.openai.com/auth': { chatgpt_plan_type: plan } };
  if (until) auth['https://api.openai.com/auth'].chatgpt_subscription_active_until = until;
  fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { id_token: jwt(auth) } }));
  return dir;
}

function bare(codexHome) {
  const s = Object.create(Supervisor.prototype);
  s.config = { authProfiles: ['default'], codexHome, codexProfiles: ['default'], maxConcurrentSessions: 3 };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  return s;
}

function withStore(codexHome) {
  const store = {
    listItems: () => [],
    listProducts: () => [{ slug: 'p', name: 'P', dir: root }],
    isDue: () => true,
    written: [],
    recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); },
  };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3, codexHome, codexProfiles: ['default'] }, store, root);
  return { sup, store };
}

const refused = (words, extra = {}) => ({
  engine: 'codex',
  profile: 'default',
  model: 'gpt-6.1-sol',
  startedAt: Date.now() - 900,
  tail: [`stderr: ${words}`, 'session exited (1)'],
  ...extra,
});

const said = (fn) => { try { fn(); } catch (e) { return e.message; } return null; };

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-no-plan-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('the app reads its own refusals back', () => {
  it('reads her run as a model no plan here includes', () => {
    expect(troubleCause(HER_REFUSAL)).toBe('model-not-on-plan');
  });

  it('reads the same refusal when the workspace setting asked for the model', () => {
    const s = bare(home('free'));
    const words = s.codexModelRefusal('gpt-6.1-sol', 'workspace');
    expect(words).toMatch(/every Codex agent here is set to run on/);
    expect(troubleCause(words)).toBe('model-not-on-plan');
  });

  it('reads a thinking level the model does not offer as its own cause', () => {
    const s = bare(home('free'));
    const words = s.codexEffortRefusal('gpt-6-luna', 'ultra');
    expect(words).toMatch(/not a level that model offers/);
    expect(troubleCause(words)).toBe('level-not-offered');
  });

  // The guard: every sentence the app throws before a Codex thread starts is
  // one it can name. A new refusal that is not taught to `troubleCause` turns
  // this red instead of turning a row into "stopped before it did anything".
  it('names the cause of every refusal thrown before the thread starts', () => {
    const s = bare(home('free'));
    const plans = [
      { model: 'gpt-6.1-sol' },
      { model: 'gpt-9-imaginary' },
      { model: 'gpt-6-luna', effort: 'ultra' },
    ];
    for (const plan of plans) {
      const words = said(() => s.codexThreadParamsFor(plan, '/tmp', [], null));
      expect(words).toBeTruthy();
      expect(troubleCause(words)).not.toBe('unknown');
    }
    s.config.codexModel = 'gpt-6.1-sol';
    expect(troubleCause(said(() => s.codexThreadParamsFor({}, '/tmp', [], null)))).toBe('model-not-on-plan');
  });

  it('still lets a model and level the plan has through', () => {
    const s = bare(home('free'));
    expect(said(() => s.codexThreadParamsFor({ model: 'gpt-6-luna', effort: 'high' }, '/tmp', [], null))).toBe(null);
  });

  it('does not read an agent talking about models as a refusal', () => {
    expect(troubleCause('gpt-9 is not a model I have heard of')).toBe('unknown');
    expect(troubleCause('pick a level that suits the task')).toBe('unknown');
  });
});

describe('the login is not blamed for what the task asked for', () => {
  it('files no trouble and no strike on the Codex login for a model', () => {
    const s = bare(home('free'));
    for (let i = 0; i < 3; i += 1) s.noteExitForBackoff(refused(HER_REFUSAL));
    expect(s._profileTrouble['codex:default']).toBeUndefined();
    expect(s._profileStrikes['codex:default'] ?? 0).toBe(0);
    expect(s._profileCooldown['codex:default'] ?? 0).toBe(0);
  });

  it('files no trouble and no strike on the Codex login for a level', () => {
    const s = bare(home('free'));
    const words = s.codexEffortRefusal('gpt-6-luna', 'ultra');
    for (let i = 0; i < 3; i += 1) s.noteExitForBackoff(refused(words, { model: 'gpt-6-luna' }));
    expect(s._profileTrouble['codex:default']).toBeUndefined();
    expect(s._profileStrikes['codex:default'] ?? 0).toBe(0);
  });

  // The boundary: a death nobody can name is still evidence about the login.
  it('still strikes the login for a death it cannot name', () => {
    const s = bare(home('free'));
    s.noteExitForBackoff(refused('Segmentation fault'));
    expect(s._profileTrouble['codex:default']).toBeDefined();
  });
});

describe('when the plan ended', () => {
  const NOW = Date.parse('2026-10-20T03:14:01Z');

  it('reads the end off a free login that used to pay', () => {
    const h = home('ended', { until: '2026-10-19T04:18:25+00:00' });
    expect(codexPlanEnded(h, { now: NOW })).toBe(Date.parse('2026-10-19T04:18:25Z'));
  });

  it('says nothing while the paid plan is still running', () => {
    expect(codexPlanEnded(home('paid', { plan: 'pro', until: '2026-11-19T04:18:25+00:00' }), { now: NOW })).toBe(null);
  });

  // A token minted before a renewal can carry an old date on a paid plan.
  it('says nothing when the plan is still a paid one', () => {
    expect(codexPlanEnded(home('stale', { plan: 'pro', until: '2026-10-19T04:18:25+00:00' }), { now: NOW })).toBe(null);
  });

  it('says nothing about a free login that never paid', () => {
    expect(codexPlanEnded(home('never'), { now: NOW })).toBe(null);
  });

  it('says nothing about a free login whose date is still ahead', () => {
    expect(codexPlanEnded(home('ahead', { until: '2026-10-21T00:00:00Z' }), { now: NOW })).toBe(null);
  });

  it('says nothing when there is no sign-in to read', () => {
    expect(codexPlanEnded(path.join(root, 'nobody'), { now: NOW })).toBe(null);
  });
});

describe('the words on her row', () => {
  it('says the plan ended and what to do, for her run', () => {
    const { sup, store } = withStore(home('ended', { until: new Date(Date.now() - DAY).toISOString() }));
    sup.sayTheRunDied({ id: 'w-1', product: 'p' }, refused(HER_REFUSAL));
    const line = store.written[0].result;
    expect(line).toMatch(/^Codex could not use this task's model on that account's plan, so nothing has been done\./);
    expect(line).toMatch(/That account's ChatGPT subscription ended on [A-Z][a-z]{2} \d{1,2}, and the free plan does not include gpt-6\.1-sol\./);
    expect(line).toMatch(/Renew it at chatgpt\.com, or pick another model for this task\.$/);
    expect(line).not.toMatch(/keep failing|keeps trying|stopped before it did anything/);
    expect(deadRunCause(line)).toBe('model-not-on-plan');
  });

  it('asks for another model when no plan ended to blame', () => {
    const { sup, store } = withStore(home('never'));
    sup.sayTheRunDied({ id: 'w-1', product: 'p' }, refused(HER_REFUSAL));
    // AND NOT "or sign in a Codex account whose plan has it" (w-dac993a554):
    // another account is not an answer this app offers any more.
    expect(store.written[0].result).toBe("Codex could not use this task's model on that account's plan, so nothing has been done. Pick another model for this task.");
  });

  it('asks for another thinking level when the level is the refusal', () => {
    const line = deadRunSentence({ engineWord: 'Codex', cause: 'level-not-offered' });
    expect(line).toBe("Codex could not run this task's model at the thinking level it asks for, so nothing has been done. Pick another thinking level for this task and it will run.");
    expect(line.split('. ')[0].length).toBeLessThan(112);
    expect(deadRunCause(line)).toBe('level-not-offered');
    expect(runStoppedLine(said(() => bare(home('free')).codexThreadParamsFor({ model: 'gpt-6-luna', effort: 'ultra' }, '/tmp', [], null))))
      .toBe('This run stopped because the model does not offer that thinking level.');
  });

  it('counts a level above the list as hers to fix', () => {
    const [row] = causeBreakdown([{ cause: 'level-not-offered' }, { cause: 'interrupted' }, { cause: 'interrupted' }]);
    expect(row.cause).toBe('level-not-offered');
    expect(row.hers).toBe(true);
    expect(row.what).toBe('1 asking for a thinking level its model does not offer');
    expect(row.next).toBe('Pick another thinking level on each.');
  });

  it('keeps the colon and dash out of every new sentence', () => {
    for (const line of [
      deadRunSentence({ engineWord: 'Codex', cause: 'model-not-on-plan', model: 'gpt-6.1-sol', planEnded: Date.now() - DAY }),
      deadRunSentence({ engineWord: 'Codex', cause: 'level-not-offered' }),
    ]) {
      expect(line).not.toMatch(/[:—–]/);
      expect(line).not.toMatch(/keeps trying|keep failing/);
    }
  });
});
