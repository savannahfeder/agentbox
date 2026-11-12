// A deploy waiting on npm login left package.json edited, and so no update was offered.
//
// 2026-11-12: `npm run deploy` wrote the analytics key into package.json at
// 11:12, built the Mac app, then sat at `npm login` in a Terminal nobody was
// watching. Six hours later it was still waiting and the file still carried the
// key. The sidebar's update check and the Agentbox Team launcher both read that
// as "changes of your own", so neither offered the 35 commits shipped since. This
// runs the real deploy script with fake commands and a file system that
// remembers what was written, and reads package.json at each step.

import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { leftFromARelease, nextVersion, serverConfig, whatIsLive, withVersion } from '../scripts/lib/deploy-rules.mjs';

const scriptUrl = new URL('../scripts/deploy.mjs', import.meta.url);
const source = fs.readFileSync(scriptUrl, 'utf8')
  .replace(/^import .+;\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(scriptUrl.href));
const repo = path.join(path.dirname(fileURLToPath(scriptUrl)), '..');
const pkgPath = path.join(repo, 'package.json');
// Main already says the version going out, as it does once the deploy has
// committed the number, so any edit to the file is the deploy's own.
const MAIN_PKG = `${JSON.stringify({ name: 'agentbox-app', version: '1.0.0', files: ['bin/'] }, null, 2)}\n`;

interface Call { command: string; args: string[]; options?: { timeout?: number }; pkg: string | undefined }

function deploy({ signedIn = false, loginWorks = true } = {}) {
  const files = new Map([[pkgPath, MAIN_PKG]]);
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const failed = { status: 1, stdout: '', stderr: 'failed' };
  const calls: Call[] = [];
  let exitCode = 0;
  const context = {
    path, os, fileURLToPath, leftFromARelease, nextVersion, serverConfig, whatIsLive, withVersion,
    RELEASE_REPO: 'example/releases',
    fs: {
      existsSync: () => true,
      readFileSync: (file: string) => files.get(file)
        ?? JSON.stringify({ posthogKey: 'phc_key', bucket: 'b', runtimeArn: 'r' }),
      writeFileSync: (file: string, text: string) => { files.set(file, String(text)); },
      mkdtempSync: (prefix: string) => `${prefix}x`,
      symlinkSync: () => {},
    },
    console: { log: () => {}, error: () => {} },
    process: {
      argv: ['node', 'deploy.mjs'],
      env: {},
      on: () => {}, exit: (code: number) => { throw new Error(`exit:${code}`); },
    },
    execFileSync: () => JSON.stringify({ version: '1.0.0' }),
    spawnSync(command: string, args: string[], options?: { timeout?: number }) {
      calls.push({ command, args, options, pkg: files.get(pkgPath) });
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'git' && args[0] === 'checkout' && args.at(-1) === 'package.json') { files.set(pkgPath, MAIN_PKG); return ok(); }
      if (command === 'npm' && args[0] === 'view') return ok(args[2] === 'versions' ? '[]' : '1.0.0');
      if (command === 'npm' && args[0] === 'whoami') return signedIn ? ok('publisher') : failed;
      if (command === 'npm' && args[0] === 'login') { signedIn = loginWorks; return loginWorks ? ok() : failed; }
      if (command === 'security') return ok('"Developer ID Application: Test (ABCDEFGHIJ)"');
      if (command === 'gh' && args[0] === 'api') return ok('true');
      if (command === 'gh' && args[0] === 'release') return ok('v1.0.0');
      if (command === 'curl') return ok('version: 1.0.0');
      if (command === 'aws' && args[0] === 'lambda') return ok(new Date(Date.now() + 60_000).toISOString());
      return ok();
    },
  };
  try { vm.runInNewContext(source, context, { timeout: 1_000 }); } catch (error) {
    if (!/^exit:\d+$/.test((error as Error).message)) throw error;
    exitCode = Number((error as Error).message.slice(5));
  }
  const call = (command: string, arg: string) => calls.find((c) => c.command === command && c.args[0] === arg);
  return { call, after: files.get(pkgPath), exitCode };
}

describe('a deploy waiting on npm does not stop the app updating', () => {
  it('leaves package.json as main has it while npm login waits for the person', () => {
    const run = deploy();
    expect(run.call('npm', 'login')).toBeDefined();
    expect(run.call('npm', 'login')?.pkg).toBe(MAIN_PKG);
  });

  it('leaves package.json as main has it while the Mac app builds', () => {
    expect(deploy({ signedIn: true }).call('node', 'scripts/release.mjs')?.pkg).toBe(MAIN_PKG);
  });

  it('still has the key in package.json at the moment npm publishes', () => {
    const atPublish = JSON.parse(deploy().call('npm', 'publish')?.pkg ?? '{}');
    expect(atPublish.bakedPosthogKey).toBe('phc_key');
    expect(atPublish.version).toBe('1.0.0');
  });

  it('never writes the key when npm stays signed out, and leaves the file as main has it', () => {
    const run = deploy({ loginWorks: false });
    expect(run.call('npm', 'publish')).toBeUndefined();
    expect(run.after).toBe(MAIN_PKG);
  });

  it('gives up on npm login after a while instead of waiting for ever', () => {
    const timeout = deploy().call('npm', 'login')?.options?.timeout;
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(30 * 60_000);
  });
});
