// A FILE THE PERSON SENDS REACHES THE THREAD'S NEXT CLOUD TURN, AT THE SAME PATH.
//
// What broke (2026-11-03): a cloud thread that needed a file only the person's
// computer had (a film in Movies, a screenshot on the Desktop) could only hand
// itself back, and stalled when the computer was away. Now it asks with a file
// line, the card's Send gives that file to the thread's next cloud turn, and
// nothing that holds sign-ins ever goes. Measured on the real sandbox: the file
// is there at the same path for the agent to read.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { createSandbox, pickBaseEnv } from '../cloud/sandbox/server.mjs';
import { cloudRun } from '../main/cloud/run.mts';
import { fileToSend, filesSentFor, SENT_FILE_MAX } from '../shared/cloud-sent-files.mjs';
import { Supervisor } from '../main/supervisor.mts';
import { TOKEN } from './fixtures/cloud/fake-vendor-cli.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
let tmp; let home; let objects; let s3; let s3Url; let sandbox; let bin;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sent-file-')));
  home = path.join(tmp, 'home');
  fs.mkdirSync(path.join(home, 'Movies'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Movies', 'launch film.mov'), 'the original cut');
  objects = new Map();
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
});
afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('which file may go', () => {
  it('takes a full or ~/ path to a file, with its size', () => {
    const film = path.join(home, 'Movies', 'launch film.mov');
    expect(fileToSend('~/Movies/launch film.mov', { home })).toEqual({ path: film, size: 16 });
    expect(fileToSend(film, { home })).toEqual({ path: film, size: 16 });
  });

  it.each([
    ['a file that is not there', '~/Movies/missing.mov', /not on this computer/],
    ['a folder', '~/Movies', /folder/],
    ['a path that is not full', 'Movies/launch film.mov', /full path/],
  ])('refuses %s', (_, asked, said) => {
    expect(fileToSend(asked, { home }).error).toMatch(said);
  });

  it.each([['~/.ssh/id_ed25519'], ['~/.aws/credentials'], ['~/.config/gh/hosts.yml'], ['~/.claude/.credentials.json'], ['~/.npmrc']])('never sends %s, which holds sign-ins', (asked) => {
    const full = path.join(home, asked.slice(2));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'secret');
    expect(fileToSend(asked, { home }).error).toMatch(/holds sign-ins/);
  });

  it('never sends a sign-in reached through a link with an innocent name', () => {
    fs.mkdirSync(path.join(home, '.ssh'), { recursive: true });
    fs.writeFileSync(path.join(home, '.ssh', 'id_ed25519'), 'secret');
    fs.symlinkSync(path.join(home, '.ssh', 'id_ed25519'), path.join(home, 'Movies', 'notes.txt'));
    expect(fileToSend('~/Movies/notes.txt', { home }).error).toMatch(/holds sign-ins/);
  });

  it('refuses a file over 1 GB', () => {
    const big = path.join(home, 'big.bin');
    fs.writeFileSync(big, '');
    fs.truncateSync(big, SENT_FILE_MAX + 1);
    expect(fileToSend(big, { home }).error).toMatch(/over 1 GB/);
  });

  it('reads only what can still go from the list a turn was given', () => {
    expect(filesSentFor({ AGENTBOX_SEND_FILES: JSON.stringify(['~/Movies/launch film.mov', '~/.ssh/x', 'nope']) }, { home })).toEqual([path.join(home, 'Movies', 'launch film.mov')]);
    expect(filesSentFor({ AGENTBOX_SEND_FILES: 'not json' }, { home })).toEqual([]);
    expect(filesSentFor({}, { home })).toEqual([]);
  });
});

describe('the computer', () => {
  it('gives a sent file to that thread\'s next cloud turn only, once, and sends the turn to the cloud', () => {
    const sup = new Supervisor({ storeRoot: tmp, home, authProfiles: ['default'], cloudRuns: 'full' }, { listItems: () => [], listProducts: () => [], isDue: () => true }, tmp);
    sup._saveState = () => {};
    const film = path.join(home, 'Movies', 'launch film.mov');
    expect(sup.cloudSendFile('w-1', '~/Movies/launch film.mov')).toEqual({ path: film, size: 16 });
    expect(() => sup.cloudSendFile('w-1', '~/Movies/missing.mov')).toThrow(/not on this computer/);
    sup._cloudAccountEnv = () => ({});
    expect(sup._cloudForKey.has('w-1')).toBe(true);
    expect(sup._cloudRelayEnv({ ZERO_ITEM: 'w-2' }).AGENTBOX_SEND_FILES).toBeUndefined();
    expect(JSON.parse(sup._cloudRelayEnv({ ZERO_ITEM: 'w-1' }).AGENTBOX_SEND_FILES)).toEqual([film]);
    expect(sup._cloudRelayEnv({ ZERO_ITEM: 'w-1' }).AGENTBOX_SEND_FILES).toBeUndefined();
    sup.stop?.();
  });
});

describe('a cloud turn', () => {
  it('finds the file the person sent at the same path, and nothing they did not', async () => {
    fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\ncat "${path.join(home, 'Movies', 'launch film.mov')}" 2>/dev/null || echo "no film"\n`, { mode: 0o755 });
    sandbox = createSandbox({
      workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock'),
      baseEnv: { ...pickBaseEnv(process.env), PATH: `${bin}:${process.env.PATH}` },
      terminal: (line) => ['sh', '-c', line], whoIs: async () => null, uploadRetryMs: 10,
    });
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
      async put(k, body) { objects.set(k, Buffer.from(body)); }, async get() { return null; }, async del(k) { objects.delete(k); },
      async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; }, async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
    };
    const turn = async (env) => {
      const stdin = new PassThrough(); stdin.end();
      const stdout = new PassThrough();
      let printed = '';
      stdout.on('data', (d) => { printed += d; });
      await cloudRun({
        argv: ['-p'], env: { ...process.env, ZERO_ITEM: 'w-1', CLAUDE_CONFIG_DIR: path.join(tmp, 'mac', 'claude-home'), ...env },
        cwd: mac, storage, transport: { invoke: (sid, p) => sandbox.handle(p), async stop() {} },
        login: { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' }, imageCaps: ['keys'],
        stdin, stdout, stderr: new PassThrough(), remoteCommand: 'claude', pollWaitMs: 50, resultsWaitMs: 5000, watchParent: false, homeDir: home,
      });
      return printed;
    };
    expect(await turn({ AGENTBOX_SEND_FILES: JSON.stringify(['~/Movies/launch film.mov']) })).toContain('the original cut');
  });
});
