// A CLOUD RUN SAYS ONCE WHY CODEX IS SIGNED OUT THERE (w-d0357badd1).
//
// What broke (2026-11-09 to 11-12): the cloud's one Codex sign-in was refused
// by OpenAI (401) while its own expiry said it had days left, and it was then
// marked as needing a new sign-in, so Claude runs carried no Codex at all. No
// run was told any of that. Agents found Codex signed out, or signed in but
// refused, and asked for a device sign-in through the sign-in card each time.
// That sign-in lives on the throwaway machine, so the person signed Codex in
// about five times in two days and every next run started signed out again.
// Measured from the threads' own reports and from main/cloud/run-cli.mts,
// which carried nothing and said nothing.
//
// Now a Claude run is told, in its note, whether Codex is signed in there and
// why not: not to make a sign-in that cannot last, to say once that the cloud
// menu's sign-in is the one to redo, and to hand work that needs Codex back to
// the computer, whose own Codex works.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { createSandbox, pickBaseEnv } from '../cloud/sandbox/server.mjs';
import { cloudRun, cloudNote, codexNote, CLOUD_NOTE, PLAIN_CLOUD_NOTE } from '../main/cloud/run.mts';
import { recordCloudLogin, markCloudLogin, cloudLoginStateForARun } from '../main/cloud/logins.mts';
import { codexInTheRun } from '../main/cloud/run-cli.mts';
import { HAND_BACK } from '../shared/cloud-hand-back.mts';
import { TOKEN } from './fixtures/cloud/fake-vendor-cli.mjs';

const H = 3600_000;
const NOW = Date.UTC(2026, 10, 12, 18, 0);

let tmp: string; let home: string;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-codex-note-')));
  home = path.join(tmp, 'home');
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('what a run is told about Codex there', () => {
  it('signed in: how to tell a refused sign-in, and not to make one here', () => {
    const note = codexNote({ carried: true });
    expect(note).toMatch(/Codex here is signed in to the cloud's Codex account/);
    expect(note).toMatch(/`codex login status` says signed in even when/);
    expect(note).toMatch(/do not sign Codex in on this machine/i);
    expect(note).toMatch(/Sign in again in the cloud menu/);
    expect(note).toContain(`\`${HAND_BACK} a working Codex sign-in\``);
  });

  it('stopped working: signed out, and Sign in again from the cloud menu', () => {
    const note = codexNote({ carried: false, state: 'broken' });
    expect(note).toMatch(/^Codex is signed out on this machine, because the cloud's Codex sign-in has stopped working\./);
    expect(note).toMatch(/Sign in again in the cloud menu on their computer mends it for every later run/);
    expect(note).toMatch(/do not sign Codex in on this machine/i);
    expect(note).toContain(`${HAND_BACK} a working Codex sign-in`);
  });

  it('never added: says so, and where to add one', () => {
    const note = codexNote({ carried: false, state: 'none' });
    expect(note).toMatch(/because no Codex account is signed in for the cloud/);
    expect(note).toMatch(/signed in for the cloud from the cloud menu/);
  });

  it('being renewed, or at its limit: says it comes back, and until when', () => {
    expect(codexNote({ carried: false, state: 'renew' })).toMatch(/being renewed by their computer/);
    const limited = codexNote({ carried: false, state: 'limited', until: NOW + 2 * H });
    expect(limited).toMatch(/at its usage limit until \d{1,2}:\d\d[ap]m/);
  });

  it('comes before the hand-back, which stays the last paragraph', () => {
    for (const plain of [false, true]) {
      const parts = cloudNote({ plain, codex: { carried: false, state: 'broken' } }).split('\n\n');
      expect(parts.at(-2)).toBe(codexNote({ carried: false, state: 'broken' }));
      expect(parts.at(-1)).toBe((plain ? PLAIN_CLOUD_NOTE : CLOUD_NOTE).split('\n\n').at(-1));
    }
  });

  it('says nothing about Codex when the run is Codex itself, or nothing was asked', () => {
    expect(cloudNote({ codex: null })).toBe(CLOUD_NOTE);
    expect(CLOUD_NOTE).not.toMatch(/Codex here is signed in|Codex is signed out on this machine/);
  });
});

describe('why the computer carried no Codex into a run', () => {
  const state = (opts = {}) => cloudLoginStateForARun('codex', { home, now: NOW, ...opts });

  it('none added', () => {
    expect(state()).toEqual({ state: 'none', until: null });
  });

  it('the one added stopped working', () => {
    recordCloudLogin('codex', 'mine', { id: 'C1', expiresAt: NOW + 200 * H }, { home });
    markCloudLogin('codex', 'mine', 'C1', { broken: 'refused' }, { home });
    expect(state()).toEqual({ state: 'broken', until: null });
  });

  it('the computer\'s own account stopped working, though another still works', () => {
    recordCloudLogin('codex', 'mine', { id: 'C1', savedAt: 1, expiresAt: NOW + 200 * H }, { home });
    recordCloudLogin('codex', 'other', { id: 'C2', savedAt: 2, expiresAt: NOW + 200 * H }, { home });
    markCloudLogin('codex', 'mine', 'C1', { broken: 'refused' }, { home });
    expect(state({ prefer: 'mine' }).state).toBe('broken');
  });

  it('due a renewal, or at its limit until a time', () => {
    recordCloudLogin('codex', 'mine', { id: 'C1', expiresAt: NOW + 2 * H }, { home });
    expect(state().state).toBe('renew');
    recordCloudLogin('codex', 'mine', { id: 'C2', expiresAt: NOW + 200 * H }, { home });
    markCloudLogin('codex', 'mine', 'C2', { limitedUntil: NOW + 3 * H }, { home });
    expect(state()).toEqual({ state: 'limited', until: NOW + 3 * H });
  });

  it('a Claude run is told it carried Codex, or why not; a Codex run is told nothing', () => {
    expect(codexInTheRun('claude', [{ engine: 'codex', id: 'C1', key: 'logins/codex/C1.json' }], { home, now: NOW })).toEqual({ carried: true });
    recordCloudLogin('codex', 'mine', { id: 'C1', expiresAt: NOW + 200 * H }, { home });
    markCloudLogin('codex', 'mine', 'C1', { broken: 'refused' }, { home });
    expect(codexInTheRun('claude', [], { home, now: NOW })).toEqual({ carried: false, state: 'broken', until: null });
    expect(codexInTheRun('codex', [], { home, now: NOW })).toBeNull();
  });
});

describe('a real sandbox run', () => {
  let objects: Map<string, Buffer>; let s3: http.Server; let s3Url: string; let sandbox: ReturnType<typeof createSandbox> | null = null;
  beforeEach(async () => {
    objects = new Map();
    s3 = http.createServer((req, res) => {
      const k = decodeURIComponent(req.url!.slice(1).split('?')[0]);
      if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
      const chunks: Buffer[] = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
    });
    await new Promise<void>((r) => s3.listen(0, '127.0.0.1', r));
    s3Url = `http://127.0.0.1:${(s3.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    await sandbox?.close();
    sandbox = null;
    s3.closeAllConnections();
    await new Promise((r) => s3.close(r));
  });

  it('hands the agent the Codex paragraph in its instructions', async () => {
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\nfor a in "$@"; do case "$a" in *"Codex is signed out on this machine"*) echo "told: signed out";; esac; done\n', { mode: 0o755 });
    sandbox = createSandbox({
      workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock'),
      baseEnv: { ...pickBaseEnv(process.env), PATH: `${bin}:${process.env.PATH}` },
      terminal: (line: string) => ['sh', '-c', line], whoIs: async () => null, uploadRetryMs: 10,
    });
    const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
    const mac = path.join(tmp, 'mac', 'repo');
    fs.mkdirSync(mac, { recursive: true });
    git(mac, 'init', '-q', '-b', 'main');
    git(mac, 'config', 'user.email', 'dev@example.com');
    git(mac, 'config', 'user.name', 'Dev');
    fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
    git(mac, 'add', '.');
    git(mac, 'commit', '-q', '-m', 'first');
    git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
    objects.set('logins/claude/L1.json', Buffer.from(JSON.stringify({ engine: 'claude', token: TOKEN })));
    const storage = {
      async put(k: string, body: string | Buffer) { objects.set(k, Buffer.from(body)); },
      async get(k: string): Promise<Buffer> { throw new Error(`the Mac read ${k}`); },
      async del(k: string) { objects.delete(k); },
      async getUrl(k: string) { return `${s3Url}/${encodeURIComponent(k)}`; },
      async putUrl(k: string) { return `${s3Url}/${encodeURIComponent(k)}`; },
    };
    const sent: Record<string, unknown>[] = [];
    const stdin = new PassThrough(); stdin.end();
    const stdout = new PassThrough();
    let printed = '';
    stdout.on('data', (d) => { printed += d; });
    await cloudRun({
      argv: ['-p'], env: { ...process.env, ZERO_ITEM: 'w-1', CLAUDE_CONFIG_DIR: path.join(tmp, 'mac', 'claude-home') },
      cwd: mac, storage: storage as never,
      transport: { invoke: (_sid: string, p: Record<string, unknown>) => { sent.push(p); return sandbox!.handle(p); }, async stop() {} } as never,
      login: { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' },
      codexHere: { carried: false, state: 'broken' },
      stdin, stdout, stderr: new PassThrough(), remoteCommand: 'claude',
      pollWaitMs: 50, resultsWaitMs: 5000, watchParent: false, homeDir: home,
    });
    expect(printed).toContain('told: signed out');
  }, 30_000);
});
