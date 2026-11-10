// A FRESH INSTALL SHOWS THE PERMISSION MODE ITS THREADS RUN IN.
//
// QA on a fresh Linux home (F-205): Settings › Claude Code drew no mode picker,
// only "Set by hand in zero.config.json". Nobody had set anything. With no
// `sessionArgs` in the config, Settings read an empty list, found no
// `--permission-mode` and answered `custom`, while the supervisor starts every
// worker in auto (`defaultSessionArgs`). Picking a mode would also have dropped
// the store grant that default carries. Measured by calling the settings code
// with no `sessionArgs` and reading what it answered and saved.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workspaceSessionArgs, permissionMode, setWorkspaceSetting, setProjectSetting } from '../main/settings.mts';
import { MODE_SENTENCE } from '../renderer/src/modes.ts';

const DEFAULT = ['--allowedTools', 'mcp__agentbox', '--permission-mode', 'auto'];
const supervisor = { defaultSessionArgs: () => DEFAULT, onChange() {} };

describe('the mode Settings reads', () => {
  it('with nothing saved, is the one workers start in', () => {
    expect(permissionMode(workspaceSessionArgs({}, supervisor))).toBe('auto');
    expect(permissionMode(workspaceSessionArgs({ sessionArgs: null }, supervisor))).toBe('auto');
  });

  it('with a saved list, is that list', () => {
    expect(permissionMode(workspaceSessionArgs({ sessionArgs: ['--permission-mode', 'plan'] }, supervisor))).toBe('plan');
  });

  it('must NOT round a hand-written list with no mode to a mode', () => {
    expect(permissionMode(workspaceSessionArgs({ sessionArgs: ['--allowedTools', 'Bash'] }, supervisor))).toBe('custom');
  });
});

describe('picking a mode on a fresh install', () => {
  it('keeps the grant the default carried', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-perm-'));
    const w = { config: { appDir: dir }, supervisor, store: {} };
    setWorkspaceSetting(w, { key: 'permission', value: 'acceptEdits' });
    expect(w.config.sessionArgs).toEqual(['--allowedTools', 'mcp__agentbox', '--permission-mode', 'acceptEdits']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a project override keeps it too', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-perm-'));
    const w = { config: { appDir: dir }, supervisor, store: { listProducts: () => [{ slug: 'p' }] } };
    setProjectSetting(w, { product: 'p', key: 'permission', value: 'plan' });
    expect(w.config.projectSessionArgs.p).toEqual(['--allowedTools', 'mcp__agentbox', '--permission-mode', 'plan']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('picking a model must NOT drop the mode workers start in', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-perm-'));
    const w = { config: { appDir: dir }, supervisor, store: {} };
    setWorkspaceSetting(w, { key: 'model', value: 'opus' });
    expect(permissionMode(w.config.sessionArgs)).toBe('auto');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the hand-set sentence', () => {
  it('must NOT name a file nobody knows', () => {
    expect(MODE_SENTENCE.custom).not.toMatch(/zero\.config\.json/);
  });
});
