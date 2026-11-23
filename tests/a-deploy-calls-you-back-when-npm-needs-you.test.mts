// 0.1.25's deploy ran for about half an hour, then `npm publish` opened a
// browser approval nobody was there to see, it ran out and came back 404, and
// the run ended "Not finished". npm needs the person at the end of a long build,
// so the deploy now puts up a Mac notification with a sound when it gets there,
// and when the publish fails it waits for Enter and tries again, three times at
// most. Measured by running the real script with fake commands.
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

type Call = { command: string; args: string[] };

// publishes: what each `npm publish` does in turn. enter: whether the person
// presses Enter each time they are asked.
function deploy({ publishes = [true], enter = [true, true, true], platform = 'darwin', npmOnly = false } = {}) {
  let published = false;
  let tries = 0;
  let asks = 0;
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
      mkdtempSync: (p: string) => `${p}tmp`,
      symlinkSync: () => {},
    },
    console: { log: (...a: unknown[]) => messages.push(a.join(' ')), error: (...a: unknown[]) => messages.push(a.join(' ')) },
    process: {
      platform,
      argv: ['node', 'deploy.mjs', ...(npmOnly ? ['--npm'] : [])],
      env: {}, on: () => {}, exit: (code: number) => { throw new Error(`exit:${code}`); },
    },
    execFileSync: () => JSON.stringify({ version: '1.0.0' }),
    spawnSync(command: string, args: string[]) {
      calls.push({ command, args });
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'git' && args[0] === 'ls-remote') return ok(npmOnly ? `${'c'.repeat(40)}\trefs/tags/v1.0.0` : '');
      if (command === 'git' && args[0] === 'log') return ok('The newest change on main');
      if (command === 'git' && args[0] === 'show')return ok(JSON.stringify({ version: '1.0.0' }));
      if (command === 'npm' && args[0] === 'view') return ok(args[2] === 'versions' ? '[]' : published ? '1.0.0' : '0.9.0');
      if (command === 'npm' && args[0] === 'whoami') return ok('publisher');
      if (command === 'npm' && args[0] === 'publish') {
        published = publishes[tries++] ?? false;
        return published ? ok() : { status: 1, stdout: '', stderr: 'E404' };
      }
      if (command === 'bash') return enter[asks++] ? ok() : { status: 142, stdout: '', stderr: '' };
      if (command === 'curl' && args.some((a) => a.includes('api.github.com'))) {
        return ok(JSON.stringify({ body: `Built from https://github.com/x/y/commit/${'b'.repeat(40)}` }));
      }
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
  const index = (pred: (c: Call) => boolean) => calls.findIndex(pred);
  const count = (command: string, arg: string) => calls.filter((c) => c.command === command && c.args[0] === arg).length;
  const notices = calls.filter((c) => c.command === 'osascript');
  return { calls, messages, exitCode, index, count, notices, text: messages.join('\n') };
}

describe('the deploy calls you back when npm needs you', () => {
  it('puts up a notification with a sound before npm asks for approval', () => {
    const run = deploy();
    expect(run.exitCode).toBe(0);
    const notice = run.index((c) => c.command === 'osascript');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(run.index((c) => c.command === 'npm' && c.args[0] === 'publish'));
    expect(run.notices[0].args.join(' ')).toMatch(/display notification .*sound name/);
  });

  it('says nothing on a computer that is not a Mac', () => {
    expect(deploy({ platform: 'linux' }).notices).toHaveLength(0);
  });

  it('tries the publish again when you press Enter, and finishes', () => {
    const run = deploy({ publishes: [false, true] });
    expect(run.count('npm', 'publish')).toBe(2);
    expect(run.exitCode).toBe(0);
    expect(run.text).toMatch(/Press Enter/);
  });

  it('gives up after three tries, leaving the rest out and naming npm run deploy -- --npm', () => {
    const run = deploy({ publishes: [false, false, false, false] });
    expect(run.count('npm', 'publish')).toBe(3);
    expect(run.exitCode).toBe(1);
    expect(run.text).toContain('npm run deploy -- --npm');
    expect(run.count('node', 'scripts/publish-download.mjs')).toBe(1);
  });

  it('stops asking when nobody presses Enter in time', () => {
    const run = deploy({ publishes: [false, true], enter: [false] });
    expect(run.count('npm', 'publish')).toBe(1);
    expect(run.exitCode).toBe(1);
  });

  it('does the same in npm run deploy -- --npm', () => {
    const run = deploy({ npmOnly: true, publishes: [false, true] });
    expect(run.count('npm', 'publish')).toBe(2);
    expect(run.exitCode).toBe(0);
    expect(run.notices.length).toBeGreaterThan(0);
  });
});

describe('the deploy says what it is putting out', () => {
  it('names the newest change on main, so you can see yours is in', () => {
    expect(deploy().text).toContain('The newest change on main');
  });
});
