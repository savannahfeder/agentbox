// A SESSION YOU STARTED YOURSELF IS IN YOUR INBOX UNTIL YOU TURN IT OFF.
//
// The default was `off` from 2026-08-27, when every Claude Code session on the
// founder's Mac got a row in Needs you, busy or not. Since w-34f79ab66e a
// session working on what she typed is In progress instead, Codex sessions are
// read too, and the founder asked on 2026-11-23: "This should automatically be
// enabled and we need an easy entry point to configure that or turn that off."
// So the one default is `all`, nothing is written on anybody's behalf, and a
// choice actually made still wins. The ways to change it are in the session's
// own menu, the inbox's View and filters, ⌘K and Settings.
//
// SEPARATED IS NOT DELETED. `listed` and `onTheRail` do not take a mode, so with
// it off an outside session is still on its project's rail.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig } from '../main/config.mts';
import { outsideAgentsMode } from '../main/settings.mts';
import { listed, onTheRail, reachesInbox } from '../shared/agents.mts';
import { NAME } from '../shared/product-name.mjs';

let dir;

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-config-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const write = (obj) => fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify(obj, null, 2));
const onDisk = () => JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8'));

describe('a session you started yourself gets a row unless you said otherwise', () => {
  it(`is on on a Mac that has never run ${NAME}`, () => {
    expect(loadConfig(dir).freshInstall).toBe(true);
    expect(outsideAgentsMode(loadConfig(dir))).toBe('all');
  });

  // HER OWN FILE, as measured: it exists and it does not mention the setting.
  it('is on on an install whose config never mentioned the setting', () => {
    write({ posthogKey: 'x', storeRoot: '/tmp/d', maxConcurrentSessions: 3 });
    const config = loadConfig(dir);
    expect(config.freshInstall).toBe(false);
    expect(outsideAgentsMode(config)).toBe('all');
  });

  it('is on on an empty config file too', () => {
    write({});
    expect(outsideAgentsMode(loadConfig(dir))).toBe('all');
  });

  it('does not depend on whether the install is new, because nothing does now', () => {
    expect(outsideAgentsMode({ freshInstall: true })).toBe('all');
    expect(outsideAgentsMode({ freshInstall: false })).toBe('all');
  });
});

describe('a setting somebody actually chose still wins', () => {
  it('on a new install and an old one alike', () => {
    expect(outsideAgentsMode({ freshInstall: true, outsideAgents: 'off' })).toBe('off');
    expect(outsideAgentsMode({ freshInstall: false, outsideAgents: 'waiting' })).toBe('waiting');
    write({ outsideAgents: 'off' });
    expect(outsideAgentsMode(loadConfig(dir))).toBe('off');
  });

  it('is ignored when it is not one of the three', () => {
    expect(outsideAgentsMode({ freshInstall: true, outsideAgents: 'nonsense' })).toBe('all');
    expect(outsideAgentsMode({ freshInstall: false, outsideAgents: 'nonsense' })).toBe('all');
  });
});

// THE PIN IS GONE, and this is what replaces the four tests that covered it.
// It existed only because the default moved under a stranger the moment a
// config file appeared. One default cannot move, so nothing is written on
// anybody's behalf and their file says exactly what they chose.
describe('saving a setting writes nothing else', () => {
  it('does not write outsideAgents into a new install that never chose it', () => {
    const config = loadConfig(dir);
    expect(config.freshInstall).toBe(true);
    saveConfig(config, { driveEnabled: true });
    expect('outsideAgents' in onDisk()).toBe(false);
    expect(onDisk().driveEnabled).toBe(true);
    expect(outsideAgentsMode(loadConfig(dir))).toBe('all');
  });

  it('writes it when that is the setting being saved, and only then', () => {
    const config = loadConfig(dir);
    saveConfig(config, { outsideAgents: 'all' });
    expect(onDisk().outsideAgents).toBe('all');
  });

  it('never writes it into a config that already exists', () => {
    write({ maxConcurrentSessions: 2 });
    const config = loadConfig(dir);
    saveConfig(config, { driveEnabled: true });
    expect('outsideAgents' in onDisk()).toBe(false);
    expect(outsideAgentsMode(loadConfig(dir))).toBe('all');
  });
});

// WHERE THEY ARE WHEN IT IS OFF, because off has to mean somewhere rather than
// nowhere. Neither of these rules takes a mode, so the setting cannot reach them.
describe('an outside session is still on its project rail', () => {
  const terminal = {
    pid: 53352,
    name: 'symphony-claude-b1',
    cwd: '/Users/you/dev/symphony-claude',
    about: 'Rewriting the Task 13 review',
    status: 'idle',
    waitingFor: null,
    lastActiveAt: Date.parse('2026-08-27T16:00:00Z'),
    startedByZero: false,
  };
  const now = Date.parse('2026-08-27T17:00:00Z');

  it('is in the inbox on the default, and out of it when turned off', () => {
    expect(reachesInbox(terminal, now, outsideAgentsMode({}))).toBe(true);
    expect(reachesInbox(terminal, now, outsideAgentsMode({ outsideAgents: 'off' }))).toBe(false);
  });

  it('and still listed, and still on the rail, where she can open it', () => {
    expect(listed(terminal)).toBe(true);
    expect(onTheRail(terminal, now)).toBe(true);
  });
});
