// 0.1.25 went out to the website, the update feed and the cloud, and npm's
// browser approval for `npm publish` came back 404 at the end of the run. The
// deploy's only advice was "npm gets the next release": running it again would
// have built and put out 0.1.26 instead. npm sat at 0.1.22 for three releases.
// `npm run deploy -- --npm` now publishes the release that missed npm, from the
// commit its Mac app was built from. Measured by running the real script with
// fake commands, as the other deploy tests do.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { nextVersion, serverConfig, whatIsLive, withVersion } from '../scripts/lib/deploy-rules.mjs';

const scriptUrl = new URL('../scripts/deploy.mjs', import.meta.url);
const source = fs.readFileSync(scriptUrl, 'utf8')
  .replace(/^import .+;\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(scriptUrl.href));
const BUILT = 'b'.repeat(40);

type Call = { command: string; args: string[]; options: { cwd?: string } };

function deploy({ npmOnly = true, tagged = true, onNpm = false, notes = `Agentbox 1.0.0\n\nBuilt from https://github.com/x/y/commit/${BUILT}`,
  builtVersion = '1.0.0', signedIn = true, publishOk = true } = {}) {
  let published = onNpm;
  const calls: Call[] = [];
  const messages: string[] = [];
  const written: { file: string; text: string }[] = [];
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const failed = { status: 1, stdout: '', stderr: 'failed' };
  let exitCode = 0;
  const context = {
    path, os, fileURLToPath, nextVersion, serverConfig, whatIsLive, withVersion,
    RELEASE_REPO: 'example/releases',
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ version: '1.0.0', posthogKey: 'the-key', bucket: 'test', runtimeArn: 'test' }),
      writeFileSync: (file: string, text: string) => { written.push({ file, text }); },
      mkdtempSync: (prefix: string) => `${prefix}tmp`,
      symlinkSync: () => {},
    },
    console: { log: (...args: unknown[]) => messages.push(args.join(' ')), error: (...args: unknown[]) => messages.push(args.join(' ')) },
    process: {
      argv: ['node', 'deploy.mjs', ...(npmOnly ? ['--npm'] : [])],
      env: {}, on: () => {}, exit: (code: number) => { throw new Error(`exit:${code}`); },
    },
    execFileSync: () => JSON.stringify({ version: '1.0.0' }),
    spawnSync(command: string, args: string[], options: { cwd?: string }) {
      calls.push({ command, args, options });
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'git' && args[0] === 'ls-remote') return ok(tagged ? `${'c'.repeat(40)}\trefs/tags/v1.0.0` : '');
      if (command === 'git' && args[0] === 'show') return ok(JSON.stringify({ version: builtVersion }));
      if (command === 'npm' && args[0] === 'view') {
        if (args[2] === 'versions') return ok(JSON.stringify(published ? ['1.0.0'] : ['0.9.0']));
        return ok(published ? '1.0.0' : '0.9.0');
      }
      if (command === 'npm' && args[0] === 'whoami') return signedIn ? ok('publisher') : failed;
      if (command === 'npm' && args[0] === 'login') { signedIn = true; return ok(); }
      if (command === 'npm' && args[0] === 'publish') {
        published = signedIn && publishOk;
        return published ? ok() : failed;
      }
      if (command === 'curl' && args.some((a) => a.includes('api.github.com'))) return ok(JSON.stringify({ body: notes }));
      if (command === 'curl') return ok('version: 1.0.0');
      if (command === 'security') return ok('"Developer ID Application: Test (ABCDEFGHIJ)"');
      if (command === 'gh' && args[0] === 'api') return ok('true');
      if (command === 'gh' && args[0] === 'release') return ok('v1.0.0');
      if (command === 'aws' && args[0] === 'lambda') return ok(new Date(Date.now() + 60_000).toISOString());
      return ok();
    },
  };
  try { vm.runInNewContext(source, context, { timeout: 1_000 }); } catch (error) {
    if (!/^exit:\d+$/.test((error as Error).message)) throw error;
    exitCode = Number((error as Error).message.slice(5));
  }
  const find = (command: string, arg: string) => calls.find((c) => c.command === command && c.args[0] === arg);
  return { calls, messages, written, exitCode, find, text: messages.join('\n') };
}

describe('npm run deploy -- --npm', () => {
  it('publishes the released version from the commit its Mac app was built from, and nothing else', () => {
    const run = deploy();
    expect(run.exitCode).toBe(0);
    const worktree = run.find('git', 'worktree');
    expect(worktree?.args).toEqual(expect.arrayContaining(['add', BUILT]));
    const publish = run.find('npm', 'publish');
    expect(publish?.options.cwd).toBe(worktree?.args[worktree.args.indexOf(BUILT) - 1]);
    expect(run.written.some((w) => w.file.startsWith(publish?.options.cwd ?? '?') && JSON.parse(w.text).bakedPosthogKey === 'the-key')).toBe(true);
    expect(run.calls.some((c) => c.command === 'node' && c.args[0] === 'scripts/release.mjs')).toBe(false);
    expect(run.calls.some((c) => c.command === 'git' && c.args[0] === 'commit')).toBe(false);
    expect(run.calls.some((c) => c.command === 'aws' || c.command === 'xcrun')).toBe(false);
  });

  it('signs in to npm first when it has signed out', () => {
    const run = deploy({ signedIn: false });
    expect(run.exitCode).toBe(0);
    expect(run.calls.findIndex((c) => c.command === 'npm' && c.args[0] === 'login'))
      .toBeLessThan(run.calls.findIndex((c) => c.command === 'npm' && c.args[0] === 'publish'));
  });

  it('does nothing when npm already has the version', () => {
    const run = deploy({ onNpm: true });
    expect(run.exitCode).toBe(0);
    expect(run.find('npm', 'publish')).toBeUndefined();
    expect(run.text).toMatch(/already on npm/);
  });

  it('refuses a version that was never released', () => {
    const run = deploy({ tagged: false });
    expect(run.exitCode).toBe(1);
    expect(run.find('npm', 'publish')).toBeUndefined();
  });

  it('refuses when the release page does not name the commit, or names one with another version', () => {
    for (const run of [deploy({ notes: 'Agentbox 1.0.0' }), deploy({ builtVersion: '0.9.9' })]) {
      expect(run.exitCode).toBe(1);
      expect(run.find('npm', 'publish')).toBeUndefined();
    }
  });

  it('says to run it again when npm refuses the publish', () => {
    const run = deploy({ publishOk: false });
    expect(run.exitCode).toBe(1);
    expect(run.text).toContain('npm run deploy -- --npm');
  });
});

describe('a whole deploy whose npm publish fails', () => {
  it('names npm run deploy -- --npm instead of waiting for the next release', () => {
    const run = deploy({ npmOnly: false, tagged: false, publishOk: false });
    expect(run.find('node', 'scripts/release.mjs')).toBeDefined();
    expect(run.exitCode).toBe(1);
    expect(run.text).toContain('npm run deploy -- --npm');
    expect(run.text).not.toMatch(/npm gets the next release/);
  });
});
