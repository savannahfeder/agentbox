// A PROJECT RUNS ON ITS OWN CLAUDE ACCOUNT.
//
// WHAT WAS WRONG, reported on PR 13 by somebody who has a personal Claude
// subscription and an employer's signed in on one Mac: the app finds every
// login and hands sessions out round-robin, so an employer's code was running
// on the personal plan about half the time. `activeAccount` was the only answer
// the app had, and it narrows the WHOLE app to one login, which is no answer at
// all to a person who uses both.
//
// HOW IT IS MEASURED HERE: three logins in a temp folder, three projects, and
// `projectAccounts` tying two of them. Nothing spawns a process; the questions
// are which account each decision comes out on.
//
// WHAT CAN SILENTLY BREAK, which is what the cases below are:
//
//   1. A tie is honoured for the spawn and nowhere else, so the small-model call
//      that names a row -- whose prompt carries the row's own text -- goes out on
//      whichever login has room, and an employer's row is read on the personal
//      plan. The walk onto the OTHER ENGINE is the same leak through a second
//      door.
//   2. A tie is never re-checked, so a login signed out of leaves every worker
//      in that project pointed at a folder with no login in it, and the project
//      stops with every screen reading normal.
//   3. A tie and `activeAccount` disagree and the global one wins, which empties
//      the tied project's pool of one -- the same silent stop from the other end.
//   4. A chat that began before the tie is resumed where it lives, and the next
//      reply plus everything the transcript holds goes to the wrong login.
//   5. The tied account is counted against the whole engine's cap, so a project
//      tied to one of two logins is let through at twice its account's share.
//   6. A Claude tie is applied to a Codex run, which is a different subscription
//      the setting says nothing about.
//   7. An untied project stops rotating, and the Mac nobody has touched this
//      setting on behaves differently.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { readSettings, setProjectSetting } from '../main/settings.mjs';

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

  // THE LEAK IN 1, AS A LIST OF ENVIRONMENTS. A tied project's small-model call
  // is offered ONE account; an untied one is still offered all three.
  it('offers the small-model call the pinned account alone, and every account for an untied project', () => {
    const sup = makeSupervisor(pins());
    expect(sup._smallModelEnvs('claude', 'acme').map((e) => e.CLAUDE_CONFIG_DIR)).toEqual([work]);
    expect(sup._smallModelEnvs('claude', 'home').map((e) => e.CLAUDE_CONFIG_DIR)).toEqual([undefined]);
    expect(sup._smallModelEnvs('claude', 'loose').map((e) => e.CLAUDE_CONFIG_DIR)).toEqual([undefined, work, side]);
    expect(sup._smallModelEnvs('claude', null).map((e) => e.CLAUDE_CONFIG_DIR)).toEqual([undefined, work, side]);
  });

  // 2 AND 3 IN ONE LINE OF THE SUPERVISOR, so they are one case here.
  describe('a tie that names a login this Mac has not got', () => {
    const gone = () => path.join(tmp, '.claude-gone');

    it('is ignored, rather than pointing a worker at an empty folder', () => {
      const sup = makeSupervisor({ projectAccounts: { acme: gone() } });
      expect(sup._projectProfile('acme')).toBe(null);
      expect(sup._profileFitsProject(side, 'acme')).toBe(true);
      expect(sup._smallModelEnvs('claude', 'acme').map((e) => e.CLAUDE_CONFIG_DIR)).toEqual([undefined, work, side]);
    });

    // DOWN TO ONE LOGIN, which is the case the hidden picker made unfixable:
    // `lone` is a home holding `~/.claude` and no second account anywhere, so
    // `effectiveProfiles` cannot discover one off the disk either.
    it('is ignored even when it is the only name left, so the project keeps running', () => {
      const lone = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-one-account-'));
      try {
        login(path.join(lone, '.claude'), 'own');
        const sup = makeSupervisor({ home: lone, authProfiles: ['default'], projectAccounts: { acme: gone() } });
        expect(sup._profiles()).toEqual(['default']);
        expect(sup._projectProfile('acme')).toBe(null);
        expect(sup._smallModelEnvs('claude', 'acme').map((e) => e.CLAUDE_CONFIG_DIR)).toEqual([undefined]);
      } finally {
        fs.rmSync(lone, { recursive: true, force: true });
      }
    });
  });

  describe('a tie and the app-wide chosen account', () => {
    // THE DECISION, WRITTEN DOWN: the tie wins. It is the narrower statement and
    // made on this project's own page, and the other way round stops the project
    // dead with every screen reading normal.
    it('runs the project on its tie even when the app is narrowed to another login', () => {
      const sup = makeSupervisor({ ...pins(), activeAccount: { claude: side } });
      expect(sup._profilesFor('claude')).toEqual([side]);        // the app is narrowed
      expect(sup._projectProfile('acme')).toBe(work);            // the project is not
      expect(sup._smallModelEnvs('claude', 'acme').map((e) => e.CLAUDE_CONFIG_DIR)).toEqual([work]);
    });

    // AND A TIE THAT NAMES NOTHING REAL FALLS BACK TO THE NARROWED POOL, not to
    // every login: ignoring the tie must put the project where an untied one goes.
    it('falls back to the chosen account when the tie names a login that has gone', () => {
      const sup = makeSupervisor({ projectAccounts: { acme: path.join(tmp, '.claude-gone') }, activeAccount: { claude: side } });
      expect(sup._projectProfile('acme')).toBe(null);
      expect(sup._smallModelEnvs('claude', 'acme').map((e) => e.CLAUDE_CONFIG_DIR)).toEqual([side]);
    });
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

  // THE TIE BEATS THE APP-WIDE CHOICE HERE TOO: `side` is the one account the
  // app has been narrowed to, and a chat of this project's on it is still
  // dropped, because the project named the other one.
  it('drops a chat on the app-wide chosen account when the project named another', () => {
    const sup = makeSupervisor({ ...pins(), activeAccount: { claude: side } });
    chatOn(sup, side);
    expect(sup.rowSessionFor(row())).toBe(null);
  });

  it('keeps a chat wherever it lives once the tie names a login that has gone', () => {
    const sup = makeSupervisor({ projectAccounts: { acme: path.join(tmp, '.claude-gone') } });
    chatOn(sup, side);
    expect(sup.rowSessionFor(row())?.sessionId).toBe('sess-1');
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

  // A ROW STILL HAVING ITS FOLDER BUILT HAS NO SESSION YET, and in a tied
  // project its account is already decided, so the share has to count it or two
  // rows of the same project walk through a cap of one together.
  it('counts a row of the same tied project that is still being prepared', () => {
    const sup = makeSupervisor({ ...pins(), agentsAuto: false, maxConcurrentSessions: 1 });
    const seen = spawning(sup);
    sup._preparing.set('w-0', { item: { id: 'w-0', product: 'acme' }, opts: {}, engine: 'claude' });
    go(sup, { id: 'w-1', product: 'acme' }, {});
    expect(seen).toEqual([]);
  });

  // AND AN UNTIED ROW BEING PREPARED IS NOT COUNTED, because nothing has decided
  // where it goes yet; charging it to this account would hold the tied project up
  // for a session that may never land there.
  it('does not count a row being prepared in an untied project', () => {
    const sup = makeSupervisor({ ...pins(), agentsAuto: false, maxConcurrentSessions: 1 });
    const seen = spawning(sup);
    sup._preparing.set('w-0', { item: { id: 'w-0', product: 'loose' }, opts: {}, engine: 'claude' });
    go(sup, { id: 'w-1', product: 'acme' }, {});
    expect(seen.length).toBe(1);
  });

  it('starts an untied project as it always did, with nothing tied anywhere', () => {
    const sup = makeSupervisor();
    const seen = spawning(sup);
    go(sup, { id: 'w-1', product: 'loose' }, {});
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

// AND THE ROW HAS TO BE THERE TO UNDO A TIE. It is hidden on a one-account Mac,
// which is nearly every Mac, so signing out of the second login hid the row with
// the tie still written down: a setting nothing on any screen could reach.
describe('the row on the project page', () => {
  const source = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'renderer/src/components/Settings.tsx'), 'utf8');
  const guard = source.slice(0, source.indexOf('label="Claude account"')).split('\n').filter((l) => l.includes('w?.accounts ?? []')).pop();

  it('appears when a second account is signed in', () => {
    expect(guard).toContain("(w?.accounts ?? []).length > 1");
  });

  it('appears on its own when a tie is already written, however few accounts are left', () => {
    expect(guard).toContain("(current.account ?? 'any') !== 'any'");
  });
});

// WHAT THE PAGE IS TOLD, which is the other half of the same promise: a tie the
// supervisor will not honour must not be drawn as though it were in force.
describe('what the project page is told the tie is', () => {
  const settingsFor = (sup) => readSettings({
    config: { appDir: tmp, home: tmp, authProfiles: ['default', work, side], accountRoot: tmp },
    supervisor: sup,
    store: { listProducts: products, listItems: () => [], readInstructions: () => '' },
  }).projects;

  it('names the tied account, and says any for a project with none', () => {
    const sup = makeSupervisor(pins());
    const rows = settingsFor(sup);
    expect(rows.find((p) => p.slug === 'acme').account).toBe(work);
    expect(rows.find((p) => p.slug === 'loose').account).toBe('any');
  });

  it('says any for a tie whose account has been signed out', () => {
    const sup = makeSupervisor({ projectAccounts: { acme: path.join(tmp, '.claude-gone') } });
    expect(settingsFor(sup).find((p) => p.slug === 'acme').account).toBe('any');
  });
});
