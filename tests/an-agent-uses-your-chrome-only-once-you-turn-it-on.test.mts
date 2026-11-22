// AN AGENT USES YOUR CHROME ONLY ONCE YOU TURN IT ON IN CLAUDE CODE.
//
// What was asked (w-f1352585da, 2026-11-11): "agents never drive my own
// Chrome" was a rule for every user, and the person who made it said it should
// not be: "it might block some users, but i do like it as a rule for me." On
// 2026-11-13 they chose to follow each person's own Claude Code rather than add
// a switch to Agentbox: "Claude in Chrome enabled by default" (/chrome), kept
// as `claudeInChromeDefaultEnabled` in the account's .claude.json.
//
// Measured on Claude Code 2.1.71 (the oldest the app runs on) and 2.1.317: a
// `-p` run ignores that setting and connects only with `--chrome` on its line,
// so the app passes it on. A run that skips permissions also skips Chrome's
// per-site asks (CLAUDE_CHROME_PERMISSION_MODE=skip_all_permission_checks), so
// such a run never gets Chrome, and a cloud run, which has no Chrome of yours,
// never does either.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromeOnInClaudeCode, claudeJsonFor, yourChromeArgs } from '../main/your-chrome.mts';
import { claudeHarness, localClaudeArgv } from '../main/harnesses/claude.mts';

const RUN = ['--allowedTools', 'mcp__agentbox', '--permission-mode', 'auto', '--model', 'opus'];

describe('what Claude Code says about Chrome', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const file = (body: string | null) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'your-chrome-'));
    dirs.push(dir);
    const f = path.join(dir, '.claude.json');
    if (body !== null) fs.writeFileSync(f, body);
    return f;
  };

  it('is on when that account turned Chrome on by default', () => {
    expect(chromeOnInClaudeCode(file(JSON.stringify({ claudeInChromeDefaultEnabled: true, numStartups: 4 })))).toBe(true);
  });

  it('is off when it was turned off, or never set', () => {
    expect(chromeOnInClaudeCode(file(JSON.stringify({ claudeInChromeDefaultEnabled: false })))).toBe(false);
    expect(chromeOnInClaudeCode(file(JSON.stringify({ numStartups: 4 })))).toBe(false);
  });

  it('must NOT read anything but true as on', () => {
    for (const value of ['true', 1, 'on', {}, null]) expect(chromeOnInClaudeCode(file(JSON.stringify({ claudeInChromeDefaultEnabled: value })))).toBe(false);
  });

  it('is off when the file is missing or is not JSON', () => {
    expect(chromeOnInClaudeCode(file(null))).toBe(false);
    expect(chromeOnInClaudeCode(file('{ not json'))).toBe(false);
    expect(chromeOnInClaudeCode(file('true'))).toBe(false);
  });
});

describe('which account’s file is read', () => {
  it('is ~/.claude.json for the first login', () => {
    expect(claudeJsonFor('default', '/home/you')).toBe('/home/you/.claude.json');
    expect(claudeJsonFor(null, '/home/you')).toBe('/home/you/.claude.json');
  });

  it('is inside the folder of any other login', () => {
    expect(claudeJsonFor('/home/you/.claude-2', '/home/you')).toBe('/home/you/.claude-2/.claude.json');
  });
});

describe('the flag a run on this computer is given', () => {
  it('is none when Chrome is off in Claude Code', () => {
    expect(yourChromeArgs(false, RUN)).toEqual([]);
  });

  it('is --chrome when it is on', () => {
    expect(yourChromeArgs(true, RUN)).toEqual(['--chrome']);
    expect(yourChromeArgs(true, ['--permission-mode', 'plan'])).toEqual(['--chrome']);
  });

  it('is none for a run that skips permissions, however that is spelled', () => {
    expect(yourChromeArgs(true, ['--permission-mode', 'bypassPermissions'])).toEqual([]);
    expect(yourChromeArgs(true, ['--permission-mode=bypassPermissions'])).toEqual([]);
    expect(yourChromeArgs(true, ['--dangerously-skip-permissions', '--permission-mode', 'auto'])).toEqual([]);
    expect(yourChromeArgs(true, ['--permission-mode', 'auto', '--permission-mode', 'bypassPermissions'])).toEqual([]);
  });

  it('follows the mode Claude Code reads, which is the last one given', () => {
    expect(yourChromeArgs(true, ['--permission-mode', 'bypassPermissions', '--permission-mode', 'auto'])).toEqual(['--chrome']);
  });
});

describe('the line a Claude Code worker starts with', () => {
  const plan = { args: ['-p', 'the brief', ...RUN], answerMode: null };

  it('on this computer, carries --chrome only when Chrome is on', () => {
    expect(localClaudeArgv(plan, { chromeOn: false })).not.toContain('--chrome');
    expect(localClaudeArgv(plan, { chromeOn: true })).toContain('--chrome');
  });

  it('is unchanged when Chrome is off', () => {
    expect(localClaudeArgv(plan, { chromeOn: false }).filter((a) => /chrome/i.test(a))).toEqual([]);
  });

  it('must NOT carry --chrome in the cloud', () => {
    const sup = { config: { storeRoot: '/store', accountId: 'acct' }, _claudeConfigDir: () => '/home', _cloudDocsEnv: () => ({}) };
    const { args } = claudeHarness.cloudLaunch(sup as never, plan as never, { item: { id: 'w-1', product: 'p' } as never, profile: 'default', env: {} });
    expect(args).not.toContain('--chrome');
  });

  it('reads the setting of the account the run is on', () => {
    const src = fs.readFileSync(new URL('../main/harnesses/claude.mts', import.meta.url), 'utf8');
    expect(src).toContain('chromeOnInClaudeCode(claudeJsonFor(profile,');
  });
});
