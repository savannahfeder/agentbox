// THE NPM PACKAGE CARRIES THE COUNTING KEY, AND MAIN'S package.json NEVER DOES.
//
// The Mac build had the key baked in by electron-builder's extraMetadata; the
// npm package was published straight from package.json, which has none. So
// every `npx agentbox-app` sent nothing (npm pack agentbox-app@0.1.19,
// 2026-10-29: no bakedPosthogKey). This runs the real deploy script with fake
// commands and a file system that remembers what was written.
//
// The cases:
//   · at the moment npm publishes, package.json carries the key and the version;
//   · the key in the environment wins over zero.config.json, as in the Mac build;
//   · package.json is put back afterwards, key and all;
//   · with no key anywhere, the deploy stops before building anything.

import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nextVersion, serverConfig, whatIsLive } from '../scripts/lib/deploy-rules.mjs';

const scriptUrl = new URL('../scripts/deploy.mjs', import.meta.url);
const source = fs.readFileSync(scriptUrl, 'utf8')
  .replace(/^import .+;\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(scriptUrl.href));
const repo = path.join(path.dirname(fileURLToPath(scriptUrl)), '..');
const pkgPath = path.join(repo, 'package.json');
const MAIN_PKG = `${JSON.stringify({ name: 'agentbox-app', version: '1.0.0', files: ['bin/'] }, null, 2)}\n`;

function deploy({ configKey = 'phc_from_config', envKey } = {}) {
  const files = new Map([[pkgPath, MAIN_PKG]]);
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  let atPublish = null;
  const calls = [];
  let exitCode = 0;
  const said = [];
  const context = {
    path, os, fileURLToPath, nextVersion, serverConfig, whatIsLive,
    RELEASE_REPO: 'example/releases',
    fs: {
      existsSync: () => true,
      readFileSync: (file) => files.get(file)
        ?? JSON.stringify({ ...(configKey ? { posthogKey: configKey } : {}), bucket: 'b', runtimeArn: 'r' }),
      writeFileSync: (file, text) => { files.set(file, String(text)); },
    },
    console: { log: (...a) => said.push(a.join(' ')), error: (...a) => said.push(a.join(' ')) },
    process: {
      argv: ['node', 'deploy.mjs'],
      env: envKey ? { AGENTBOX_POSTHOG_KEY: envKey } : {},
      on: () => {}, exit: (code) => { throw new Error(`exit:${code}`); },
    },
    execFileSync: () => JSON.stringify({ version: '1.0.0' }),
    spawnSync(command, args) {
      calls.push(`${command} ${args[0]}`);
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'git' && args[0] === 'checkout' && args.at(-1) === 'package.json') { files.set(pkgPath, MAIN_PKG); return ok(); }
      if (command === 'npm' && args[0] === 'view') return ok(args[2] === 'versions' ? '["1.0.0"]' : '1.0.1');
      if (command === 'npm' && args[0] === 'whoami') return ok('publisher');
      if (command === 'npm' && args[0] === 'publish') { atPublish = JSON.parse(files.get(pkgPath)); return ok(); }
      if (command === 'security') return ok('"Developer ID Application: Test (ABCDEFGHIJ)"');
      if (command === 'gh' && args[0] === 'api') return ok('true');
      if (command === 'gh' && args[0] === 'release') return ok('v1.0.1');
      if (command === 'curl') return ok('version: 1.0.1');
      if (command === 'aws' && args[0] === 'lambda') return ok(new Date(Date.now() + 60_000).toISOString());
      return ok();
    },
  };
  try { vm.runInNewContext(source, context, { timeout: 1_000 }); } catch (error) {
    if (!/^exit:\d+$/.test(error.message)) throw error;
    exitCode = Number(error.message.slice(5));
  }
  return { atPublish, after: files.get(pkgPath), exitCode, calls, said: said.join('\n') };
}

describe('the npm package carries the counting key', () => {
  it('is in package.json when npm publishes, beside the new version', () => {
    const run = deploy();
    expect(run.exitCode, run.said).toBe(0);
    expect(run.atPublish.bakedPosthogKey).toBe('phc_from_config');
    expect(run.atPublish.version).toBe('1.0.1');
    expect(run.atPublish.files).toEqual(['bin/']);
  });

  it('takes the key from the environment first, as the Mac build does', () => {
    expect(deploy({ envKey: 'phc_from_env' }).atPublish.bakedPosthogKey).toBe('phc_from_env');
    expect(deploy({ configKey: null, envKey: 'phc_from_env' }).atPublish.bakedPosthogKey).toBe('phc_from_env');
  });

  it('is taken out again afterwards, so main\'s file never carries it', () => {
    expect(deploy().after).toBe(MAIN_PKG);
  });

  it('stops before building anything when there is no key at all', () => {
    const run = deploy({ configKey: null });
    expect(run.exitCode).toBe(1);
    expect(run.atPublish).toBe(null);
    expect(run.calls).not.toContain('node scripts/release.mjs');
  });
});
