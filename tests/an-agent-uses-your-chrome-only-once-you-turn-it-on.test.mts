// AN AGENT USES YOUR CHROME ONLY ONCE YOU TURN IT ON.
//
// What was asked (w-f1352585da, 2026-11-11): "agents never drive my own
// Chrome" was a rule for every user, and the person who made it said it should
// not be: "it might block some users, but i do like it as a rule for me." So it
// is a switch now, off on every computer until its person turns it on, which
// leaves a computer that never touched it starting exactly the line it started
// before.
//
// Measured on Claude Code 2.1.71 (the oldest the app runs on) and 2.1.317: a
// `-p` run connects to Claude in Chrome only with `--chrome` on its line, not
// from Claude Code's own "enabled by default"; and a run that skips
// permissions also skips Chrome's per-site asks
// (CLAUDE_CHROME_PERMISSION_MODE=skip_all_permission_checks). So a run that
// skips permissions never gets Chrome, and a cloud run, which has no Chrome of
// yours, never does either.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { yourChromeArgs } from '../main/your-chrome.mts';
import { claudeHarness, localClaudeArgv } from '../main/harnesses/claude.mts';
import { setWorkspaceSetting } from '../main/settings.mts';

const RUN = ['--allowedTools', 'mcp__agentbox', '--permission-mode', 'auto', '--model', 'opus'];

describe('the flag a run on this computer is given', () => {
  it('is none on a computer that never chose', () => {
    expect(yourChromeArgs({}, RUN)).toEqual([]);
    expect(yourChromeArgs(null, RUN)).toEqual([]);
  });

  it('is none when it was turned off, or saved as anything but true', () => {
    for (const value of [false, null, 'true', 1, 'on', {}]) expect(yourChromeArgs({ agentsUseYourChrome: value }, RUN)).toEqual([]);
  });

  it('is --chrome once it is on', () => {
    expect(yourChromeArgs({ agentsUseYourChrome: true }, RUN)).toEqual(['--chrome']);
    expect(yourChromeArgs({ agentsUseYourChrome: true }, ['--permission-mode', 'plan'])).toEqual(['--chrome']);
  });

  it('is none for a run that skips permissions, however that is spelled', () => {
    const on = { agentsUseYourChrome: true };
    expect(yourChromeArgs(on, ['--permission-mode', 'bypassPermissions'])).toEqual([]);
    expect(yourChromeArgs(on, ['--permission-mode=bypassPermissions'])).toEqual([]);
    expect(yourChromeArgs(on, ['--dangerously-skip-permissions', '--permission-mode', 'auto'])).toEqual([]);
    expect(yourChromeArgs(on, ['--permission-mode', 'auto', '--permission-mode', 'bypassPermissions'])).toEqual([]);
  });

  it('follows the mode Claude Code reads, which is the last one given', () => {
    expect(yourChromeArgs({ agentsUseYourChrome: true }, ['--permission-mode', 'bypassPermissions', '--permission-mode', 'auto'])).toEqual(['--chrome']);
  });
});

describe('the line a Claude Code worker starts with', () => {
  const plan = { args: ['-p', 'the brief', ...RUN], answerMode: null };
  const sup = (config: Record<string, unknown>) => ({ config: { storeRoot: '/store', accountId: 'acct', ...config }, _claudeConfigDir: () => '/home', _cloudDocsEnv: () => ({}) });

  it('on this computer, carries --chrome only when it is on', () => {
    expect(localClaudeArgv(sup({}).config, plan)).not.toContain('--chrome');
    expect(localClaudeArgv(sup({ agentsUseYourChrome: false }).config, plan)).not.toContain('--chrome');
    expect(localClaudeArgv(sup({ agentsUseYourChrome: true }).config, plan)).toContain('--chrome');
  });

  it('is unchanged on a computer that never chose', () => {
    const before = localClaudeArgv(sup({}).config, plan);
    expect(before.filter((a) => /chrome/i.test(a))).toEqual([]);
  });

  it('must NOT carry --chrome in the cloud, even when it is on', () => {
    const { args } = claudeHarness.cloudLaunch(sup({ agentsUseYourChrome: true }) as never, plan as never, { item: { id: 'w-1', product: 'p' } as never, profile: 'default', env: {} });
    expect(args).not.toContain('--chrome');
  });
});

describe('the setting', () => {
  const world = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'your-chrome-'));
    return { config: { appDir: dir } as Record<string, unknown>, supervisor: { onChange() {} }, store: {}, dir };
  };
  const saved = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8'));

  it('is saved on and off in this computer’s own file', () => {
    const w = world();
    setWorkspaceSetting(w as never, { key: 'agentsUseYourChrome', value: true });
    expect(saved(w.dir).agentsUseYourChrome).toBe(true);
    expect(w.config.agentsUseYourChrome).toBe(true);
    setWorkspaceSetting(w as never, { key: 'agentsUseYourChrome', value: false });
    expect(saved(w.dir).agentsUseYourChrome).toBe(false);
    expect(yourChromeArgs(w.config, RUN)).toEqual([]);
    fs.rmSync(w.dir, { recursive: true, force: true });
  });

  it('must NOT read anything but true as on', () => {
    const w = world();
    setWorkspaceSetting(w as never, { key: 'agentsUseYourChrome', value: 'yes' });
    expect(saved(w.dir).agentsUseYourChrome).toBe(false);
    fs.rmSync(w.dir, { recursive: true, force: true });
  });

  it('is read off for a computer whose file never mentions it', () => {
    const src = fs.readFileSync(new URL('../main/settings.mts', import.meta.url), 'utf8');
    // readSettings needs a whole supervisor; the line it reports is the claim.
    expect(src).toContain('agentsUseYourChrome: config.agentsUseYourChrome === true');
  });
});
