// The deploy asked for npm login before the Mac build, then publishing asked
// for approval again. Run the real script with fake commands to check timing.
//
// 2026-11-06: a deploy where npm was signed out stopped at npm, so the website
// download, the update feed and the cloud server never went out either. The
// person often forgets npm. npm now goes last, and missing it leaves the rest out.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { nextVersion, serverConfig, whatIsLive } from '../scripts/lib/deploy-rules.mjs';

const scriptUrl = new URL('../scripts/deploy.mjs', import.meta.url);
const source = fs.readFileSync(scriptUrl, 'utf8')
  .replace(/^import .+;\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(scriptUrl.href));

function deploy({ signedIn = false, expireDuringBuild = false, buildOk = true,
  loginOk = true, loginWorks = true, publishOk = true, checkOnly = false } = {}) {
  let published = false;
  const calls = [];
  const messages = [];
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const failed = { status: 1, stdout: '', stderr: 'failed' };
  let exitCode = 0;
  const context = {
    path, os, fileURLToPath, nextVersion, serverConfig, whatIsLive,
    RELEASE_REPO: 'example/releases',
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ version: '1.0.0', posthogKey: 'test', bucket: 'test', runtimeArn: 'test' }),
      writeFileSync: () => {},
    },
    console: { log: (...args) => messages.push(args.join(' ')), error: (...args) => messages.push(args.join(' ')) },
    process: {
      argv: checkOnly ? ['node', 'deploy.mjs', '--check'] : ['node', 'deploy.mjs'],
      env: {}, on: () => {}, exit: (code) => { throw new Error(`exit:${code}`); },
    },
    execFileSync: () => JSON.stringify({ version: '1.0.0' }),
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'npm' && args[0] === 'view') return ok(args[2] === 'versions' ? '[]' : published ? '1.0.0' : '0.9.0');
      if (command === 'npm' && args[0] === 'whoami') return signedIn ? ok('publisher') : failed;
      if (command === 'npm' && args[0] === 'publish') {
        published = signedIn && publishOk;
        return published ? ok() : failed;
      }
      if (command === 'npm' && args[0] === 'login') {
        signedIn = loginOk && loginWorks;
        return loginOk ? ok() : failed;
      }
      if (command === 'security') return ok('"Developer ID Application: Test (ABCDEFGHIJ)"');
      if (command === 'gh' && args[0] === 'api') return ok('true');
      if (command === 'gh' && args[0] === 'release') return ok('v1.0.0');
      if (command === 'curl') return ok('version: 1.0.0');
      if (command === 'aws' && args[0] === 'lambda') return ok(new Date(Date.now() + 60_000).toISOString());
      if (command === 'node' && args[0] === 'scripts/release.mjs') {
        if (expireDuringBuild) signedIn = false;
        return buildOk ? ok() : failed;
      }
      return ok();
    },
  };
  try { vm.runInNewContext(source, context, { timeout: 1_000 }); } catch (error) {
    if (!/^exit:\d+$/.test(error.message)) throw error;
    exitCode = Number(error.message.slice(5));
  }
  const at = (command, arg) => calls.findIndex((call) => call.command === command && call.args[0] === arg);
  const count = (command, arg) => calls.filter((call) => call.command === command && call.args[0] === arg).length;
  return { calls, messages, exitCode, at, count };
}

describe('npm authentication during deployment', () => {
  it('waits until the Mac build finishes to log in, then publishes', () => {
    const run = deploy();
    expect(run.exitCode).toBe(0);
    expect(run.at('npm', 'whoami')).toBeGreaterThan(run.at('node', 'scripts/release.mjs'));
    expect(run.at('npm', 'login')).toBeGreaterThan(run.at('node', 'scripts/release.mjs'));
    expect(run.at('npm', 'publish')).toBeGreaterThan(run.at('npm', 'login'));
    expect(run.count('npm', 'login')).toBe(1);
  });

  it('uses an existing session without asking for another login', () => {
    const run = deploy({ signedIn: true });
    expect(run.exitCode).toBe(0);
    expect(run.count('npm', 'login')).toBe(0);
    expect(run.count('npm', 'publish')).toBe(1);
  });

  it('checks the session after the build, even if it was valid when the run started', () => {
    const run = deploy({ signedIn: true, expireDuringBuild: true });
    expect(run.exitCode).toBe(0);
    expect(run.count('npm', 'login')).toBe(1);
    expect(run.at('npm', 'login')).toBeGreaterThan(run.at('node', 'scripts/release.mjs'));
    expect(run.at('npm', 'publish')).toBeGreaterThan(run.at('npm', 'login'));
  });

  it('does not ask for npm login when the Mac build fails', () => {
    const run = deploy({ buildOk: false });
    expect(run.exitCode).toBe(1);
    expect(run.count('npm', 'login')).toBe(0);
    expect(run.count('npm', 'publish')).toBe(0);
  });

  it('puts out the download, the cloud machine and the cloud server before it asks npm for anything', () => {
    const run = deploy();
    const npmFirst = Math.min(run.at('npm', 'login'), run.at('npm', 'publish'));
    for (const step of ['scripts/publish-download.mjs', 'scripts/cloud-setup.mjs', 'scripts/cloud-gateway-setup.mjs']) {
      expect(run.at('node', step), step).toBeGreaterThan(-1);
      expect(run.at('node', step), step).toBeLessThan(npmFirst);
    }
  });

  it.each([{ loginOk: false }, { loginWorks: false }])('still puts out everything else when npm login fails or leaves npm signed out (%j)', (options) => {
    const run = deploy(options);
    expect(run.count('npm', 'login')).toBe(1);
    expect(run.count('npm', 'publish')).toBe(0);
    expect(run.count('node', 'scripts/publish-download.mjs')).toBe(1);
    expect(run.count('node', 'scripts/cloud-setup.mjs')).toBe(1);
    expect(run.count('node', 'scripts/cloud-gateway-setup.mjs')).toBe(1);
    // Not finished, and it says npm is the part left and how to get it next time.
    expect(run.exitCode).toBe(1);
    expect(run.messages.some((l) => /✗ npm/.test(l) && l.includes('0.9.0'))).toBe(true);
    expect(run.messages.some((l) => l.includes('npm login'))).toBe(true);
    expect(run.messages.some((l) => /✓ website download/.test(l))).toBe(true);
  });

  it('still puts out everything else when npm refuses the publish', () => {
    const run = deploy({ signedIn: true, publishOk: false });
    expect(run.count('npm', 'publish')).toBe(1);
    expect(run.count('node', 'scripts/publish-download.mjs')).toBe(1);
    expect(run.count('node', 'scripts/cloud-gateway-setup.mjs')).toBe(1);
    expect(run.exitCode).toBe(1);
    expect(run.messages.some((l) => /✗ npm/.test(l))).toBe(true);
  });

  it('keeps the version in package.json until npm has packed it', () => {
    const run = deploy({ signedIn: true });
    const restored = run.calls.findIndex((c) => c.command === 'git' && c.args[0] === 'checkout' && c.args.includes('package.json'));
    expect(restored).toBeGreaterThan(run.at('npm', 'publish'));
  });

  it('reports a missing npm session in check mode without logging in or building', () => {
    const run = deploy({ checkOnly: true });
    expect(run.exitCode).toBe(0);
    expect(run.count('npm', 'whoami')).toBe(1);
    expect(run.count('npm', 'login')).toBe(0);
    expect(run.count('npm', 'publish')).toBe(0);
    expect(run.at('node', 'scripts/release.mjs')).toBe(-1);
    expect(run.messages.some((line) => line.includes('npm') && line.includes('signed out'))).toBe(true);
  });
});
