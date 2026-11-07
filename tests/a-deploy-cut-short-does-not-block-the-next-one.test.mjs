// A DEPLOY CUT SHORT DOES NOT BLOCK THE NEXT ONE.
//
// 2026-11-05: a deploy was stopped during the Mac build, and every later
// `npm run deploy` stopped at once with "These files have changes that are not
// on main: M package.json". The change was the deploy's own: it writes the new
// version (0.1.22, main said 0.1.19) and the counting key into package.json for
// the run and puts the file back on exit, on Ctrl+C and on a failure, but not
// when the Terminal window is closed (SIGHUP) or the process is told to end
// (SIGTERM). npm and the release repo still said 0.1.21, so nothing had gone out.
//
// This runs the real deploy script with fake commands, as
// the-npm-package-carries-the-counting-key does. The cases:
//   · package.json differing only in version and key: put back, deploy goes on;
//   · only the version differing: the same;
//   · package.json with any other change: stops, and the file is left alone;
//   · the leftover beside another changed file: stops;
//   · the window closed, or the process ended, during the build: put back.

import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { leftFromARelease, nextVersion, serverConfig, whatIsLive } from '../scripts/lib/deploy-rules.mjs';

const scriptUrl = new URL('../scripts/deploy.mjs', import.meta.url);
const source = fs.readFileSync(scriptUrl, 'utf8')
  .replace(/^import .+;\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(scriptUrl.href));
const repo = path.join(path.dirname(fileURLToPath(scriptUrl)), '..');
const pkgPath = path.join(repo, 'package.json');
const MAIN = { name: 'agentbox-app', version: '1.0.0', files: ['bin/'] };
const text = (o) => `${JSON.stringify(o, null, 2)}\n`;
const LEFTOVER = text({ ...MAIN, version: '1.0.1', bakedPosthogKey: 'phc_key' });

function deploy({ pkg = text(MAIN), status = '', signalDuringBuild = null } = {}) {
  const files = new Map([[pkgPath, pkg]]);
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const handlers = {};
  const calls = [];
  const said = [];
  let exitCode = 0;
  let published = false;
  const context = {
    path, os, fileURLToPath, nextVersion, serverConfig, whatIsLive, leftFromARelease,
    RELEASE_REPO: 'example/releases',
    fs: {
      existsSync: () => true,
      readFileSync: (file) => files.get(file) ?? JSON.stringify({ posthogKey: 'phc_key', bucket: 'b', runtimeArn: 'r' }),
      writeFileSync: (file, t) => { files.set(file, String(t)); },
    },
    console: { log: (...a) => said.push(a.join(' ')), error: (...a) => said.push(a.join(' ')) },
    process: {
      argv: ['node', 'deploy.mjs'],
      env: {},
      on: (event, fn) => { handlers[event] = fn; },
      exit: (code) => { throw new Error(`exit:${code}`); },
    },
    execFileSync: () => JSON.stringify(MAIN),
    spawnSync(command, args) {
      calls.push(`${command} ${args.join(' ')}`);
      if (command === 'git' && args[0] === 'status') return ok(files.get(pkgPath) === text(MAIN) ? status.replace(/^.*package\.json\n?/m, '') : status);
      if (command === 'git' && args[0] === 'show') return ok(text(MAIN));
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'git' && args[0] === 'checkout' && args.at(-1) === 'package.json') { files.set(pkgPath, text(MAIN)); return ok(); }
      if (command === 'node' && args[0] === 'scripts/release.mjs' && signalDuringBuild) handlers[signalDuringBuild]();
      if (command === 'npm' && args[0] === 'view') return ok(args[2] === 'versions' ? '["1.0.0"]' : '1.0.1');
      if (command === 'npm' && args[0] === 'whoami') return ok('publisher');
      if (command === 'npm' && args[0] === 'publish') { published = true; return ok(); }
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
  return { exitCode, published, after: files.get(pkgPath), calls, said: said.join('\n') };
}

describe('a deploy that finds the last one cut short', () => {
  it('puts back package.json when only the version and the key differ, and goes on', () => {
    const run = deploy({ pkg: LEFTOVER, status: 'M package.json' });
    expect(run.exitCode, run.said).toBe(0);
    expect(run.published).toBe(true);
    expect(run.said).toMatch(/left by a deploy that was cut short/);
    expect(run.after).toBe(text(MAIN));
  });

  it('does the same when only the version differs', () => {
    const run = deploy({ pkg: text({ ...MAIN, version: '1.0.1' }), status: 'M package.json' });
    expect(run.exitCode, run.said).toBe(0);
    expect(run.published).toBe(true);
  });

  it('stops, and leaves the file alone, when package.json has any other change', () => {
    const edited = text({ ...MAIN, version: '1.0.1', dependencies: { left: '1.0.0' } });
    const run = deploy({ pkg: edited, status: 'M package.json' });
    expect(run.exitCode).toBe(1);
    expect(run.said).toMatch(/changes that are not on main/);
    expect(run.calls).not.toContain('git checkout -- package.json');
    expect(run.after).toBe(edited);
  });

  it('stops when another file has changed beside it', () => {
    const run = deploy({ pkg: LEFTOVER, status: 'M package.json\n M main/index.mts' });
    expect(run.exitCode).toBe(1);
    expect(run.calls).not.toContain('git checkout -- package.json');
    expect(run.published).toBe(false);
  });

  it('is not needed when the folder is clean', () => {
    const run = deploy();
    expect(run.exitCode, run.said).toBe(0);
    expect(run.calls.filter((c) => c === 'git checkout -- package.json')).toHaveLength(1);
  });
});

describe('a deploy cut short during the Mac build', () => {
  for (const signal of ['SIGHUP', 'SIGTERM', 'SIGINT']) {
    it(`puts package.json back on ${signal}`, () => {
      const run = deploy({ signalDuringBuild: signal });
      expect(run.exitCode).not.toBe(0);
      expect(run.published).toBe(false);
      expect(run.after).toBe(text(MAIN));
    });
  }
});

describe('leftFromARelease', () => {
  const main = text(MAIN);
  it('is true for a change to the version and key only', () => {
    expect(leftFromARelease(main, LEFTOVER)).toBe(true);
  });
  it('is false for any other change, or a file that does not parse', () => {
    expect(leftFromARelease(main, text({ ...MAIN, files: ['bin/', 'main/'] }))).toBe(false);
    expect(leftFromARelease(main, '{ not json')).toBe(false);
  });
});
