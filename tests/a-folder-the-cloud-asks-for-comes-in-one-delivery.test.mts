// A FOLDER A CLOUD RUN ASKS FOR COMES IN ONE DELIVERY (w-77d2735f8e, 2026-11-13).
//
// A folder request answered with a list of its files, each to be asked for on
// its own. A run rebuilding an outreach film needed about 40 small tool files,
// and the run's 40-request limit cut it off before the work was done. Now a
// folder comes as one archive the cloud machine unpacks at the path the answer
// gives, counted as one request. A machine whose image predates this, a folder
// too big to send at once, and every hidden or private file are handled as
// before. Measured by packing a folder here and unpacking it in a real sandbox.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createResourceRequests } from '../main/cloud/resources.mts';
import { createSandbox } from '../cloud/sandbox/server.mjs';

let root; let account; let options; let uploaded;
const tools = 'outreach/tools';
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-folder-')));
  account = path.join(root, 'home/Zero/accounts/acct');
  for (const dir of ['task', 'home/.claude', 'home/Zero/accounts/acct/agentbox']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (let i = 0; i < 45; i++) put(`${tools}/step-${i}.mjs`, `export const n = ${i};\n`);
  put(`${tools}/lib/record.sh`, '#!/bin/sh\necho record\n', 0o755);
  put(`${tools}/.env`, 'SECRET=1');
  put(`${tools}/node_modules/x/index.js`, 'x');
  put(`${tools}/leaked.txt`, 'ghp_' + 'a'.repeat(40));
  uploaded = new Map();
  options = { cwd: path.join(root, 'task'), docs: path.join(account, 'agentbox'), account, homeDir: path.join(root, 'home'),
    configDir: path.join(root, 'home/.claude'), engine: 'claude', runId: 'run-folder', state: {}, save: () => {},
    upload: vi.fn(async (key, body) => { uploaded.set(key, Buffer.from(body)); return `https://storage.invalid/${key}`; }),
    deliver: vi.fn(async () => true), stopped: () => false, folders: () => true, timeoutMs: 5000 };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function put(rel, text, mode = 0o644) { const f = path.join(account, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text, { mode }); return f; }

it('delivers every file in a folder as one request, at the path the answer gives', async () => {
  const request = createResourceRequests({ ...options, limits: { requests: 2 } });
  const answer = await request({ kind: 'file', scope: 'account', path: tools });
  expect(answer.status).toBe('delivered');
  expect(path.basename(answer.path)).toBe('tools');
  expect(answer.files).toHaveLength(46);
  expect(answer.files.map((f) => f.path)).toContain(path.posix.join(answer.path, 'lib/record.sh'));
  expect(answer.message).toMatch(/leaked\.txt/);
  expect(options.upload).toHaveBeenCalledTimes(1);
  expect(options.deliver).toHaveBeenCalledTimes(1);
  const [file] = options.deliver.mock.calls[0][0];
  expect(path.basename(file.path)).toMatch(/^\.folder-[a-f0-9]{64}\.tgz$/);
  expect(file.untar).toBe(answer.path);
  // One request spent, so the run can still ask for another.
  put('outreach/brief.md', 'brief');
  expect(await request({ kind: 'file', scope: 'account', path: 'outreach/brief.md' })).toMatchObject({ status: 'delivered' });
});

it('unpacks on the cloud machine with every file and its mode, and nothing hidden or private', async () => {
  const answer = await createResourceRequests(options)({ kind: 'file', scope: 'account', path: tools });
  const [file] = options.deliver.mock.calls[0][0];
  const body = uploaded.get([...uploaded.keys()][0]);
  const sandbox = createSandbox({ workRoot: path.join(root, 'work'), pathRoot: path.join(root, 'vm'), bridgeSocket: path.join(root, 'bridge.sock'),
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => body }) });
  try {
    expect(await sandbox.handle({ action: 'start', runId: 'run-folder', plain: true, cwd: '/project', argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'], files: [] })).toMatchObject({ ok: true });
    expect(await sandbox.handle({ action: 'files', resource: true, runId: 'run-folder', n: 1, files: [file] })).toMatchObject({ ok: true });
    const there = path.join(root, 'vm', answer.path);
    expect(fs.readFileSync(path.join(there, 'step-7.mjs'), 'utf8')).toBe('export const n = 7;\n');
    expect(fs.statSync(path.join(there, 'lib/record.sh')).mode & 0o111).not.toBe(0);
    for (const gone of ['.env', 'node_modules', 'leaked.txt']) expect(fs.existsSync(path.join(there, gone)), gone).toBe(false);
  } finally { await sandbox.close(); }
});

it('says it can unpack folders when a run starts', async () => {
  const sandbox = createSandbox({ workRoot: path.join(root, 'work'), pathRoot: path.join(root, 'vm'), bridgeSocket: path.join(root, 'bridge.sock') });
  try {
    const started = await sandbox.handle({ action: 'start', runId: 'r', plain: true, cwd: '/project', argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'], files: [] });
    expect(started.caps).toContain('folders');
  } finally { await sandbox.close(); }
});

it('refuses a folder archive aimed anywhere but its own folder', async () => {
  const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const sandbox = createSandbox({ workRoot: path.join(root, 'work'), pathRoot: path.join(root, 'vm'), bridgeSocket: path.join(root, 'bridge.sock'),
    fetchImpl: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('x') })) });
  try {
    await sandbox.handle({ action: 'start', runId: 'r', plain: true, cwd: '/project', argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'], files: [] });
    const dir = `/tmp/agentbox-resources/${hash('r')}/${'c'.repeat(64)}`;
    const archive = `${dir}/.folder-${'d'.repeat(64)}.tgz`;
    let n = 0;
    for (const untar of [`${dir}/../tools`, `${dir}/a/b`, `${dir}/.hidden`, '/project/tools']) {
      expect(await sandbox.handle({ action: 'files', resource: true, runId: 'r', n: ++n, files: [{ path: archive, url: 'https://storage.invalid/x', untar }] }), untar).toMatchObject({ ok: false, consumed: true });
    }
  } finally { await sandbox.close(); }
});

it('answers with the list of files, as before, on a cloud machine older than folder delivery', async () => {
  const answer = await createResourceRequests({ ...options, folders: () => false })({ kind: 'file', scope: 'account', path: tools });
  expect(answer.status).toBe('folder');
  expect(answer.files).toHaveLength(47);
  expect(options.upload).not.toHaveBeenCalled();
});

it('answers with the list when the folder is more than the run has room for', async () => {
  const answer = await createResourceRequests({ ...options, limits: { total: 100 } })({ kind: 'file', scope: 'account', path: tools });
  expect(answer.status).toBe('folder');
  expect(answer.message).toMatch(/too big to send at once/);
  expect(options.upload).not.toHaveBeenCalled();
});
