// 2026-10-07: printing PATH exposed four system folders but no nvm tools.
// A Finder launch must recover shell tools without importing shell credentials.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { recoverShellPath } from '../main/shell-path.mjs';

describe('agents can use the tools in your shell', () => {
  it('loads nvm-style tools from an interactive login profile even when the profile prints text', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-tools-'));
    try {
      const bin = path.join(home, '.nvm/versions/node/v22.0.0/bin');
      fs.mkdirSync(bin, { recursive: true });
      for (const tool of ['node', 'npm', 'npx', 'a-global-tool']) {
        fs.writeFileSync(path.join(bin, tool), '#!/bin/sh\nprintf available');
        fs.chmodSync(path.join(bin, tool), 0o755);
      }
      fs.writeFileSync(path.join(home, '.zshrc'), `echo profile-message\nexport PATH="${bin}:$PATH"\nexport OPENAI_API_KEY=profile-secret\n`);
      const env = { HOME: home, ZDOTDIR: home, SHELL: '/bin/zsh', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', KEEP: 'original' };
      const result = await recoverShellPath({ env, platform: 'darwin' });
      expect(result.error).toBeNull();
      expect(result.path.split(':')[0]).toBe(bin);
      expect(result.path).not.toContain('profile-message');
      for (const tool of ['node', 'npm', 'npx', 'a-global-tool']) {
        expect(execFileSync('/bin/sh', ['-c', tool], { env: { ...env, PATH: result.path }, encoding: 'utf8' })).toBe('available');
      }
      expect(env).not.toHaveProperty('OPENAI_API_KEY');
      expect(env.KEEP).toBe('original');
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });

  it('keeps inherited plugin folders, removes duplicates and only returns PATH', async () => {
    const run = async () => '\0agentbox-path\0/tools:/usr/bin\0';
    expect(await recoverShellPath({ env: { SHELL: '/bin/bash', PATH: '/usr/bin:/plugin/bin' }, platform: 'darwin', run }))
      .toEqual({ path: '/tools:/usr/bin:/plugin/bin', error: null });
  });

  it.each(['welcome\n', '\0agentbox-path\0\0', '\0agentbox-path\0/bad\npath\0'])('keeps the original PATH when the shell does not answer: %j', async stdout => {
    const result = await recoverShellPath({ env: { PATH: '/original' }, platform: 'darwin', run: async () => stdout });
    expect(result.path).toBe('/original');
    expect(result.error).toBeTruthy();
  });

  it('bounds shell startup and keeps the original PATH on failure', async () => {
    const run = async (shell, args, options) => {
      expect(shell).toBe('/bin/zsh');
      expect(args[0]).toBe('-ilc');
      expect(options.timeout).toBe(5000);
      throw Error('shell timed out');
    };
    expect(await recoverShellPath({ env: { PATH: '/original' }, platform: 'darwin', run }))
      .toEqual({ path: '/original', error: 'shell timed out' });
  });

  it('leaves other platforms alone', async () => {
    const result = await recoverShellPath({ env: { PATH: '/original' }, platform: 'linux', run: () => { throw Error('must not run'); } });
    expect(result).toEqual({ path: '/original', error: null });
  });

  it('recovers PATH before the app loads configuration or starts workers', () => {
    const src = fs.readFileSync(new URL('../main/main.mjs', import.meta.url), 'utf8');
    const window = src.slice(src.indexOf('async function createWindow()'));
    expect(window.indexOf('await recoverShellPath(')).toBeGreaterThan(0);
    expect(window.indexOf('await recoverShellPath(')).toBeLessThan(window.indexOf('loadConfig(dataDir)'));
    expect(window.indexOf('process.env.PATH =')).toBeLessThan(window.indexOf('new Supervisor('));
  });
});
