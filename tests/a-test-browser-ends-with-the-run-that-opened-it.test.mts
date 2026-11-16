// On 2026-11-15 seven headless test browsers were still running on the
// person's Mac 19 hours to 2.7 days after the phone and power tests that opened
// them, holding 1.5 GB between them. They are started detached so they outlive
// each short `phone`/`app` command, and they inherit AGENTBOX_KEEP=1 from the
// detached run, so the leftovers sweep never touches them; a run killed
// outright, or a phone opened outside a workday, left them for good.
//
// Now a detached browser carries a watcher: it ends the browser when the run
// that owns it is gone, or, with no owner, after an hour with no command. It
// checks the browser's and the owner's start times, so a reused pid is neither
// kept alive nor killed (agreed with Codex, 2026-11-15).
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { launchChrome } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const WATCH = path.resolve(import.meta.dirname, '../.claude/skills/verify-agentbox/scripts/browser-watch.sh');
const started: ChildProcess[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const c of started.splice(0)) { try { process.kill(c.pid!, 'SIGKILL'); } catch { /* gone */ } }
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-watch-')); dirs.push(d); return d; };
const startOf = (pid: number) => spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const idle = (args: string[] = []) => { const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', ...args], { stdio: 'ignore' }); started.push(c); return c; };
const browser = (profile: string) => idle(['--', `--user-data-dir=${profile}`, '--headless=new']);
const watch = (args: string[]) => { const c = spawn('/bin/sh', [WATCH, ...args], { stdio: 'ignore' }); started.push(c); return c; };
const until = async (fn: () => boolean, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 200)); } return fn(); };
const ready = async (c: ChildProcess) => { await until(() => !!startOf(c.pid!), 3000); };

describe('the watcher', () => {
  it('ends the browser once the run that owns it is gone', async () => {
    const profile = tmp(); const b = browser(profile); const owner = idle();
    await ready(b); await ready(owner);
    watch([String(b.pid), startOf(b.pid!), profile, String(owner.pid), startOf(owner.pid!), '', '3600', '1']);
    await new Promise((r) => setTimeout(r, 1500));
    expect(alive(b.pid!)).toBe(true);
    process.kill(owner.pid!, 'SIGKILL');
    expect(await until(() => !alive(b.pid!), 6000)).toBe(true);
  });

  it('takes an owner pid with a different start time for a gone owner', async () => {
    const profile = tmp(); const b = browser(profile); const owner = idle();
    await ready(b); await ready(owner);
    watch([String(b.pid), startOf(b.pid!), profile, String(owner.pid), 'Mon Jan  1 00:00:00 2001', '', '3600', '1']);
    expect(await until(() => !alive(b.pid!), 6000)).toBe(true);
  });

  it('never signals a process that is not the browser it was given', async () => {
    const profile = tmp(); const other = browser(profile);
    await ready(other);
    const w = watch([String(other.pid), 'Mon Jan  1 00:00:00 2001', profile, '', '', '', '0', '1']);
    expect(await until(() => w.exitCode !== null, 5000)).toBe(true);
    expect(alive(other.pid!)).toBe(true);
    const wrongProfile = watch([String(other.pid), startOf(other.pid!), `${profile}-not-this-one`, '', '', '', '0', '1']);
    expect(await until(() => wrongProfile.exitCode !== null, 5000)).toBe(true);
    expect(alive(other.pid!)).toBe(true);
  });

  it('with no owner, keeps a browser in use and ends one left idle', async () => {
    const profile = tmp(); const activity = path.join(profile, 'actions.jsonl');
    fs.writeFileSync(activity, '');
    const b = browser(profile); await ready(b);
    watch([String(b.pid), startOf(b.pid!), profile, '', '', activity, '3', '1']);
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 1000)); fs.appendFileSync(activity, '{}\n'); }
    expect(alive(b.pid!)).toBe(true);
    expect(await until(() => !alive(b.pid!), 8000)).toBe(true);
  });

  it('counts idle time from its own start while no command has been logged', async () => {
    const profile = tmp(); const b = browser(profile); await ready(b);
    watch([String(b.pid), startOf(b.pid!), profile, '', '', path.join(profile, 'never-written.jsonl'), '2', '1']);
    await new Promise((r) => setTimeout(r, 800));
    expect(alive(b.pid!)).toBe(true);
    expect(await until(() => !alive(b.pid!), 6000)).toBe(true);
  });

  it('leaves on its own when the browser has already gone', async () => {
    const profile = tmp(); const b = browser(profile); const owner = idle();
    await ready(b); await ready(owner);
    const w = watch([String(b.pid), startOf(b.pid!), profile, String(owner.pid), startOf(owner.pid!), '', '3600', '1']);
    process.kill(b.pid!, 'SIGKILL');
    expect(await until(() => w.exitCode !== null, 5000)).toBe(true);
    expect(alive(owner.pid!)).toBe(true);
  });
});

describe('launchChrome', () => {
  // A stand-in for Chrome: prints a devtools address and idles, carrying the
  // flags it was started with so the watcher can recognise its profile.
  const fakeChrome = (_bin: string, args: string[], opts: object) => {
    const c = spawn(process.execPath, ['-e', 'console.error("ws://127.0.0.1:1/devtools/browser/x"); setInterval(() => {}, 1000)', '--', ...args], opts);
    started.push(c);
    return c;
  };
  const watchersOf = (pid: number) => spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout
    .split('\n').filter((l) => l.includes('browser-watch.sh') && l.includes(` ${pid} `));

  it('gives a detached browser a watcher tied to the run named in the environment', async () => {
    const profile = tmp(); const owner = idle(); await ready(owner);
    const { chrome } = await launchChrome({ profile, detached: true, bin: process.execPath, platform: 'linux', start: fakeChrome, owner: owner.pid, watchEvery: 1 });
    expect(await until(() => watchersOf(chrome.pid).length === 1, 3000)).toBe(true);
    process.kill(owner.pid!, 'SIGKILL');
    expect(await until(() => !alive(chrome.pid), 6000)).toBe(true);
  });

  it('gives a browser it does not leave behind no watcher', async () => {
    const profile = tmp();
    const { chrome } = await launchChrome({ profile, detached: false, bin: process.execPath, platform: 'linux', start: fakeChrome });
    await new Promise((r) => setTimeout(r, 500));
    expect(watchersOf(chrome.pid)).toEqual([]);
  });
});
