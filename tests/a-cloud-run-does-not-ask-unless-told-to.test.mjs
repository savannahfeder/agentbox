// A CLOUD RUN DOES NOT ASK UNLESS TOLD TO.
//
// What was asked (2026-10-17): "because it's running in the cloud, it should
// ask way fewer questions in general." An unset cloud mode meant this
// computer's mode, so a cloud run on Auto (Claude Code) or Auto (Codex) put
// permission cards in front of someone who had walked away, about a throwaway
// machine that holds no key able to push or reach their computer. Measured on
// main: cloudPermissionArgs(args, null) left `--permission-mode auto` in place,
// and codexThreadParamsFor had no cloud branch at all, so a cloud Codex run got
// `workspace-write` + `on-request`.
//
// Now an unset cloud mode is Bypass Permissions for Claude Code and Full access
// for Codex. "Same as this computer" is still a choice, and a mode set on the
// thread itself still wins in the cloud.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloudClaudeMode, cloudCodexMode, CLOUD_SAME } from '../main/cloud-permission.mjs';
import { setWorkspaceSetting } from '../main/settings.mjs';

describe('the mode a cloud Claude Code run starts in', () => {
  it('unset, it does not ask', () => {
    expect(cloudClaudeMode(null)).toBe('bypassPermissions');
    expect(cloudClaudeMode(undefined)).toBe('bypassPermissions');
  });

  it('a mode picked for the cloud is the one used', () => {
    expect(cloudClaudeMode('auto')).toBe('auto');
    expect(cloudClaudeMode('default')).toBe('default');
  });

  it('"same as this computer" leaves this computer’s flag alone', () => {
    expect(cloudClaudeMode(CLOUD_SAME)).toBeNull();
  });

  it('must NOT loosen a thread whose own mode was set', () => {
    expect(cloudClaudeMode(null, 'plan')).toBeNull();
    expect(cloudClaudeMode('bypassPermissions', 'default')).toBeNull();
  });

  it('a Codex word on the thread is not a Claude Code mode, so the cloud default holds', () => {
    expect(cloudClaudeMode(null, 'full-access')).toBe('bypassPermissions');
  });
});

describe('the mode a cloud Codex run starts in', () => {
  it('unset, it does not ask', () => {
    expect(cloudCodexMode(null, null, 'auto')).toBe('full-access');
  });

  it('a mode picked for the cloud is the one used', () => {
    expect(cloudCodexMode('auto', null, 'read-only')).toBe('auto');
  });

  it('"same as this computer" is this computer’s mode', () => {
    expect(cloudCodexMode(CLOUD_SAME, null, 'read-only')).toBe('read-only');
  });

  it('must NOT loosen a thread whose own mode was set', () => {
    expect(cloudCodexMode(null, 'read-only', 'auto')).toBe('read-only');
  });

  it('a Claude Code word on the thread is not a Codex mode, so the cloud default holds', () => {
    expect(cloudCodexMode(null, 'plan', 'auto')).toBe('full-access');
  });
});

describe('saving the cloud’s modes', () => {
  const world = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-ask-'));
    return { config: { appDir: dir }, supervisor: { onChange() {} }, store: {}, dir };
  };

  it('keeps "same as this computer" for either engine', () => {
    const w = world();
    setWorkspaceSetting(w, { key: 'cloudPermission', value: CLOUD_SAME });
    setWorkspaceSetting(w, { key: 'cloudCodexMode', value: CLOUD_SAME });
    const saved = JSON.parse(fs.readFileSync(path.join(w.dir, 'zero.config.json'), 'utf8'));
    expect(saved.cloudPermission).toBe(CLOUD_SAME);
    expect(saved.cloudCodexMode).toBe(CLOUD_SAME);
    fs.rmSync(w.dir, { recursive: true, force: true });
  });

  it('keeps a Codex mode, and clears back to the default', () => {
    const w = world();
    setWorkspaceSetting(w, { key: 'cloudCodexMode', value: 'auto' });
    expect(w.config.cloudCodexMode).toBe('auto');
    setWorkspaceSetting(w, { key: 'cloudCodexMode', value: null });
    expect(w.config.cloudCodexMode).toBeNull();
    fs.rmSync(w.dir, { recursive: true, force: true });
  });

  it('must NOT save a word the engine does not know', () => {
    const w = world();
    expect(() => setWorkspaceSetting(w, { key: 'cloudCodexMode', value: 'bypassPermissions' })).toThrow();
    expect(() => setWorkspaceSetting(w, { key: 'cloudPermission', value: 'full-access' })).toThrow();
    fs.rmSync(w.dir, { recursive: true, force: true });
  });
});

describe('the runs themselves', () => {
  it('a cloud Claude Code run takes the cloud’s mode, and a run here does not', () => {
    const src = fs.readFileSync(new URL('../main/harnesses/claude.mjs', import.meta.url), 'utf8');
    // A cloud run's command line is made in one place, which a kit for the phone shares.
    const launch = src.slice(src.indexOf('cloudLaunch(sup, plan'), src.indexOf('  spawn(sup, plan'));
    expect(launch).toContain('cloudClaudeMode(sup.config.cloudPermission, plan.answerMode)');
    const cloud = src.slice(src.indexOf('if (cloud) {'), src.indexOf('// The binary is the one this definition names'));
    expect(cloud).toContain('claudeHarness.cloudLaunch(sup, plan');
    expect(src.slice(src.indexOf('// The binary is the one this definition names'))).not.toContain('cloudClaudeMode');
  });

  it('a cloud Codex thread starts in Full access, and one here in this computer’s mode', async () => {
    const { Supervisor } = await import('../main/supervisor.mjs');
    const sup = Object.create(Supervisor.prototype);
    sup.config = { codexMode: 'auto' };
    sup._codexModelWord = () => null;
    sup.codexModelRefusal = () => null;
    sup.codexEffortRefusal = () => null;
    const plan = { product: 'p', answerMode: null };
    const here = sup.codexThreadParamsFor(plan, '/w', [], null, '/h');
    const cloud = sup.codexThreadParamsFor(plan, '/w', [], null, '/h', { cloud: true });
    expect([here.sandbox, here.approvalPolicy]).toEqual(['workspace-write', 'on-request']);
    expect([cloud.sandbox, cloud.approvalPolicy]).toEqual(['danger-full-access', 'never']);
  });
});
