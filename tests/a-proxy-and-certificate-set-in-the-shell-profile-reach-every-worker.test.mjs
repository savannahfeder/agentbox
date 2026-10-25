// A PROXY AND A CERTIFICATE SET IN THE SHELL PROFILE REACH EVERY WORKER.
//
// WHAT BROKE. Behind a company proxy, people export HTTPS_PROXY and the
// company's certificate (NODE_EXTRA_CA_CERTS) in .zshrc, which is where Claude
// Code's own error tells them to put it. The app read PATH and two folders out
// of the shell and nothing else, so an app opened from the Dock handed its
// workers neither. Measured 2026-10-15 with the real Claude Code 2.1.301
// against a stub model behind a local CONNECT proxy with a self-signed
// certificate (scripts/scratch/proxy-probe.mjs, nothing reached Anthropic):
//
//   proxy and certificate in the environment   answered, 240 ms
//   proxy, no certificate                      dead in 371 ms, "Self-signed
//                                              certificate detected"
//   neither                                    10 retries over about three
//                                              minutes, then dead
//
// THE SAME FOR LANG. launchd gives a Dock-launched app no LANG and no LC_*
// (read off a running Dock-launched Electron app with `ps eww`, and off a bare
// Electron started with launchd's environment: none in it or its children).
// With LANG unset, system Ruby reads files as US-ASCII and `sed 's/./X/g'`
// makes five X's of "café".
//
// THE RULE: these names, and no others, come from the shell into the app's own
// environment, never over a value the launch already has, and a key exported
// beside them stays where it is.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { learnShellDataDirs, launchAdditions, readShellSettings } from '../main/shell-path.mjs';
import { harnessFor } from '../main/harnesses.mjs';

const hasZsh = fs.existsSync('/bin/zsh');
const DOCK = '/usr/bin:/bin:/usr/sbin:/sbin';

let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-network-')); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
const dock = () => ({ HOME: home, ZDOTDIR: home, SHELL: '/bin/zsh', PATH: DOCK, USER: 'tester' });

describe.skipIf(!hasZsh)('read out of a real zsh profile', () => {
  it('hands the proxy and the certificate to Claude Code and Codex workers, and no key', async () => {
    fs.writeFileSync(path.join(home, '.zshrc'), [
      'echo "corp banner"',
      'export HTTPS_PROXY=http://proxy.corp.test:3128',
      'export http_proxy=http://proxy.corp.test:3128',
      'export NO_PROXY=localhost,127.0.0.1,.corp.test',
      'export NODE_EXTRA_CA_CERTS="$HOME/certs/corp.pem"',
      'export SSL_CERT_FILE=~/certs/corp.pem',
      'export ANTHROPIC_API_KEY=profile-secret-not-real',
      'export OPENAI_API_KEY=profile-secret-not-real',
    ].join('\n') + '\n');
    const app = dock();
    await learnShellDataDirs({ env: dock(), platform: 'darwin', into: app });
    expect(app).toMatchObject({
      HTTPS_PROXY: 'http://proxy.corp.test:3128',
      http_proxy: 'http://proxy.corp.test:3128',
      NO_PROXY: 'localhost,127.0.0.1,.corp.test',
      NODE_EXTRA_CA_CERTS: path.join(home, 'certs/corp.pem'),
      SSL_CERT_FILE: path.join(home, 'certs/corp.pem'),
    });
    expect(app).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(app).not.toHaveProperty('OPENAI_API_KEY');
    for (const engine of ['claude', 'codex']) {
      const worker = harnessFor(engine).workerEnv(app);
      expect(worker.HTTPS_PROXY).toBe('http://proxy.corp.test:3128');
      expect(worker.NODE_EXTRA_CA_CERTS).toBe(path.join(home, 'certs/corp.pem'));
    }
  });

  it('adds nothing for a profile that sets no network', async () => {
    fs.writeFileSync(path.join(home, '.zshrc'), 'export EDITOR=vi\n');
    const app = { ...dock(), LANG: 'en_US.UTF-8' };
    await learnShellDataDirs({ env: app, platform: 'darwin', into: app });
    expect(app).toEqual({ ...dock(), LANG: 'en_US.UTF-8' });
  });

  it('takes the shell\'s own LANG when its profile exports one', async () => {
    fs.writeFileSync(path.join(home, '.zshrc'), 'export LANG=fr_FR.UTF-8\n');
    const app = dock();
    await learnShellDataDirs({ env: dock(), platform: 'darwin', into: app });
    expect(app.LANG).toBe('fr_FR.UTF-8');
  });
});

describe('what is added to a launch environment', () => {
  const shell = {
    network: { HTTPS_PROXY: 'http://p:3128', https_proxy: 'http://p:3128', NODE_EXTRA_CA_CERTS: '/certs/corp.pem' },
    locale: {},
  };

  it('never overwrites a value the launch already has (a terminal start keeps its own)', () => {
    const add = launchAdditions(shell, { HTTPS_PROXY: 'http://mine:8080', NODE_EXTRA_CA_CERTS: '/mine.pem', LANG: 'de_DE.UTF-8' }, 'darwin');
    expect(add).toEqual({});
  });

  it('treats the proxies as one setting: any proxy already set means none is added', () => {
    expect(launchAdditions(shell, { http_proxy: 'http://mine:8080' }, 'darwin')).not.toHaveProperty('HTTPS_PROXY');
    expect(launchAdditions(shell, {}, 'darwin')).toMatchObject({ HTTPS_PROXY: 'http://p:3128', https_proxy: 'http://p:3128' });
  });

  it('gives a Mac launch with no locale at all en_US.UTF-8', () => {
    expect(launchAdditions({}, { PATH: DOCK }, 'darwin')).toEqual({ LANG: 'en_US.UTF-8' });
  });

  it('leaves the locale alone when any one of LANG, LC_ALL or LC_CTYPE is set', () => {
    for (const name of ['LANG', 'LC_ALL', 'LC_CTYPE']) {
      expect(launchAdditions({ locale: { LANG: 'fr_FR.UTF-8' } }, { [name]: 'C' }, 'darwin')).toEqual({});
    }
  });

  it('does not invent a locale on Linux, where the session sets its own', () => {
    expect(launchAdditions({}, { PATH: '/usr/bin' }, 'linux')).toEqual({});
  });

  it.skipIf(process.platform !== 'darwin')('and that LANG is the difference on this Mac\'s own sed (the measurement)', () => {
    const sed = (env) => execFileSync('/usr/bin/sed', ['s/./X/g'], { input: 'café\n', encoding: 'utf8', env }).trim();
    expect(sed({ PATH: DOCK })).toBe('XXXXX');
    expect(sed({ PATH: DOCK, ...launchAdditions({}, { PATH: DOCK }, 'darwin') })).toBe('XXXX');
  });
});

describe('what is refused out of the shell', () => {
  const answer = (values) => async () => `banner\n\0agentbox-dirs\0${values.join('\0')}\0`;
  // The order the probe prints them in.
  const NAMES = ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy',
    'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'LANG', 'LC_ALL', 'LC_CTYPE'];
  const values = (set) => NAMES.map((n) => set[n] ?? '');

  it('a certificate path that is not absolute, a value split over lines, and a locale with a space', async () => {
    const got = await readShellSettings({
      env: { SHELL: '/bin/zsh', HOME: '/Users/a' }, platform: 'darwin',
      run: answer(values({ NODE_EXTRA_CA_CERTS: 'certs/corp.pem', HTTPS_PROXY: 'http://p\n:3128', LANG: 'en US', SSL_CERT_FILE: '~/c.pem' })),
    });
    expect(got.network).toEqual({ SSL_CERT_FILE: '/Users/a/c.pem' });
    expect(got.locale).toEqual({});
  });

  it('an older answer with only the two folders in it still reads', async () => {
    const got = await readShellSettings({ env: { SHELL: '/bin/zsh' }, platform: 'darwin', run: async () => '\0agentbox-dirs\0/a/claude\0\0' });
    expect(got).toEqual({ dirs: { CLAUDE_CONFIG_DIR: '/a/claude' }, network: {}, locale: {} });
  });
});
