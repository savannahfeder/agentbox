import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { setProjectSetting } from '../main/settings.mjs';

let tmp, work, side;

function login(dir, uuid) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: uuid, emailAddress: `${uuid}@example.com` } }));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-project-account-'));
  work = path.join(tmp, '.claude-work');
  side = path.join(tmp, '.claude-side');
  login(path.join(tmp, '.claude'), 'own');
  login(work, 'work');
  login(side, 'side');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const products = () => ['acme', 'home', 'loose'].map((slug) => ({ slug, name: slug, dir: path.join(tmp, slug) }));

function makeSupervisor(extra = {}) {
  const store = { listItems: () => [], listProducts: products, isDue: () => true };
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default', work, side], ...extra }, store, tmp);
  sup._saveState = () => {};
  return sup;
}

const pins = () => ({ projectAccounts: { acme: work, home: 'default' } });

describe('which account a project is tied to', () => {
  it('answers the pinned account for that project and nothing for the others', () => {
    const sup = makeSupervisor(pins());
    expect(sup._projectProfile('acme')).toBe(work);
    expect(sup._projectProfile('home')).toBe('default');
    expect(sup._projectProfile('loose')).toBe(null);
    expect(sup._projectProfile({ slug: 'acme' })).toBe(work);
  });

  it('never applies a Claude pin to a Codex run', () => {
    const sup = makeSupervisor(pins());
    expect(sup._projectProfile('acme', 'codex')).toBe(null);
  });

  it('runs a small call under the pinned folder, and under no folder for the default login', () => {
    const sup = makeSupervisor(pins());
    expect(sup._projectConfigDir('acme')).toBe(work);
    expect(sup._projectConfigDir('home')).toBe(null);
    expect(sup._projectConfigDir('loose')).toBe(null);
  });

  it('counts only the pinned account as fitting, and every account for an untied project', () => {
    const sup = makeSupervisor(pins());
    expect(sup._profileFitsProject(work, 'acme')).toBe(true);
    expect(sup._profileFitsProject('default', 'acme')).toBe(false);
    expect(sup._profileFitsProject(null, 'acme')).toBe(false);
    expect(sup._profileFitsProject(null, 'home')).toBe(true);
    expect(sup._profileFitsProject(side, 'home')).toBe(false);
    expect(sup._profileFitsProject(side, 'loose')).toBe(true);
  });
});

describe('a chat stays on the account its project is tied to', () => {
  const row = (extra = {}) => ({ id: 'w-1', product: 'acme', title: 'Fix the importer', ...extra });
  const chatOn = (sup, profile) => {
    sup._rowSessions = { 'w-1': { sessionId: 'sess-1', product: 'acme', profile, engine: 'claude', lastUsedAt: Date.now() } };
    sup.transcriptFile = () => '/somewhere.jsonl';
  };

  it('resumes a chat that lives on the pinned account', () => {
    const sup = makeSupervisor(pins());
    chatOn(sup, work);
    expect(sup.rowSessionFor(row())?.sessionId).toBe('sess-1');
  });

  it('drops a chat that lives on another account, so the row is briefed fresh', () => {
    const sup = makeSupervisor(pins());
    chatOn(sup, side);
    expect(sup.rowSessionFor(row())).toBe(null);
  });

  it('keeps the chat when the pinned account is in trouble and another one is healthy', () => {
    const sup = makeSupervisor(pins());
    chatOn(sup, work);
    sup._profileTrouble = { [work]: { cause: 'signed-out', since: Date.now() } };
    expect(sup.rowSessionFor(row())?.sessionId).toBe('sess-1');
  });

  it('still moves an untied project off an account only a person can mend', () => {
    const sup = makeSupervisor();
    chatOn(sup, work);
    sup._profileTrouble = { [work]: { cause: 'signed-out', since: Date.now() } };
    expect(sup.rowSessionFor(row())).toBe(null);
  });
});

describe('where a spawn goes', () => {
  function spawning(sup) {
    const seen = [];
    sup._hasSlotFor = () => true;
    sup.worksHere = () => true;
    sup._folderFirst = () => false;
    sup._photoFirst = () => false;
    sup.spawnPlan = (item, product, opts) => { seen.push({ plan: opts }); return { args: [], resumeProfile: opts.resumeSessionId ? side : null }; };
    sup.prepareClaudePermissions = () => { throw new Error('stop before the process'); };
    const pick = sup._pickProfile.bind(sup);
    sup._pickProfile = (...a) => { seen.push({ picked: true }); return pick(...a); };
    return seen;
  }
  const go = (sup, item, opts) => { try { sup.spawnWorker(item, opts); } catch (e) { if (e.message !== 'stop before the process') throw e; } };

  it('lets go of a session that lives on another account instead of resuming it there', () => {
    const sup = makeSupervisor(pins());
    const seen = spawning(sup);
    go(sup, { id: 'w-1', product: 'acme' }, { resumeSessionId: 'sess-9', profile: side });
    expect(seen[0].plan.resumeSessionId).toBe(null);
  });

  it('keeps the session when it already lives on the pinned account', () => {
    const sup = makeSupervisor(pins());
    const seen = spawning(sup);
    go(sup, { id: 'w-1', product: 'acme' }, { resumeSessionId: 'sess-9', profile: work });
    expect(seen[0].plan.resumeSessionId).toBe('sess-9');
  });

  it('waits when the pinned account is resting, and hands a reply back', () => {
    const sup = makeSupervisor(pins());
    const seen = spawning(sup);
    const back = [];
    sup.redeliverAnswer = (item, answer) => back.push(answer);
    sup._profileCooldown = { [work]: Date.now() + 60_000 };
    go(sup, { id: 'w-1', product: 'acme' }, {});
    go(sup, { id: 'w-2', product: 'acme', answer: 'go on' }, { continuation: true });
    expect(seen).toEqual([]);
    expect(back).toEqual(['go on']);
  });

  it('waits when the pinned account already carries its share, and still takes a reply', () => {
    const sup = makeSupervisor({ ...pins(), agentsAuto: false, maxConcurrentSessions: 1 });
    const seen = spawning(sup);
    sup.sessions.set('w-0', { itemId: 'w-0', product: 'acme', profile: work, engine: 'claude' });
    go(sup, { id: 'w-1', product: 'acme' }, {});
    expect(seen).toEqual([]);
    go(sup, { id: 'w-2', product: 'acme', answer: 'go on' }, { continuation: true });
    expect(seen.length).toBe(1);
  });

  it('does not count another account\'s sessions against the pinned one', () => {
    const sup = makeSupervisor({ ...pins(), agentsAuto: false, maxConcurrentSessions: 1 });
    const seen = spawning(sup);
    sup.sessions.set('w-0', { itemId: 'w-0', product: 'loose', profile: side, engine: 'claude' });
    go(sup, { id: 'w-1', product: 'acme' }, {});
    expect(seen.length).toBe(1);
  });
});

describe('setting it from the project page', () => {
  function config() {
    fs.writeFileSync(path.join(tmp, 'zero.config.json'), '{}');
    return { appDir: tmp, home: tmp, authProfiles: ['default', work, side] };
  }

  it('writes the pin, and takes it away again', () => {
    const c = config();
    setProjectSetting({ config: c }, { product: 'acme', key: 'account', value: work });
    setProjectSetting({ config: c }, { product: 'home', key: 'account', value: 'default' });
    expect(c.projectAccounts).toEqual({ acme: work, home: 'default' });
    expect(JSON.parse(fs.readFileSync(path.join(tmp, 'zero.config.json'), 'utf8')).projectAccounts).toEqual({ acme: work, home: 'default' });
    setProjectSetting({ config: c }, { product: 'acme', key: 'account', value: 'any' });
    setProjectSetting({ config: c }, { product: 'home', key: 'account', value: 'any' });
    expect(c.projectAccounts).toBe(undefined);
  });

  it('refuses an account that is not on this Mac', () => {
    const c = config();
    expect(() => setProjectSetting({ config: c }, { product: 'acme', key: 'account', value: path.join(tmp, '.claude-gone') })).toThrow(/unknown Claude account/);
    expect(c.projectAccounts).toBe(undefined);
  });
});
