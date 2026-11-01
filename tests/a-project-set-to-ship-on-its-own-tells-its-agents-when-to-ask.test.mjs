// A PROJECT SET TO SHIP ON ITS OWN TELLS ITS AGENTS WHEN TO ASK (w-e4d49a1539).
//
// Every finished change waited for a yes, because the only rule an agent had
// was the person's own "wait for my approval before shipping". Most of those
// changes were fixes nobody could see, and the person was the bottleneck on
// every one. A project now says how much it wants to be asked
// (`shared/ship-mode.mjs`), and the agent is told which changes ship without
// asking, which get a second model's review first, and which come to the
// person with pictures.
//
// Measured by building the brief for each setting. A project nobody set must
// be briefed exactly as before, word for word, so that turning nothing on
// changes nothing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHIP_MODES, isShipMode, shipModeBrief, shipModeOf } from '../shared/ship-mode.mjs';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-mode-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('every way an agent is started or woken', async () => {
  const { Store } = await import('../main/store.mjs');
  const { Supervisor } = await import('../main/supervisor.mjs');
  async function briefs({ mode, ships }) {
    const root = path.join(tmp, 'store');
    const repo = path.join(tmp, 'repo');
    const userDir = path.join(tmp, 'user');
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(path.join(root, 'team'), { recursive: true });
    fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
    if (ships) fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ team: { script: 'scripts/ship.mjs' } }));
    const config = { accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent', ...(mode ? { shipModes: { team: mode } } : {}) };
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

  it('carries the rules when the project ships on its own', async () => {
    for (const b of await briefs({ mode: 'unseen', ships: true })) {
      expect(b).toMatch(/# How this task ships/);
      expect(b).toMatch(/# When this change ships/);
      expect(b).not.toMatch(/Whether to wait for approval first is set by the\s+instructions you were given/);
    }
  });

  it('carries them on a project the app does not ship for, too', async () => {
    for (const b of await briefs({ mode: 'tested', ships: false })) {
      expect(b).not.toMatch(/# How this task ships/);
      expect(b).toMatch(/# When this change ships/);
    }
  });

  it('carries nothing new on a project that asks first', async () => {
    for (const b of await briefs({ mode: null, ships: true })) {
      expect(b).not.toMatch(/# When this change ships/);
      expect(b).toMatch(/Whether to wait for approval first is set by the\s+instructions you were given/);
    }
  });
});

describe('the setting', () => {
  it('has three answers, and asking first is the one a project starts on', () => {
    expect(SHIP_MODES).toEqual(['ask', 'unseen', 'tested']);
    expect(shipModeOf({}, 'team')).toBe('ask');
    expect(shipModeOf({ shipModes: { team: 'unseen' } }, 'team')).toBe('unseen');
    expect(shipModeOf({ shipModes: { team: 'unseen' } }, 'other')).toBe('ask');
  });

  it('reads anything it does not know as asking first', () => {
    expect(shipModeOf({ shipModes: { team: 'yolo' } }, 'team')).toBe('ask');
    expect(shipModeOf({ shipModes: null }, 'team')).toBe('ask');
    expect(isShipMode('tested')).toBe(true);
    expect(isShipMode('always')).toBe(false);
  });
});

describe('the project page', async () => {
  const { loadConfig } = await import('../main/config.mjs');
  const { readSettings, setProjectSetting } = await import('../main/settings.mjs');
  const { Supervisor } = await import('../main/supervisor.mjs');
  const store = { listItems: () => [], listProducts: () => [{ slug: 'acme', name: 'Acme', dir: '/tmp/acme' }], isDue: () => true, readInstructions: () => '' };
  const shown = (dir) => {
    const config = loadConfig(dir);
    return readSettings({ config, supervisor: new Supervisor(config, store, dir), store }).projects[0].shipMode;
  };
  const set = (dir, value) => {
    const config = loadConfig(dir);
    setProjectSetting({ config, supervisor: new Supervisor(config, store, dir) }, { product: 'acme', key: 'shipMode', value });
  };

  it('starts on asking first, and keeps what is chosen', () => {
    expect(shown(tmp)).toBe('ask');
    set(tmp, 'unseen');
    expect(shown(tmp)).toBe('unseen');
    expect(loadConfig(tmp).shipModes).toEqual({ acme: 'unseen' });
  });

  it('leaves nothing in the config once it is back on asking first', () => {
    set(tmp, 'tested');
    set(tmp, 'ask');
    expect(shown(tmp)).toBe('ask');
    expect(loadConfig(tmp).shipModes).toBeUndefined();
  });

  it('refuses an answer it does not know', () => {
    expect(() => set(tmp, 'always')).toThrow(/not a ship mode/);
    expect(shown(tmp)).toBe('ask');
  });
});

describe('what the agent is told', () => {
  it('is nothing at all when the project asks first', () => {
    expect(shipModeBrief('ask')).toBe('');
    expect(shipModeBrief(undefined)).toBe('');
  });

  it('ships a fix nobody sees without asking', () => {
    const b = shipModeBrief('unseen');
    expect(b).toMatch(/# When this change ships/);
    expect(b).toMatch(/standing approval/);
    expect(b).toMatch(/outranks a general rule in their instructions to ask/);
    expect(b).toMatch(/1\. A small fix nobody sees/);
  });

  it('has a second model review a wide-reaching fix before it ships', () => {
    const b = shipModeBrief('unseen');
    expect(b).toMatch(/2\. A fix nobody sees, with a wide reach/);
    expect(b).toMatch(/second model/);
    expect(b).toMatch(/If no second model can run, ask them/);
  });

  it('brings anything on screen to the person with pictures, and does not ship it', () => {
    const b = shipModeBrief('unseen');
    expect(b).toMatch(/3\. A change people can see/);
    expect(b).toMatch(/screenshots/);
    expect(b).toMatch(/Do not ship it/);
    expect(b).toMatch(/4\. A big change/);
    expect(b).toMatch(/synthetic power users/);
    expect(b).toMatch(/several at once/);
  });

  it('ships a tested change on screen too, when the project asks for that', () => {
    const b = shipModeBrief('tested');
    expect(b).toMatch(/synthetic power users/);
    expect(b).not.toMatch(/Do not ship it/);
    expect(b).toMatch(/ship it without asking/);
  });

  it('has the agent say which kind of change it was, so the person can check its call', () => {
    expect(shipModeBrief('unseen')).toMatch(/Your answer says which of the four your change was and why/);
  });

  it('settles a doubt by asking more, and lets the person still ask to see anything', () => {
    for (const mode of ['unseen', 'tested']) {
      const b = shipModeBrief(mode);
      expect(b).toMatch(/When you are unsure between two, take the later one/);
      expect(b).toMatch(/what they said wins/);
    }
  });
});
