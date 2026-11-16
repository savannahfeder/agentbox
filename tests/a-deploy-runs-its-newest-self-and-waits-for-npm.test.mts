// 0.1.26's deploy printed "✗ npm still 0.1.22" seconds after npm said
// "+ agentbox-app@0.1.26 ... may take a few minutes to become available"; a
// minute later the registry's latest was 0.1.26. The same run printed advice
// main had already replaced, because the folder was behind main: the deploy
// read its own file before catching the folder up, so the fixes on main waited
// a release. Measured by running the real script with fake commands.
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

type Call = { command: string; args: string[]; env?: Record<string, string | undefined> };

function deploy({ behind = 0, deployChanged = false, restarted = false, staleReads = 0, restartStatus = 0 } = {}) {
  let published = false;
  let reads = 0;
  const calls: Call[] = [];
  const messages: string[] = [];
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  let exitCode = 0;
  const context = {
    path, os, fileURLToPath, nextVersion, serverConfig, whatIsLive, withVersion,
    RELEASE_REPO: 'example/releases',
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ version: '1.0.0', posthogKey: 'k', bucket: 'b', runtimeArn: 'r' }),
      writeFileSync: () => {},
    },
    console: { log: (...a: unknown[]) => messages.push(a.join(' ')), error: (...a: unknown[]) => messages.push(a.join(' ')) },
    process: {
      platform: 'linux',
      argv: ['node', 'deploy.mjs'],
      env: restarted ? { AGENTBOX_DEPLOY_RESTARTED: '1' } : {},
      on: () => {}, exit: (code: number) => { throw new Error(`exit:${code}`); },
    },
    execFileSync: () => JSON.stringify({ version: '1.0.0' }),
    spawnSync(command: string, args: string[], options: { env?: Record<string, string | undefined> } = {}) {
      calls.push({ command, args, env: options.env });
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'git' && args[0] === 'rev-list') return ok(String(behind));
      if (command === 'git' && args[0] === 'diff') return deployChanged ? { status: 1, stdout: '', stderr: '' } : ok();
      if (command === 'node' && args[1] === 'scripts/deploy.mjs') return { status: restartStatus, stdout: '', stderr: '' };
      if (command === 'npm' && args[0] === 'view') {
        if (args[2] === 'versions') return ok('[]');
        reads++;
        return ok(published && reads > staleReads ? '1.0.0' : '0.9.0');
      }
      if (command === 'npm' && args[0] === 'whoami') return ok('publisher');
      if (command === 'npm' && args[0] === 'publish') { published = true; return ok(); }
      if (command === 'curl') return ok('version: 1.0.0');
      if (command === 'security') return ok('"Developer ID Application: Test (ABCDEFGHIJ)"');
      if (command === 'gh' && args[0] === 'api') return ok('true');
      if (command === 'gh' && args[0] === 'release') return ok('v1.0.0');
      if (command === 'aws' && args[0] === 'lambda') return ok(new Date(Date.now() + 60_000).toISOString());
      return ok();
    },
  };
  try { vm.runInNewContext(source, context, { timeout: 2_000 }); } catch (error) {
    if (!/^exit:\d+$/.test((error as Error).message)) throw error;
    exitCode = Number((error as Error).message.slice(5));
  }
  const restart = calls.find((c) => c.command === 'node' && c.args[1] === 'scripts/deploy.mjs');
  const built = calls.some((c) => c.command === 'node' && c.args[0] === 'scripts/release.mjs');
  return { calls, messages, exitCode, restart, built, text: messages.join('\n') };
}

describe('a deploy whose own script changed on main', () => {
  it('catches the folder up, then hands the release to the new script', () => {
    const run = deploy({ behind: 3, deployChanged: true, restartStatus: 0 });
    expect(run.restart?.args).toEqual(['scripts/run.mjs', 'scripts/deploy.mjs']);
    expect(run.restart?.env?.AGENTBOX_DEPLOY_RESTARTED).toBe('1');
    expect(run.built).toBe(false);
    expect(run.exitCode).toBe(0);
  });

  it('ends the way the new script ended', () => {
    expect(deploy({ behind: 3, deployChanged: true, restartStatus: 1 }).exitCode).toBe(1);
  });

  it('runs on when main moved but the deploy did not', () => {
    const run = deploy({ behind: 3, deployChanged: false });
    expect(run.restart).toBeUndefined();
    expect(run.built).toBe(true);
  });

  it('runs on when it is already the restarted one, so it cannot loop', () => {
    const run = deploy({ behind: 3, deployChanged: true, restarted: true });
    expect(run.restart).toBeUndefined();
    expect(run.built).toBe(true);
  });

  it('runs on when the folder was already at main', () => {
    expect(deploy({ behind: 0, deployChanged: true }).restart).toBeUndefined();
  });
});

describe('reading npm back after a publish', () => {
  it('waits while npm is still processing the new version', () => {
    const run = deploy({ staleReads: 2 });
    expect(run.text).toMatch(/✓ npm\s+1\.0\.0/);
    expect(run.exitCode).toBe(0);
  });
});
