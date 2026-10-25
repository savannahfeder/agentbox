// THE MODEL MENU OFFERS WHAT EVERY CODEX LOGIN HERE CAN RUN, AND SAYS WHEN THE
// PLAN IS WHY THE LIST IS SHORT.
//
// What broke (w-62f14f8b3e, 2026-10-22): the model menu's Codex column showed
// three models, GPT-6-Luna, GPT-5.6-Terra and GPT-5.6-Luna, and read as
// Agentbox hiding the rest. A signed-out codex-cli 0.163.0 lists eight
// (`model/list`, includeHidden false): 6.1-Sol, 6-Astra, 6-Sol, 6-Luna,
// 5.6-Sol, 5.6-Terra, 5.6-Luna, 5.5. The three are the free plan's list
// (measured 2026-10-11, w-f1c00e679d), and both logins on that Mac had read
// Free since the paid plan ended on 2026-10-18 (w-e44583f773). Nothing on the
// menu said so.
//
// Two gaps are held here. The menu read only the main login's list, although
// `_pickProfile` then sent a task to whichever login's plan had its model, so
// a paid second login's models never appeared beside a free main one. And only
// the main login's catalog was refreshed, so a second login's list was as old
// as the last time Codex happened to run on it.
//
// SINCE w-dac993a554 THE WORK RUNS ON ONE LOGIN, so the menu offers that
// login's models: `codexModelsAcross` still merges the homes it is handed, and
// `_codexOfferHomes` now hands it one. The merging is what the cases below
// test; which homes reach it is the last two.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { codexModelsAcross } from '../main/codex-models.mjs';
import { codexFreePlan } from '../main/codex-account.mjs';
import { refreshAgentModels } from '../main/refresh-agent-models.mjs';

const PAID = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'];
const FREE = ['gpt-6-luna', 'gpt-5.6-terra', 'gpt-5.6-luna'];
const OCT_18 = Date.parse('2026-10-18T07:00:00Z');
const NOW = Date.parse('2026-10-22T12:00:00Z');

let root;

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

/** A Codex home as codex-cli leaves it: a model cache and, when signed in, an auth.json. */
function home(name, { slugs = null, plan = null, endedAt = null, signedIn = true } = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  if (slugs) {
    fs.writeFileSync(path.join(dir, 'models_cache.json'), JSON.stringify({
      models: slugs.map((slug, i) => ({
        slug, display_name: slug.toUpperCase(), visibility: 'list', priority: i,
        default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }],
      })),
    }));
  }
  if (signedIn) {
    const auth = plan
      ? { 'https://api.openai.com/auth': { chatgpt_plan_type: plan, ...(endedAt ? { chatgpt_subscription_active_until: new Date(endedAt).toISOString() } : {}) } }
      : {};
    fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ auth_mode: plan ? 'chatgpt' : 'apikey', tokens: plan ? { id_token: jwt({ email: `${name}@example.com`, ...auth }) } : undefined }));
  }
  return dir;
}

function bare(config) {
  const s = Object.create(Supervisor.prototype);
  s.config = { authProfiles: ['default'], ...config };
  return s;
}

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-offer-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('the models offered are every signed-in login\'s, not just the main one\'s', () => {
  it('a paid second login puts its models beside a free main login, in the paid list\'s order', () => {
    const main = home('main', { slugs: FREE, plan: 'free' });
    const second = home('second', { slugs: PAID, plan: 'pro' });
    const ids = codexModelsAcross([main, second]).map((m) => m.id);
    expect(ids).toEqual(PAID);
  });

  it('a model only the smaller list has still appears, after the longer list', () => {
    const main = home('main', { slugs: ['gpt-6-luna', 'gpt-4-retro'], plan: 'free' });
    const second = home('second', { slugs: ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna'], plan: 'pro' });
    expect(codexModelsAcross([main, second]).map((m) => m.id)).toEqual(['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna', 'gpt-4-retro']);
  });

  it('each model keeps its own reasoning levels, and one login reads exactly as before', () => {
    const main = home('main', { slugs: PAID, plan: 'pro' });
    const [first] = codexModelsAcross([main]);
    expect(first).toMatchObject({ id: 'gpt-6.1-sol', defaultLevel: 'medium', levels: [{ id: 'low' }, { id: 'medium' }] });
    expect(codexModelsAcross([main]).map((m) => m.id)).toEqual(PAID);
  });

  // THE LOGIN THE WORK RUNS ON, WHICH IS ONE (w-dac993a554). This expected
  // every signed-in login's models, which was right while `_pickProfile` sent
  // a task to whichever login's plan had its model. Nothing rotates now, so a
  // menu offering a second login's models would offer what the account in use
  // cannot run, and the task would die saying the model is not on the plan.
  it('the homes offered are the login the work runs on, and not one still being added', () => {
    const main = home('main', { slugs: FREE, plan: 'free' });
    const second = home('second', { slugs: PAID, plan: 'pro' });
    const adding = home('adding', { slugs: PAID, signedIn: false });
    const s = bare({ codexHome: main, codexProfiles: ['default', second, adding] });
    expect(s._codexOfferHomes()).toEqual([main]);
  });

  it('an account she chose narrows the offer to that login', () => {
    const main = home('main', { slugs: FREE, plan: 'free' });
    const second = home('second', { slugs: PAID, plan: 'pro' });
    const s = bare({ codexHome: main, codexProfiles: ['default', second], activeAccount: { codex: 'default' } });
    expect(s._codexOfferHomes()).toEqual([main]);
  });

  it('with nobody signed in, the main login is still read, as it always was', () => {
    const main = home('main', { slugs: FREE, signedIn: false });
    const s = bare({ codexHome: main });
    expect(s._codexOfferHomes()).toEqual([main]);
  });
});

describe('the menu knows when the plan is why the list is short', () => {
  it('every login on the free plan, one of them lapsed: says free, and when it ended', () => {
    const main = home('main', { plan: 'free', endedAt: OCT_18 });
    const second = home('second', { plan: 'free' });
    expect(codexFreePlan([main, second], { now: NOW })).toEqual({ endedAt: OCT_18 });
  });

  it('a free login that never paid has no ending to name', () => {
    expect(codexFreePlan([home('main', { plan: 'free' })], { now: NOW })).toEqual({ endedAt: null });
  });

  it('one paid login anywhere in the offer means the plan is not what is short', () => {
    expect(codexFreePlan([home('main', { plan: 'free', endedAt: OCT_18 }), home('second', { plan: 'pro' })], { now: NOW })).toBeNull();
    expect(codexFreePlan([home('main', { plan: 'plus' })], { now: NOW })).toBeNull();
  });

  it('a key login, an unreadable login and no login at all claim nothing', () => {
    expect(codexFreePlan([home('key', { plan: null })], { now: NOW })).toBeNull();
    expect(codexFreePlan([home('gone', { signedIn: false })], { now: NOW })).toBeNull();
    expect(codexFreePlan([], { now: NOW })).toBeNull();
  });
});

describe('every signed-in login\'s catalog is refreshed, and one failing does not cost the others', () => {
  const config = { codexBin: '/bin/codex', home: '/tmp' };
  const client = (answer) => ({
    initialize: async () => ({}),
    request: async (method) => {
      if (method !== 'model/list') throw new Error(`unexpected ${method}`);
      if (answer instanceof Error) throw answer;
      return { data: answer.map((model) => ({ model, displayName: model, hidden: false, supportedReasoningEfforts: [] })), nextCursor: null };
    },
    close: () => {},
  });

  it('asks each home and remembers each answer under its own home', async () => {
    const a = path.join(os.tmpdir(), 'refresh-a'); const b = path.join(os.tmpdir(), 'refresh-b');
    const asked = [];
    await refreshAgentModels('codex', config, [a, b], {
      open: (h) => { asked.push(h); return client(h === a ? FREE : PAID); },
    });
    expect(asked).toEqual([a, b]);
    expect(codexModelsAcross([a]).map((m) => m.id)).toEqual(FREE);
    expect(codexModelsAcross([b]).map((m) => m.id)).toEqual(PAID);
  });

  it('a login that cannot answer leaves the other refreshed, and only all failing is an error', async () => {
    const a = path.join(os.tmpdir(), 'refresh-c'); const b = path.join(os.tmpdir(), 'refresh-d');
    await refreshAgentModels('codex', config, [a, b], { open: (h) => client(h === a ? new Error('offline') : PAID) });
    expect(codexModelsAcross([b]).map((m) => m.id)).toEqual(PAID);
    await expect(refreshAgentModels('codex', config, [a], { open: () => client(new Error('offline')) })).rejects.toThrow('offline');
  });

  it('a single home, as the old callers pass it, still works', async () => {
    const a = path.join(os.tmpdir(), 'refresh-e');
    await refreshAgentModels('codex', config, a, { open: () => client(FREE) });
    expect(codexModelsAcross([a]).map((m) => m.id)).toEqual(FREE);
  });
});
