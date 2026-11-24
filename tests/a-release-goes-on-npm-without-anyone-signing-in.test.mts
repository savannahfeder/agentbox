// Every release asked for an npm login and then a second browser approval for
// the publish, both after a half-hour build, and most releases missed npm (0.1.25
// and 0.1.27 among them: "still signed out, so it is skipped"). GitHub now
// publishes through publish-npm.yml, which npm trusts, and this Mac signs in
// only when GitHub cannot. Measured by running the real deploy with fake
// commands and a clock that moves 15 seconds per wait.
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
const workflow = fs.readFileSync(new URL('../.github/workflows/publish-npm.yml', import.meta.url), 'utf8');

type Call = { command: string; args: string[] };
type Run = { status: string; conclusion: string; createdAt: string; url: string };

// github: what GitHub's run does. 'refuses' is `gh workflow run` failing;
// 'old' is a list holding only a run from before the deploy asked.
function deploy({ github = 'publishes', npmOnly = false, checkOnly = false, workflowListed = true } = {}) {
  let now = Date.parse('2026-11-24T10:00:00Z');
  class FakeDate extends Date {
    static now() { return now; }
  }
  let published = false;
  let askedAt = 0;
  const calls: Call[] = [];
  const messages: string[] = [];
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const failed = { status: 1, stdout: '', stderr: 'failed' };
  let exitCode = 0;
  const runs = (): Run[] => {
    const url = 'https://github.com/x/y/actions/runs/1';
    const at = new Date(askedAt + 5_000).toISOString();
    if (github === 'old') return [{ status: 'completed', conclusion: 'success', createdAt: new Date(askedAt - 3_600_000).toISOString(), url }];
    if (github === 'publishes') return [{ status: 'completed', conclusion: 'success', createdAt: at, url }];
    if (github === 'fails') return [{ status: 'completed', conclusion: 'failure', createdAt: at, url }];
    return [{ status: 'in_progress', conclusion: '', createdAt: at, url }];
  };
  const context = {
    Date: FakeDate,
    path, os, fileURLToPath, nextVersion, serverConfig, whatIsLive, withVersion,
    RELEASE_REPO: 'example/releases',
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ version: '1.0.0', posthogKey: 'phc_test', bucket: 'b', runtimeArn: 'r' }),
      writeFileSync: () => {},
      mkdtempSync: (p: string) => `${p}tmp`,
      symlinkSync: () => {},
    },
    console: { log: (...a: unknown[]) => messages.push(a.join(' ')), error: (...a: unknown[]) => messages.push(a.join(' ')) },
    process: {
      platform: 'darwin',
      argv: ['node', 'deploy.mjs', ...(npmOnly ? ['--npm'] : []), ...(checkOnly ? ['--check'] : [])],
      env: {}, on: () => {}, exit: (code: number) => { throw new Error(`exit:${code}`); },
    },
    execFileSync: () => JSON.stringify({ version: '1.0.0' }),
    spawnSync(command: string, args: string[]) {
      calls.push({ command, args });
      if (command === 'sleep') { now += Number(args[0]) * 1000; return ok(); }
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'git' && args[0] === 'ls-remote') return ok(npmOnly ? `${'c'.repeat(40)}\trefs/tags/v1.0.0` : '');
      if (command === 'git' && args[0] === 'show') return ok(JSON.stringify({ version: '1.0.0' }));
      if (command === 'gh' && args[0] === 'workflow' && args[1] === 'view') return workflowListed ? ok('name: Publish to npm') : failed;
      if (command === 'gh' && args[0] === 'workflow' && args[1] === 'run') {
        askedAt = now;
        if (github === 'refuses') return failed;
        if (github === 'publishes') published = true;
        return ok();
      }
      if (command === 'gh' && args[0] === 'run' && args[1] === 'list') return ok(JSON.stringify(runs()));
      if (command === 'npm' && args[0] === 'view') return ok(args[2] === 'versions' ? '[]' : published ? '1.0.0' : '0.9.0');
      if (command === 'npm' && args[0] === 'whoami') return ok('publisher');
      if (command === 'npm' && args[0] === 'publish') { published = true; return ok(); }
      if (command === 'curl' && args.some((a) => a.includes('api.github.com'))) {
        return ok(JSON.stringify({ body: `Built from https://github.com/x/y/commit/${'b'.repeat(40)}` }));
      }
      if (command === 'curl') return ok('version: 1.0.0');
      if (command === 'security') return ok('"Developer ID Application: Test (ABCDEFGHIJ)"');
      if (command === 'gh' && args[0] === 'api') return ok('true');
      if (command === 'gh' && args[0] === 'release') return ok('v1.0.0');
      if (command === 'aws' && args[0] === 'lambda') return ok(new Date(now + 60_000).toISOString());
      return ok();
    },
  };
  try { vm.runInNewContext(source, context, { timeout: 2_000 }); } catch (error) {
    if (!/^exit:\d+$/.test((error as Error).message)) throw error;
    exitCode = Number((error as Error).message.slice(5));
  }
  const count = (command: string, arg: string) => calls.filter((c) => c.command === command && c.args[0] === arg).length;
  const at = (command: string, arg: string) => calls.findIndex((c) => c.command === command && c.args[0] === arg);
  const dispatch = calls.find((c) => c.command === 'gh' && c.args[0] === 'workflow' && c.args[1] === 'run');
  return { calls, exitCode, count, at, dispatch, text: messages.join('\n') };
}

describe('a release goes on npm without anyone signing in', () => {
  it('has GitHub publish the commit and version this release was built from, and never signs in here', () => {
    const run = deploy();
    expect(run.exitCode).toBe(0);
    expect(run.dispatch?.args).toEqual(expect.arrayContaining(['publish-npm.yml', '--ref', 'main',
      `commit=${'a'.repeat(40)}`, 'version=1.0.0', 'posthog=phc_test']));
    expect(run.count('npm', 'whoami')).toBe(0);
    expect(run.count('npm', 'login')).toBe(0);
    expect(run.count('npm', 'publish')).toBe(0);
    expect(run.calls.some((c) => c.command === 'osascript' && c.args.join(' ').includes('approve'))).toBe(false);
    expect(run.text).toMatch(/✓ npm\s+1\.0\.0/);
  });

  it('starts GitHub only after the download and the cloud server are out', () => {
    const run = deploy();
    const dispatched = run.calls.indexOf(run.dispatch!);
    expect(run.at('node', 'scripts/publish-download.mjs')).toBeLessThan(dispatched);
    expect(run.at('node', 'scripts/cloud-gateway-setup.mjs')).toBeLessThan(dispatched);
  });

  it.each(['fails', 'refuses'])('signs in and publishes from this Mac when GitHub %s', (github) => {
    const run = deploy({ github });
    expect(run.count('npm', 'publish')).toBe(1);
    expect(run.at('npm', 'publish')).toBeGreaterThan(run.calls.indexOf(run.dispatch!));
    expect(run.exitCode).toBe(0);
  });

  it('names the failed run so you can see why', () => {
    expect(deploy({ github: 'fails' }).text).toContain('https://github.com/x/y/actions/runs/1');
  });

  it('does not take a run from before it asked for its own', () => {
    const run = deploy({ github: 'old' });
    expect(run.text).toContain('GitHub never started the run');
    expect(run.count('npm', 'publish')).toBe(1);
  });

  it('does not publish here as well while GitHub is still publishing', () => {
    const run = deploy({ github: 'running' });
    expect(run.count('npm', 'publish')).toBe(0);
    expect(run.count('npm', 'login')).toBe(0);
    expect(run.text).toContain('still running after 30 minutes');
    expect(run.exitCode).toBe(1);
  });

  it('has GitHub publish a release that missed npm, from the commit its Mac app was built from', () => {
    const run = deploy({ npmOnly: true });
    expect(run.exitCode).toBe(0);
    expect(run.dispatch?.args).toEqual(expect.arrayContaining([`commit=${'b'.repeat(40)}`, 'version=1.0.0']));
    expect(run.count('npm', 'publish')).toBe(0);
  });

  it('says in check mode that GitHub publishes npm, without asking npm who is signed in', () => {
    const run = deploy({ checkOnly: true });
    expect(run.exitCode).toBe(0);
    expect(run.count('npm', 'whoami')).toBe(0);
    expect(run.text).toContain('GitHub publishes it');
    expect(run.dispatch).toBeUndefined();
  });

  it('checks the npm sign-in in check mode when GitHub has no publish workflow', () => {
    const run = deploy({ checkOnly: true, workflowListed: false });
    expect(run.count('npm', 'whoami')).toBe(1);
  });
});

describe('the workflow npm trusts', () => {
  it('runs only when asked, on main, with the id npm checks instead of a password', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toMatch(/permissions:\n {2}contents: read\n {2}id-token: write/);
    expect(workflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN:/);
  });

  it('builds on a Mac, so the package carries the glass', () => {
    expect(workflow).toContain('runs-on: macos-latest');
    expect(workflow).toContain('main/native/liquid-glass/build/liquid-glass.node');
    expect(workflow).toContain('main/native/window-glass/build/window-glass.node');
  });

  it('publishes only a commit on main that says the version it was asked for', () => {
    expect(workflow).toContain('git merge-base --is-ancestor "$COMMIT" refs/remotes/origin/main');
    expect(workflow).toContain('[ "$said" = "$VERSION" ]');
    expect(workflow).toContain('fetch-depth: 0');
  });

  it('carries the analytics key, and reads every input from the environment rather than pasting it into a command', () => {
    expect(workflow).toContain('p.bakedPosthogKey = process.env.POSTHOG_KEY');
    const runLines = workflow.split('\n').filter((l) => !/^\s*(ref|[A-Z_]+):/.test(l));
    expect(runLines.join('\n')).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('uses an npm new enough for trusted publishing', () => {
    expect(workflow).toContain('npm install -g npm@^11.5.1');
    expect(workflow).toContain('npm publish --ignore-scripts');
  });
});
