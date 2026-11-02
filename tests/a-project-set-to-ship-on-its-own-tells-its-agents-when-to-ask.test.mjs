// WHAT SHIPS WITHOUT ASKING IS SET FOR EVERY PROJECT, AND FOR ANY ONE (w-e4d49a1539).
//
// Every finished change waited for a yes, because the only rule an agent had
// was the person's own "wait for my approval before shipping". Most of those
// changes were fixes nobody could see. Settings › Shipping now holds four
// answers, one per kind of change, for every project, and a project can have
// its own. The agent is told which kinds ship without asking, which get a
// second model's review first, and which come to the person with pictures.
//
// The first version was one menu on each project's page; the person nearly
// missed it and asked for general and per-project settings. Measured here by
// building briefs and saving settings. Answers nobody set must brief exactly
// as before, word for word, so that turning nothing on changes nothing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ASK_FIRST, CHOICE_WORDS, KINDS, cleanRules, everyProject, notesFor, projectKept, projectOwn, rulesChip, rulesFor, rulesSummary, shipRulesBrief, shipsAlone } from '../shared/ship-mode.mjs';

const FIXES_SHIP = { small: 'ship', wide: 'review', seen: 'ask', big: 'test-ask' };

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-rules-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('the answers', () => {
  it('are four kinds, and every one starts on asking', () => {
    expect(KINDS).toEqual(['small', 'wide', 'seen', 'big']);
    expect(everyProject({})).toEqual(ASK_FIRST);
    expect(shipsAlone(ASK_FIRST)).toBe(false);
  });

  it('come from the project when it has its own, and from every project otherwise', () => {
    const config = { shipRules: { every: FIXES_SHIP, projects: { payments: ASK_FIRST } } };
    expect(rulesFor(config, 'payments')).toEqual(ASK_FIRST);
    expect(rulesFor(config, 'web')).toEqual(FIXES_SHIP);
    expect(projectOwn(config, 'web')).toBeNull();
  });

  it('read a half-written or unknown set as no set at all', () => {
    expect(cleanRules({ small: 'ship' })).toBeNull();
    expect(cleanRules({ ...FIXES_SHIP, big: 'yolo' })).toBeNull();
    expect(rulesFor({ shipRules: { every: { small: 'always' } } }, 'web')).toEqual(ASK_FIRST);
  });

  it('count as shipping alone only when something ships without a yes', () => {
    expect(shipsAlone(FIXES_SHIP)).toBe(true);
    expect(shipsAlone({ ...ASK_FIRST, big: 'test-ask' })).toBe(false);
    expect(shipsAlone({ ...ASK_FIRST, seen: 'test' })).toBe(true);
  });

  // Three synthetic users read two projects with different rules as the same,
  // because the line named only what ships alone and left out the testers.
  it('read back naming what happens to each kind, testers included', () => {
    expect(rulesSummary(ASK_FIRST)).toBe('Everything asks you first.');
    expect(rulesSummary(FIXES_SHIP)).toBe('Small fixes ship on their own. Fixes that reach a lot ship after a Codex review. Big changes go to AI testers, then to you. The rest asks you first.');
    expect(rulesSummary({ ...ASK_FIRST, big: 'test-ask' })).not.toBe(rulesSummary(ASK_FIRST));
    expect(rulesSummary({ small: 'ship', wide: 'review', seen: 'test', big: 'test' })).toBe('Small fixes ship on their own. Fixes that reach a lot ship after a Codex review. Changes you can see and big changes ship after AI testers try them.');
  });

  // All three testers looked for what a project would ship where they were
  // writing the task, and found nothing outside Settings.
  it('give the new-thread box a few words when something ships alone, and none when all ask', () => {
    expect(rulesChip(ASK_FIRST)).toBeNull();
    expect(rulesChip(FIXES_SHIP)).toBe('Fixes ship on their own');
    expect(rulesChip({ ...ASK_FIRST, seen: 'test' })).toBe('AI-tested changes ship on their own');
    expect(rulesChip({ small: 'ship', wide: 'ask', seen: 'test', big: 'ask' })).toBe('Small fixes and AI-tested changes ship on their own');
    // Third round: "tested changes" read as changes that pass my own tests.
    expect(rulesChip({ ...ASK_FIRST, big: 'test-ask' })).toBe('AI testers try big changes first');
  });

  // Second round: "Fixes ship on their own" on a payments API where fixes
  // touching money still ask, and the same words on two projects whose fixes
  // were set apart.
  it('name which fixes, when only one kind of fix ships', () => {
    expect(rulesChip({ ...ASK_FIRST, small: 'ship' })).toBe('Small fixes ship on their own');
    expect(rulesChip({ ...ASK_FIRST, wide: 'review' })).toBe('Reviewed fixes ship on their own');
    expect(rulesChip({ ...ASK_FIRST, small: 'ship' })).not.toBe(rulesChip({ ...ASK_FIRST, wide: 'review' }));
  });

  it('say asking the same way on every kind', () => {
    for (const k of KINDS) expect(CHOICE_WORDS[k].ask).toBe('Ask me first');
  });

  it('keep a project\'s own rules while it follows every project\'s, to put back', () => {
    const config = { shipRules: { every: FIXES_SHIP, projects: { web: { ...ASK_FIRST, off: true } } } };
    expect(projectOwn(config, 'web')).toBeNull();
    expect(rulesFor(config, 'web')).toEqual(FIXES_SHIP);
    expect(projectKept(config, 'web')).toEqual(ASK_FIRST);
  });
});

describe('what the agent is told', () => {
  it('is nothing at all while everything asks', () => {
    expect(shipRulesBrief(ASK_FIRST)).toBe('');
    expect(shipRulesBrief({ ...ASK_FIRST, big: 'test-ask' })).toBe('');
    expect(shipRulesBrief(null)).toBe('');
  });

  it('names where the rules were set, and that they outrank a general rule to ask', () => {
    const b = shipRulesBrief(FIXES_SHIP);
    expect(b).toMatch(/# When this change ships/);
    expect(b).toMatch(/Settings, under Shipping/);
    expect(b).toMatch(/standing approval/);
    expect(b).toMatch(/outranks a general rule in\s+their instructions to ask/);
  });

  it('ships a small fix nobody sees, and never counts money or sign-in as small', () => {
    const b = shipRulesBrief(FIXES_SHIP);
    expect(b).toMatch(/1\. A small fix nobody sees[\s\S]*touches none of\s+what 2 lists[\s\S]*ship it without asking/);
  });

  it('has a second model review a wide fix, and asks when none can run', () => {
    const b = shipRulesBrief(FIXES_SHIP);
    expect(b).toMatch(/second model review it first/);
    expect(b).toMatch(/If no second model can run, ask them/);
  });

  it('brings a seen change with screenshots and does not ship it, unless testers may', () => {
    expect(shipRulesBrief(FIXES_SHIP)).toMatch(/3\. A change people can see[\s\S]*Do not ship it\.\s+Bring it to them with the screenshots/);
    expect(shipRulesBrief({ ...FIXES_SHIP, seen: 'test' })).toMatch(/3\. A change people can see[\s\S]*synthetic power user[\s\S]*ship it without\s+asking/);
  });

  it('tests a big change with several testers, and ships it only when told to', () => {
    expect(shipRulesBrief(FIXES_SHIP)).toMatch(/4\. A big change[\s\S]*several at once[\s\S]*Do not ship it/);
    expect(shipRulesBrief({ ...FIXES_SHIP, big: 'test' })).toMatch(/4\. A big change[\s\S]*ship it without asking, with screenshots/);
  });

  it('asks for a kind left on asking, even when another kind ships', () => {
    const b = shipRulesBrief({ small: 'ship', wide: 'ask', seen: 'ask', big: 'ask' });
    expect(b).toMatch(/2\. A fix that reaches a lot[\s\S]*Do not ship it\. Bring it to them, and ask/);
  });

  // Two testers wrote a rule in their own words and went looking for it on
  // the Shipping page; it lived in Instructions, behind a long template.
  it('carries the person\'s own words, every project\'s and the project\'s', () => {
    const b = shipRulesBrief(FIXES_SHIP, ['Never ship a database migration on its own.', 'Payments always asks.']);
    expect(b).toMatch(/In their own words:\n\n> Never ship a database migration on its own\.\n> Payments always asks\./);
  });

  it('carries the words alone when nothing ships without asking', () => {
    const b = shipRulesBrief(ASK_FIRST, ['Always show me screenshots.']);
    expect(b).toMatch(/In their own words/);
    expect(b).not.toMatch(/1\. A small fix nobody sees/);
    expect(shipRulesBrief(ASK_FIRST, ['  '])).toBe('');
  });

  it('settles a doubt by asking more, and has the agent name its kind', () => {
    const b = shipRulesBrief(FIXES_SHIP);
    expect(b).toMatch(/When you are unsure between two, take the later one/);
    expect(b).toMatch(/Your answer says which of the four your change was and why/);
  });
});

describe('every way an agent is started or woken', async () => {
  const { Store } = await import('../main/store.mjs');
  const { Supervisor } = await import('../main/supervisor.mjs');
  async function briefs({ shipRules, ships }) {
    const root = path.join(tmp, 'store');
    const repo = path.join(tmp, 'repo');
    const userDir = path.join(tmp, 'user');
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(path.join(root, 'team'), { recursive: true });
    fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
    if (ships) fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ team: { script: 'scripts/ship.mjs' } }));
    const config = { accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent', ...(shipRules ? { shipRules } : {}) };
    const store = await new Store(config).init();
    const sup = new Supervisor(config, store, root, path.join(tmp, 'data'), userDir);
    sup._saveState = () => {};
    const made = store.fileItem('team', { title: 'Fix it', kind: 'task', body: 'Fix it.' });
    const item = store.readItem('team', made.id, Date.now());
    const product = store.listProducts()[0];
    const woken = { ...item, answer: 'go on' };
    return [
      await sup.buildBrief(item, product, { continuation: false }),
      sup.replyBrief(woken, { product }),
      sup.resumeBrief(woken, { continuation: true, product }),
    ];
  }

  it('carries the rules set for every project', async () => {
    for (const b of await briefs({ shipRules: { every: FIXES_SHIP }, ships: true })) {
      expect(b).toMatch(/# How this task ships/);
      expect(b).toMatch(/# When this change ships/);
      expect(b).not.toMatch(/Whether to wait for approval first is set by the\s+instructions you were given/);
    }
  });

  it('follows the project\'s own rules over every project\'s', async () => {
    for (const b of await briefs({ shipRules: { every: FIXES_SHIP, projects: { team: ASK_FIRST } }, ships: true })) {
      expect(b).not.toMatch(/# When this change ships/);
      expect(b).toMatch(/Whether to wait for approval first is set by the\s+instructions you were given/);
    }
  });

  it('carries them on a project the app does not ship for, too', async () => {
    for (const b of await briefs({ shipRules: { every: FIXES_SHIP }, ships: false })) {
      expect(b).not.toMatch(/# How this task ships/);
      expect(b).toMatch(/# When this change ships/);
    }
  });

  it('carries nothing new when nobody set anything', async () => {
    for (const b of await briefs({ shipRules: null, ships: true })) {
      expect(b).not.toMatch(/# When this change ships/);
    }
  });
});

describe('Settings', async () => {
  const { loadConfig } = await import('../main/config.mjs');
  const { readSettings, setProjectSetting, setWorkspaceSetting } = await import('../main/settings.mjs');
  const { Supervisor } = await import('../main/supervisor.mjs');
  const store = { listItems: () => [], listProducts: () => [{ slug: 'acme', name: 'Acme', dir: '/tmp/acme' }], isDue: () => true, readInstructions: () => '' };
  const model = () => {
    const config = loadConfig(tmp);
    return readSettings({ config, supervisor: new Supervisor(config, store, tmp), store });
  };
  const ctx = () => { const config = loadConfig(tmp); return { config, supervisor: new Supervisor(config, store, tmp), store }; };

  it('starts every project and each project on asking first', () => {
    const m = model();
    expect(m.workspace.shipRules).toEqual(ASK_FIRST);
    expect(m.projects[0].shipOwn).toBeNull();
  });

  it('keeps the answers for every project', () => {
    setWorkspaceSetting(ctx(), { key: 'shipRules', value: FIXES_SHIP });
    expect(model().workspace.shipRules).toEqual(FIXES_SHIP);
    expect(loadConfig(tmp).shipRules).toEqual({ every: FIXES_SHIP });
  });

  it('keeps a project\'s own answers, and lets it go back to every project\'s without losing them', () => {
    setProjectSetting(ctx(), { product: 'acme', key: 'shipRules', value: FIXES_SHIP });
    expect(model().projects[0].shipOwn).toEqual(FIXES_SHIP);
    setProjectSetting(ctx(), { product: 'acme', key: 'shipRules', value: null });
    expect(model().projects[0].shipOwn).toBeNull();
    expect(model().projects[0].shipKept).toEqual(FIXES_SHIP);
  });

  it('forgets nothing it was never given', () => {
    setProjectSetting(ctx(), { product: 'acme', key: 'shipRules', value: null });
    expect(loadConfig(tmp).shipRules).toBeUndefined();
    expect(model().projects[0].shipKept).toBeNull();
  });

  it('leaves nothing in the config once everything asks again', () => {
    setWorkspaceSetting(ctx(), { key: 'shipRules', value: FIXES_SHIP });
    setWorkspaceSetting(ctx(), { key: 'shipRules', value: ASK_FIRST });
    expect(loadConfig(tmp).shipRules).toBeUndefined();
  });

  it('keeps words for every project and for one, and reads them back', () => {
    setWorkspaceSetting(ctx(), { key: 'shipNote', value: 'Never ship a migration on its own.' });
    setProjectSetting(ctx(), { product: 'acme', key: 'shipNote', value: 'Payments always asks.' });
    const m = model();
    expect(m.workspace.shipNote).toBe('Never ship a migration on its own.');
    expect(m.projects[0].shipNote).toBe('Payments always asks.');
    expect(notesFor(loadConfig(tmp), 'acme')).toEqual(['Never ship a migration on its own.', 'Payments always asks.']);
    setProjectSetting(ctx(), { product: 'acme', key: 'shipNote', value: '' });
    expect(model().projects[0].shipNote).toBe('');
  });

  it('refuses answers it does not know', () => {
    expect(() => setWorkspaceSetting(ctx(), { key: 'shipRules', value: { small: 'always' } })).toThrow(/not a set of ship rules/);
    expect(() => setProjectSetting(ctx(), { product: 'acme', key: 'shipRules', value: 'ship' })).toThrow(/not a set of ship rules/);
    expect(model().workspace.shipRules).toEqual(ASK_FIRST);
  });
});

// Ways in, so the rules are found where people look: the thread being
// written, the thread being read, and the command bar by project name. Each
// was asked for by the synthetic users; read off the sources, as these are
// screens the tests do not draw.
describe('where the rules show outside Settings', () => {
  const read = (p) => fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', p), 'utf8');

  it('the snapshot carries each project\'s chip, only where something ships alone', () => {
    expect(read('main/ipc.mjs')).toMatch(/shipping: Object\.fromEntries\(products\.map\(\(p\) => \{[\s\S]*?rulesChip\(rules\)[\s\S]*?chip \? \[\[p\.slug/);
  });

  it('the new-thread box and the thread\'s reply box show it and open Shipping for the project', () => {
    expect(read('renderer/src/threads/ThreadComposer.tsx')).toMatch(/shipping\?\.\[product\.slug\][\s\S]*?onOpenShipping\?\.\(product\.slug\)/);
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/shipping && \(\s*<>\s*<ShipWord shipping=\{shipping\} onOpen=\{\(\) => onOpenShipping\?\.\(item\.product\)\}/);
  });

  it('the command bar has Shipping, and Shipping for each project', () => {
    const palette = read('renderer/src/components/Palette.tsx');
    expect(palette).toMatch(/label: 'Shipping…'/);
    expect(palette).toMatch(/label: `Shipping for \$\{p\.name\}…`/);
  });
});
