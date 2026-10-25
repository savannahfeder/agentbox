// A CLOUD RUN HAS ITS OWN PERMISSION MODE.
//
// What was asked (2026-10-16): "the permissions look like they're generalized
// to all types of accounts, whether in the cloud or on this computer...
// wouldn't it be logical for that to differ by setup". It was one setting:
// main/harnesses/claude.mjs handed a cloud run exactly the arguments a run on
// this computer gets, --permission-mode included. A cloud run works on a
// throwaway copy with nobody there to approve anything, so it may want a
// looser mode than this computer.
//
// The fix: a cloud permission mode of its own. Only the permission flag of a
// cloud run is rewritten; every other argument stays where it was. What an
// unset cloud mode means is in a-cloud-run-does-not-ask-unless-told-to.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloudPermissionArgs, setWorkspaceSetting } from '../main/settings.mjs';

const RUN = ['-p', '--output-format', 'stream-json', '--allowedTools', 'mcp__agentbox', 'Bash(git fetch:*)', '--permission-mode', 'auto', '--model', 'opus'];

describe('the flag a cloud run is given', () => {
  it('her case: auto here, bypass in the cloud', () => {
    expect(cloudPermissionArgs(RUN, 'bypassPermissions')).toEqual(RUN.map((a) => (a === 'auto' ? 'bypassPermissions' : a)));
  });

  it('with no mode to put on, the run keeps the flag it has', () => {
    expect(cloudPermissionArgs(RUN, null)).toEqual(RUN);
    expect(cloudPermissionArgs(RUN, undefined)).toEqual(RUN);
  });

  it('the equals form and the skip-permissions shorthand are replaced, not doubled', () => {
    expect(cloudPermissionArgs(['-p', '--permission-mode=plan', 'x'], 'auto')).toEqual(['-p', '--permission-mode', 'auto', 'x']);
    expect(cloudPermissionArgs(['--dangerously-skip-permissions', '-p'], 'auto')).toEqual(['--permission-mode', 'auto', '-p']);
  });

  it('a run with no permission flag gets one first, where no list can swallow it', () => {
    expect(cloudPermissionArgs(['--allowedTools', 'a', 'b'], 'auto')).toEqual(['--permission-mode', 'auto', '--allowedTools', 'a', 'b']);
  });

  it('must NOT pass a mode Claude Code does not know', () => {
    expect(() => cloudPermissionArgs(RUN, 'yolo')).toThrow();
  });
});

describe('saving it', () => {
  const world = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-perm-'));
    return { config: { appDir: dir }, supervisor: { onChange() {} }, store: {}, dir };
  };

  it('keeps the cloud’s mode, and clears it back to this computer’s', () => {
    const w = world();
    setWorkspaceSetting(w, { key: 'cloudPermission', value: 'bypassPermissions' });
    expect(w.config.cloudPermission).toBe('bypassPermissions');
    expect(JSON.parse(fs.readFileSync(path.join(w.dir, 'zero.config.json'), 'utf8')).cloudPermission).toBe('bypassPermissions');
    setWorkspaceSetting(w, { key: 'cloudPermission', value: null });
    expect(w.config.cloudPermission).toBeNull();
    fs.rmSync(w.dir, { recursive: true, force: true });
  });

  it('must NOT save a mode Claude Code does not know', () => {
    const w = world();
    expect(() => setWorkspaceSetting(w, { key: 'cloudPermission', value: 'yolo' })).toThrow();
    fs.rmSync(w.dir, { recursive: true, force: true });
  });
});

describe('a cloud run', () => {
  it('is spawned with the cloud’s flag, and a run here is not', () => {
    const src = fs.readFileSync(new URL('../main/harnesses/claude.mjs', import.meta.url), 'utf8');
    // Made in one place (`cloudLaunch`), which a kit for the phone shares.
    const launch = src.slice(src.indexOf('cloudLaunch(sup, plan'), src.indexOf('  spawn(sup, plan'));
    expect(launch).toContain('cloudPermissionArgs(plan.args, cloudClaudeMode(sup.config.cloudPermission, plan.answerMode))');
    const cloud = src.slice(src.indexOf('if (cloud) {'), src.indexOf('// The binary is the one this definition names'));
    expect(cloud).toContain('claudeHarness.cloudLaunch(sup, plan');
    expect(src.slice(src.indexOf('// The binary is the one this definition names'))).not.toContain('cloudPermissionArgs');
  });
});
