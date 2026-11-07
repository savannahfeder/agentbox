// AN ENGINE NOBODY SET UP IS NOT STARTED TO ASK WHETHER IT IS SIGNED IN (F-203).
//
// Launched with an empty HOME, the app wrote ~/.claude, ~/.claude.json and
// ~/.codex within seconds, before anyone picked an engine. Measured with the
// headless server on a fresh HOME and a spawn trace: both came from
// `claude auth status --json` and `codex login status`, which the app runs at
// launch and again when the first-run screen opens, and each program makes its
// config folder the first time it runs. A home with neither folder was never
// signed in, so the answer is "no" without running anything.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngineSetup, engineSetUpHere } from '../main/engine-setup.mts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const freshHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'engine-never-set-up-'));

function setup(env) {
  const spawned = [];
  const told = [];
  const s = createEngineSetup({
    env,
    find: async (engine) => ({ found: true, path: `/bin/${engine}` }),
    spawn: (file, args) => { spawned.push([file, ...args].join(' ')); return { exit: Promise.resolve(0), kill() {} }; },
    wait: () => new Promise(() => {}),
    onSignIn: (engine, yes) => told.push([engine, yes]),
    setUpHere: engineSetUpHere,
  });
  return { s, spawned, told };
}

describe('a home where an engine was never set up', () => {
  it('answers signed out for both without starting either', async () => {
    const { s, spawned, told } = setup({ HOME: freshHome() });
    expect(await s.signedInNow('claude', '/bin/claude')).toBe(false);
    expect(await s.signedInNow('codex', '/bin/codex')).toBe(false);
    expect(spawned).toEqual([]);
    expect(told).toEqual([['claude', false], ['codex', false]]);
  });

  it('tells the first-run screen found but not signed in, for certain', async () => {
    const { s, spawned } = setup({ HOME: freshHome() });
    expect(await s.readiness('claude')).toEqual({ engine: 'claude', found: true, signedIn: false, certain: true });
    expect(spawned).toEqual([]);
  });
});

describe('a home where an engine has been used still asks it', () => {
  it('asks Claude Code when ~/.claude.json is there', async () => {
    const HOME = freshHome();
    fs.writeFileSync(path.join(HOME, '.claude.json'), '{}');
    const { s, spawned } = setup({ HOME });
    expect(await s.signedInNow('claude', '/bin/claude')).toBe(true);
    expect(spawned).toHaveLength(1);
  });

  it('asks Claude Code when only ~/.claude is there', async () => {
    const HOME = freshHome();
    fs.mkdirSync(path.join(HOME, '.claude'));
    const { s, spawned } = setup({ HOME });
    expect(await s.signedInNow('claude', '/bin/claude')).toBe(true);
    expect(spawned).toHaveLength(1);
  });

  it('asks Codex when ~/.codex is there, and not Claude Code beside it', async () => {
    const HOME = freshHome();
    fs.mkdirSync(path.join(HOME, '.codex'));
    const { s, spawned } = setup({ HOME });
    expect(await s.signedInNow('codex', '/bin/codex')).toBe(true);
    expect(await s.signedInNow('claude', '/bin/claude')).toBe(false);
    expect(spawned).toEqual(['/bin/codex login status']);
  });
});

describe('the folders the engines themselves read', () => {
  it('follows CLAUDE_CONFIG_DIR and CODEX_HOME rather than the default folders', () => {
    const HOME = freshHome();
    fs.mkdirSync(path.join(HOME, '.claude'));
    fs.mkdirSync(path.join(HOME, '.codex'));
    const elsewhere = freshHome();
    expect(engineSetUpHere('claude', { HOME, CLAUDE_CONFIG_DIR: path.join(HOME, 'missing') })).toBe(false);
    expect(engineSetUpHere('claude', { HOME: freshHome(), CLAUDE_CONFIG_DIR: elsewhere })).toBe(true);
    expect(engineSetUpHere('codex', { HOME, CODEX_HOME: path.join(HOME, 'missing') })).toBe(false);
    expect(engineSetUpHere('codex', { HOME: freshHome(), CODEX_HOME: elsewhere })).toBe(true);
  });

  it('still asks when a key in the environment could sign it in without a folder', () => {
    expect(engineSetUpHere('claude', { HOME: freshHome(), ANTHROPIC_API_KEY: 'x' })).toBe(true);
    expect(engineSetUpHere('claude', { HOME: freshHome(), CLAUDE_CODE_OAUTH_TOKEN: 'x' })).toBe(true);
    expect(engineSetUpHere('codex', { HOME: freshHome(), OPENAI_API_KEY: 'x' })).toBe(true);
  });
});

it('the app wires the check in', () => {
  expect(fs.readFileSync(path.join(root, 'main/ipc.mts'), 'utf8')).toMatch(/setUpHere:\s*engineSetUpHere/);
});
