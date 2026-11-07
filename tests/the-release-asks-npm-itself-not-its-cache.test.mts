// THE RELEASE ASKS NPM ITSELF, NOT ITS CACHE.
//
// The 0.1.20 release on 2026-10-29 ended "Not finished. ✗ npm still 0.1.19"
// while the registry already had 0.1.20: `npm view` answered from npm's local
// cache of the package document, published minutes earlier. Measured the same
// night: `npm view agentbox-app version` said 0.1.19, and the same command
// with `--prefer-online` said 0.1.20. The version pick reads npm the same
// way, and a stale list there would choose a number already taken and fail the
// publish after a fifteen-minute build.
//
// This runs the real deploy script against a fake npm whose cache is stale:
// it answers the old version unless asked with --prefer-online.
//
// The cases:
//   · the read-back after publishing sees the new version, and the run finishes;
//   · the version pick sees every version already out;
//   · every `npm view` the script makes goes online.

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

function deploy() {
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const views = [];
  const said = [];
  let exitCode = 0;
  let published = false;
  const context = {
    path, os, fileURLToPath, nextVersion, serverConfig, whatIsLive,
    RELEASE_REPO: 'example/releases',
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ name: 'agentbox-app', version: '1.0.0', posthogKey: 'phc_k', bucket: 'b', runtimeArn: 'r' }),
      writeFileSync: () => {},
    },
    console: { log: (...a) => said.push(a.join(' ')), error: (...a) => said.push(a.join(' ')) },
    process: { argv: ['node', 'deploy.mjs'], env: {}, on: () => {}, exit: (code) => { throw new Error(`exit:${code}`); } },
    execFileSync: () => JSON.stringify({ version: '1.0.0' }),
    spawnSync(command, args) {
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'npm' && args[0] === 'view') {
        views.push(args);
        const online = args.includes('--prefer-online');
        // The registry has 1.0.0 and 1.0.1 out before the run; the cache only knows 1.0.0.
        if (args[2] === 'versions') return ok(online ? '["1.0.0","1.0.1"]' : '["1.0.0"]');
        return ok(online && published ? '1.0.2' : '1.0.0');
      }
      if (command === 'npm' && args[0] === 'whoami') return ok('publisher');
      if (command === 'npm' && args[0] === 'publish') { published = true; return ok(); }
      if (command === 'security') return ok('"Developer ID Application: Test (ABCDEFGHIJ)"');
      if (command === 'gh' && args[0] === 'api') return ok('true');
      if (command === 'gh' && args[0] === 'release') return ok('v1.0.2');
      if (command === 'curl') return ok('version: 1.0.2');
      if (command === 'aws' && args[0] === 'lambda') return ok(new Date(Date.now() + 60_000).toISOString());
      return ok();
    },
  };
  try { vm.runInNewContext(source, context, { timeout: 1_000 }); } catch (error) {
    if (!/^exit:\d+$/.test(error.message)) throw error;
    exitCode = Number(error.message.slice(5));
  }
  return { exitCode, views, said: said.join('\n') };
}

describe('the release asks npm itself, not its cache', () => {
  it('sees the version it just published, and finishes', () => {
    const run = deploy();
    expect(run.exitCode, run.said).toBe(0);
    expect(run.said).not.toMatch(/Not finished/);
  });

  it('picks a version nobody has put out yet', () => {
    expect(deploy().said).toMatch(/^ {2}1\.0\.2 \(main says 1\.0\.0/m);
  });

  it('goes online for every npm view', () => {
    const run = deploy();
    expect(run.views.length).toBeGreaterThanOrEqual(2);
    for (const args of run.views) expect(args).toContain('--prefer-online');
  });
});
