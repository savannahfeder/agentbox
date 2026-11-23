// ON WINDOWS THE INSTALL BUTTONS SPAWNED /bin/bash AND /bin/sh, which do not
// exist there, so setting up Claude Code or Codex failed before anything ran.
// Measured on Windows 11 with Node 24.11: on main, installCommand('claude',
// ...) answered { file: '/bin/bash', ... } whatever the platform.
//
// Windows now runs the line each vendor documents for it, through Windows
// PowerShell by its full path (read 2026-11-14):
//   Claude Code, code.claude.com/docs/en/setup: irm https://claude.ai/install.ps1 | iex  (public-check: allow, Anthropic's documented installer)
//   Codex, github.com/openai/codex README: powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"  (public-check: allow, OpenAI's documented installer)
// The first run on a fresh GitHub Windows machine (2026-11-19) found Claude
// Code's installer stopped at "The term 'Get-FileHash' is not recognized" while
// Codex's installed. The app had been started from PowerShell 7, whose
// PSModulePath names 7's modules first, and Windows PowerShell inherited it.
// The installer now runs without PSModulePath, so Windows PowerShell builds its own.
//
// OpenCode's docs give Windows a zip or the desktop app and no script, so its
// button says so and runs nothing. Every spawn here is a fake that records.

import { describe, it, expect } from 'vitest';
import { createEngineSetup, installCommand } from '../main/engine-setup.mts';
import { definitionMethods } from '../main/harnesses/common.mts';
import type { HarnessDefinition } from '../main/harnesses/common.mts';
import { harnessFor } from '../main/harnesses.mts';
import { harnessDefinition, HARNESS_DEFINITIONS } from '../shared/harness-definitions.mts';

const PS = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const winEnv = { SystemRoot: 'C:\\Windows', PATH: 'C:\\evil;C:\\Windows\\System32' };
// The install method of a definition that is not registered, through the code
// the registered ones use.
const installFor = (definition: unknown) => definitionMethods(definition as HarnessDefinition).install('win32', winEnv);

describe('the command each install button runs', () => {
  it('runs the vendor PowerShell installers on Windows, never a /bin shell', () => {
    expect(installCommand('claude', 'win32', winEnv)).toEqual({
      file: PS,
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex'], // public-check: allow
      env: winEnv,
    });
    expect(installCommand('codex', 'win32', winEnv)).toEqual({
      file: PS,
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://chatgpt.com/codex/install.ps1 | iex'], // public-check: allow
      env: winEnv,
    });
  });

  it('finds PowerShell under the Windows folder, not on PATH', () => {
    expect(installCommand('claude', 'win32', { SystemRoot: 'D:\\Win', PATH: 'C:\\evil' }).file)
      .toBe('D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    // A relative SystemRoot is not trusted.
    expect(installCommand('claude', 'win32', { SystemRoot: 'evil', windir: 'E:\\Windows' }).file)
      .toBe('E:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  });

  it('runs the installer without the PowerShell 7 module path, in any spelling, and keeps every other variable', () => {
    for (const key of ['PSModulePath', 'PSMODULEPATH', 'psmodulepath']) {
      const env = { ...winEnv, USERPROFILE: 'C:\\Users\\x', [key]: 'C:\\Program Files\\PowerShell\\7\\Modules' };
      expect(installCommand('claude', 'win32', env).env).toEqual({ ...winEnv, USERPROFILE: 'C:\\Users\\x' });
      expect(env[key]).toBeDefined();
    }
  });

  it('keeps the Mac and Linux commands exactly as they were', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      expect(installCommand('claude', platform, winEnv)).toEqual({ file: '/bin/bash', args: ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'] }); // public-check: allow
      expect(installCommand('codex', platform, winEnv)).toEqual({ file: '/bin/sh', args: ['-c', 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'] }); // public-check: allow
      expect(installCommand('opencode', platform, winEnv)).toEqual({ file: '/bin/bash', args: ['-c', 'curl -fsSL https://opencode.ai/install | bash'] }); // public-check: allow
    }
  });

  it('refuses OpenCode on Windows and names where to get it', () => {
    expect(() => installCommand('opencode', 'win32', winEnv)).toThrow('OpenCode has no installer the app can run on Windows yet. Install it from https://opencode.ai/docs, then try again.');
  });

  it('names only fixed https installer addresses', () => {
    for (const d of HARNESS_DEFINITIONS) {
      expect(d.windowsInstaller.page).toMatch(/^https:\/\//);
      if (d.windowsInstaller.url) expect(d.windowsInstaller.url).toMatch(/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._~\/-]*\.ps1$/);
    }
  });

  it('refuses an installer address that is not a plain https one', () => {
    const base = harnessDefinition('claude')!;
    for (const url of [
      'http://claude.ai/install.ps1', 'https://claude.ai/x.ps1; Remove-Item C:\\', 'https://a.b/$(evil)',
      // Not on the allowlist either: a redirect, a script block, a login, a
      // fragment, a second argument, a quote, a space and no host.
      'https://a.b/x.ps1>out', 'https://a.b/{x}.ps1', 'https://user@a.b/x.ps1', 'https://a.b/x.ps1#y',
      'https://a.b/x.ps1,y', "https://a.b/x'.ps1", 'https://a.b/x .ps1', 'https://',
    ]) {
      const definition = { ...base, windowsInstaller: { url, page: base.windowsInstaller.page } };
      expect(() => installFor(definition)).toThrow(/not a plain https address/);
    }
  });
});

// A pretend Windows machine with nothing installed; every spawn is recorded.
function machine() {
  const calls: { file: string; args: string[]; env?: NodeJS.ProcessEnv }[] = [];
  let installed = false;
  const spawn = (file: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) => {
    calls.push({ file, args, env: options.env });
    const exit = args.join(' ').includes('install.ps1')
      ? Promise.resolve().then(() => { installed = true; return 0; })
      : Promise.resolve(0);
    return { exit, kill() {} };
  };
  const find = () => (installed ? { found: true, path: 'C:\\Users\\x\\.local\\bin\\tool.exe' } : { found: false, path: null });
  return { calls, spawn, find };
}
const settle = async (setup: ReturnType<typeof createEngineSetup>, engine: string) => {
  for (let i = 0; i < 400; i++) { const s = setup.status(engine); if (s.phase === 'ready' || s.phase === 'failed') return s; await new Promise((r) => setTimeout(r, 0)); }
  return setup.status(engine);
};
const quick = { platform: 'win32' as const, env: winEnv, wait: () => new Promise((r) => setTimeout(r, 0)) };

describe('setting up on Windows', () => {
  it('installs Claude Code with its PowerShell installer and goes on to sign in', async () => {
    const m = machine();
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    expect((await settle(setup, 'claude')).phase).toBe('ready');
    expect(m.calls[0]).toMatchObject({ file: PS, args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex'] }); // public-check: allow
    expect(m.calls.filter((c) => c.file === PS)).toHaveLength(1);
  });

  it('hands the installer the environment without PSModulePath', async () => {
    const m = machine();
    const setup = createEngineSetup({ ...quick, env: { ...winEnv, PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules' }, find: m.find, spawn: m.spawn });
    setup.start('claude');
    await settle(setup, 'claude');
    expect(m.calls[0].env).toBeDefined();
    expect(Object.keys(m.calls[0].env!).map((k) => k.toLowerCase())).not.toContain('psmodulepath');
    expect(m.calls[0].env!.SystemRoot).toBe('C:\\Windows');
  });

  it('installs Codex with its PowerShell installer', async () => {
    const m = machine();
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('codex');
    expect((await settle(setup, 'codex')).phase).toBe('ready');
    expect(m.calls[0].args.at(-1)).toBe('irm https://chatgpt.com/codex/install.ps1 | iex'); // public-check: allow
  });

  it('says OpenCode cannot be installed here and spawns nothing', async () => {
    const m = machine();
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('opencode');
    const s = await settle(setup, 'opencode');
    expect(s.phase).toBe('failed');
    expect(s.error).toContain('https://opencode.ai/docs');
    expect(m.calls).toEqual([]);
  });
});

describe('updating on Windows', () => {
  // Claude Code and Codex are told to update with their own installer, and
  // OpenCode runs its own upgrade.
  it('offers no update command that would run a /bin shell', () => {
    const bin = 'C:\\Users\\x\\.local\\bin\\tool.exe';
    for (const id of ['claude', 'codex', 'opencode']) {
      const plan = harnessFor(id).updatePlan({ bin, real: bin, home: 'C:\\Users\\x' });
      if (id !== 'opencode') expect(plan).toBeNull();
      else if (plan) expect(plan.file).toBe(bin);
    }
  });
});
