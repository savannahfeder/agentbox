// A SESSION SOMEBODY STARTED IN A TERMINAL IS NOT IN THEIR INBOX.
//
// WHAT THIS FILE USED TO SAY, so the deletion is legible. Two defaults pulling
// opposite ways, and a pin in saveConfig to stop a stranger being flipped from
// one to the other by saving something unrelated. There is one default now,
// `off`, so both halves of that machinery are gone rather than adjusted.
//
// AND IT IS THE DEFAULT THAT REACHED HER, which is why this is the fix and not
// the setting she could have flipped herself. Measured 2026-08-27: her running
// app reads ~/Desktop/dev/zero/zero.config.json (dev build, so appDir rather
// than userData), the file exists, and it has no `outsideAgents` key in it. It
// resolved `all`, and every Claude Code session on the machine got a row.
//
// SEPARATED IS NOT DELETED. `listed` and `onTheRail` do not take a mode, so an
// outside session is still on its project's rail and still one click from her.
// The only thing this decides is the inbox.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig } from '../main/config.mjs';
import { outsideAgentsMode } from '../main/settings.mjs';
import { listed, onTheRail, reachesInbox } from '../shared/agents.mjs';
import { NAME } from '../shared/product-name.mjs';

let dir;

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-config-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const write = (obj) => fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify(obj, null, 2));
const onDisk = () => JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8'));

describe('nobody gets a row for a session they started themselves', () => {
  it(`is off on a Mac that has never run ${NAME}`, () => {
    expect(loadConfig(dir).freshInstall).toBe(true);
    expect(outsideAgentsMode(loadConfig(dir))).toBe('off');
  });

  // HER OWN FILE, as measured: it exists and it does not mention the setting.
  it('is off on an install whose config never mentioned the setting', () => {
    write({ posthogKey: 'x', storeRoot: '/tmp/d', maxConcurrentSessions: 3 });
    const config = loadConfig(dir);
    expect(config.freshInstall).toBe(false);
    expect(outsideAgentsMode(config)).toBe('off');
  });

  it('is off on an empty config file too', () => {
    write({});
    expect(outsideAgentsMode(loadConfig(dir))).toBe('off');
  });

  it('does not depend on whether the install is new, because nothing does now', () => {
    expect(outsideAgentsMode({ freshInstall: true })).toBe('off');
    expect(outsideAgentsMode({ freshInstall: false })).toBe('off');
  });
});

describe('a setting somebody actually chose still wins', () => {
  it('on a new install and an old one alike', () => {
    expect(outsideAgentsMode({ freshInstall: true, outsideAgents: 'all' })).toBe('all');
    expect(outsideAgentsMode({ freshInstall: false, outsideAgents: 'waiting' })).toBe('waiting');
    write({ outsideAgents: 'all' });
    expect(outsideAgentsMode(loadConfig(dir))).toBe('all');
  });

  it('is ignored when it is not one of the three', () => {
    expect(outsideAgentsMode({ freshInstall: true, outsideAgents: 'nonsense' })).toBe('off');
    expect(outsideAgentsMode({ freshInstall: false, outsideAgents: 'nonsense' })).toBe('off');
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
    expect(outsideAgentsMode(loadConfig(dir))).toBe('off');
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
    expect(outsideAgentsMode(loadConfig(dir))).toBe('off');
  });
});

// WHERE THEY ARE INSTEAD, because "separated" has to mean somewhere rather than
// nowhere. Neither of these rules takes a mode, so the default above cannot
// reach them.
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

  it('is out of the inbox on the default', () => {
    expect(reachesInbox(terminal, now, outsideAgentsMode({}))).toBe(false);
  });

  it('and still listed, and still on the rail, where she can open it', () => {
    expect(listed(terminal)).toBe(true);
    expect(onTheRail(terminal, now)).toBe(true);
  });
});
