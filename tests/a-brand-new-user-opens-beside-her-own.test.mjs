// BEING A BRAND NEW USER, ON THE APP SHE DOWNLOADED.
//
// The dangerous version of this feature is a reset: forget everything and start
// again. That would take her real projects, settings and store with it, on the
// app she actually works in. So the shape is a SECOND Agentbox in a throwaway
// home, and these tests pin the three properties that make that safe:
//
//   1. Nothing of hers is read out of or written into her real home.
//   2. BOTH environment variables are set. HOME alone shares her userData, the
//      new copy loses the single-instance lock race and quits in half a second,
//      which is the "it crashes immediately" she reported on 2026-08-20.
//   3. It never deletes anything.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HOMES, existingHomes, freshEnv, makeHome, prepareHome } from '../shared/fresh-user-home.mjs';
import { openFreshUser, relaunchCommand } from '../main/fresh-user.mjs';
import { configDir } from '../main/config.mjs';
import { DEMO_ENV } from '../shared/demo-world.mjs';
import { NAME, Name, envNames } from '../shared/product-name.mjs';

let realHome;

beforeEach(() => {
  realHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-test-real-home-'));
});

afterEach(() => {
  fs.rmSync(realHome, { recursive: true, force: true });
});

describe('a throwaway home', () => {
  it('is made under one folder and named by the clock, so the newest sorts last', () => {
    const a = makeHome(new Date('2026-08-23T04:00:00Z'));
    const b = makeHome(new Date('2026-08-23T05:00:00Z'));
    expect(path.dirname(a)).toBe(HOMES);
    expect([a, b].sort()).toEqual([a, b]);
    expect(existingHomes()).toContain(a);
    expect(existingHomes()).toContain(b);
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  });

  it('links Claude Code and the keychain, because without them the copy cannot run an agent', () => {
    fs.mkdirSync(path.join(realHome, '.local/bin'), { recursive: true });
    fs.writeFileSync(path.join(realHome, '.local/bin/claude'), '#!/bin/sh\n');
    fs.mkdirSync(path.join(realHome, 'Library/Keychains'), { recursive: true });

    const home = makeHome(new Date('2026-08-23T06:00:00Z'));
    const out = prepareHome(home, { realHome });

    expect(out.claudeBin).toBe(true);
    expect(out.keychain).toBe(true);
    // Symlinks, not copies. Nothing is duplicated onto disk.
    expect(fs.lstatSync(path.join(home, '.local/bin/claude')).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(home, 'Library/Keychains')).isSymbolicLink()).toBe(true);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('says so rather than throwing when this Mac has neither', () => {
    const home = makeHome(new Date('2026-08-23T06:01:00Z'));
    const out = prepareHome(home, { realHome });
    expect(out.claudeBin).toBe(false);
    expect(out.keychain).toBe(false);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('only links her Claude Code sessions when it is asked to', () => {
    fs.mkdirSync(path.join(realHome, '.claude'), { recursive: true });

    const without = makeHome(new Date('2026-08-23T06:02:00Z'));
    expect(prepareHome(without, { realHome, withAgents: false }).agents).toBe(false);
    expect(fs.existsSync(path.join(without, '.claude'))).toBe(false);

    const with_ = makeHome(new Date('2026-08-23T06:03:00Z'));
    expect(prepareHome(with_, { realHome, withAgents: true }).agents).toBe(true);
    expect(fs.existsSync(path.join(with_, '.claude'))).toBe(true);

    fs.rmSync(without, { recursive: true, force: true });
    fs.rmSync(with_, { recursive: true, force: true });
  });
});

describe('the environment a fresh copy is launched with', () => {
  // THIS IS THE ONE THAT MATTERS. `HOME` alone does not move
  // app.getPath('appData') on macOS, so the fresh copy shares her userData,
  // loses the single-instance lock and quits. Both, always.
  it('sets HOME and CFFIXED_USER_HOME to the same throwaway folder', () => {
    const env = freshEnv('/tmp/agentbox-fresh-user/x', { PATH: '/usr/bin', HOME: '/Users/real' });
    expect(env.HOME).toBe('/tmp/agentbox-fresh-user/x');
    expect(env.CFFIXED_USER_HOME).toBe('/tmp/agentbox-fresh-user/x');
    expect(env.PATH).toBe('/usr/bin');
  });

  // AND THE ONE THAT WAS WRONG THE WHOLE TIME. `main.mjs` writes the store root
  // into its own environment so the store modules can read it at call time, and
  // this spread that straight into the child. The copy that was meant to be a
  // stranger got a throwaway home, no config file and the defaults, and then
  // read the store root out of the environment anyway and opened HER inbox.
  // She sent a screenshot of it on 2026-09-27: her own rows, the personal ones
  // among them, with no first run in front of them.
  it('hands the copy no store root of hers, under any name the app has had', () => {
    const hers = { PATH: '/usr/bin', HOME: '/Users/real' };
    for (const key of envNames('HOME')) hers[key] = '/Users/real/Zero';
    const env = freshEnv('/tmp/agentbox-fresh-user/x', hers);
    for (const key of envNames('HOME')) expect(env[key], `${key} reached the fresh copy`).toBeUndefined();
  });

  // A fresh user is an ordinary first launch. A copy started from a terminal
  // that had these in it would show canned data, or never start an agent, and
  // either way it is not what a stranger sees.
  it('leaves the fixture and supervisor switches behind too', () => {
    const env = freshEnv('/tmp/agentbox-fresh-user/x', {
      PATH: '/usr/bin', ZERO_FIXTURES: 'crowded', ZERO_NO_SUPERVISOR: '1',
    });
    expect(env.ZERO_FIXTURES).toBeUndefined();
    expect(env.ZERO_NO_SUPERVISOR).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
  });
});

// THE OTHER HALF OF THE SAME LEAK, AND THE HALF NO ENVIRONMENT VARIABLE CAN
// FIX. Her app runs from source, so `zero.config.json` is read out of the
// CHECKOUT. A throwaway home moves the user data folder and moves nothing about
// the checkout, so the copy that was meant to be a stranger read her file off
// disk and took her store root, her account id, her PostHog key and her session
// arguments from it. That is what the screenshot on 2026-09-27 shows: her own
// inbox in the new window, personal rows and all, with no first run in front of
// it. Stripping the environment alone would have left this exactly as it was.
describe('which config a copy reads', () => {
  const appDir = '/Users/real/Astral';
  const userData = '/tmp/agentbox-fresh-user/x/Library/Application Support/agentbox';

  it('is the checkout when she is running her own app from source', () => {
    expect(configDir({ appDir, userData, packaged: false, env: { PATH: '/usr/bin' } })).toBe(appDir);
  });

  it('is the user data folder when packaged, because the bundle is signed', () => {
    expect(configDir({ appDir, userData, packaged: true, env: { PATH: '/usr/bin' } })).toBe(userData);
  });

  it('is never the checkout for a fresh copy, even run from source', () => {
    const env = freshEnv('/tmp/agentbox-fresh-user/x', { PATH: '/usr/bin' });
    expect(configDir({ appDir, userData, packaged: false, env })).toBe(userData);
  });

  it('is never the checkout for a demo copy either', () => {
    expect(configDir({ appDir, userData, packaged: false, env: { [DEMO_ENV]: '1' } })).toBe(userData);
  });
});

describe('what gets run', () => {
  it('is the app itself when packaged, with no arguments', () => {
    const cmd = relaunchCommand({ execPath: `/Applications/Astral.app/Contents/MacOS/${NAME}`, packaged: true });
    expect(cmd).toEqual({ bin: `/Applications/Astral.app/Contents/MacOS/${NAME}`, args: [] });
  });

  // Electron on its own opens its default window rather than this app, so the
  // app directory has to be handed back to it when running from source.
  it('is Electron plus the app directory when running from source', () => {
    const cmd = relaunchCommand({
      execPath: '/repo/node_modules/electron/dist/Electron',
      argv: ['/repo/node_modules/electron/dist/Electron', '/repo'],
      packaged: false,
    });
    expect(cmd).toEqual({ bin: '/repo/node_modules/electron/dist/Electron', args: ['/repo'] });
  });
});

describe('opening one', () => {
  it('spawns the app detached, in the throwaway home, and deletes nothing', () => {
    const before = fs.readdirSync(realHome);
    const calls = [];
    const bin = path.join(realHome, Name);
    fs.writeFileSync(bin, '');

    const out = openFreshUser({
      execPath: bin,
      packaged: true,
      withAgents: false,
      now: new Date('2026-08-23T07:00:00Z'),
      spawnFn: (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { pid: 4242, unref() {} }; },
    });

    expect(out.ok).toBe(true);
    expect(out.pid).toBe(4242);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe(bin);
    expect(calls[0].opts.detached).toBe(true);
    expect(calls[0].opts.env.HOME).toBe(out.home);
    expect(calls[0].opts.env.CFFIXED_USER_HOME).toBe(out.home);
    // Her real home is exactly as it was. Nothing read out, nothing written in.
    expect(fs.readdirSync(realHome)).toEqual(before.concat(Name).sort());
    fs.rmSync(out.home, { recursive: true, force: true });
  });

  it('reports why rather than pretending, when the app is not where it should be', () => {
    const out = openFreshUser({
      execPath: `/nowhere/at/all/${NAME}`,
      packaged: true,
      now: new Date('2026-08-23T07:01:00Z'),
      spawnFn: () => { throw new Error('should not be reached'); },
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/Cannot find this app/);
    fs.rmSync(out.home, { recursive: true, force: true });
  });

  it('says out loud when the copy will have no agents to offer', () => {
    const bin = path.join(realHome, Name);
    fs.writeFileSync(bin, '');
    const out = openFreshUser({
      execPath: bin,
      packaged: true,
      withAgents: true,
      now: new Date('2026-08-23T07:02:00Z'),
      spawnFn: () => ({ pid: 1, unref() {} }),
    });
    expect(out.ok).toBe(true);
    // This Mac really does have ~/.claude, so the note is about the two that
    // are checked against the real home; what is pinned is that notes exist as
    // sentences rather than as silence.
    expect(Array.isArray(out.notes)).toBe(true);
    fs.rmSync(out.home, { recursive: true, force: true });
  });
});
