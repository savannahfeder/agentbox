// Online resource requests need stricter destination handling than legacy
// attachments, and a rejected resource must consume its input without stopping work.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createSandbox } from '../cloud/sandbox/server.mjs';

let root; let sandbox; let fetchFile;
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const runId = 'resource-run';
const prefix = `/tmp/agentbox-resources/${hash(runId)}`;
beforeEach(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'resource-receiver-')));
  fetchFile = vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('resource') }));
  sandbox = createSandbox({ workRoot: path.join(root, 'work'), pathRoot: path.join(root, 'vm'), bridgeSocket: path.join(root, 'bridge.sock'), fetchImpl: fetchFile });
  const started = await sandbox.handle({ action: 'start', runId, plain: true, cwd: '/project', argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'], files: [] });
  expect(started.ok).toBe(true);
  await vi.waitFor(async () => expect((await sandbox.handle({ action: 'status' })).state).toBe('running'));
});
afterEach(async () => { await sandbox?.close(); fs.rmSync(root, { recursive: true, force: true }); });
const deliver = (file, n = 1) => sandbox.handle({ action: 'files', resource: true, runId, n, files: [file] });

it('refuses a target outside this run’s protected scratch root before downloading', async () => {
  const target = '/project/source.txt';
  expect(await deliver({ path: target, url: 'https://storage.invalid/file' })).toMatchObject({ ok: false, consumed: true });
  expect(fetchFile).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(root, 'vm', target))).toBe(false);
});

it('refuses directory and file symlinks without altering their targets', async () => {
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'kept'), 'unchanged');
  const directory = `${prefix}/${'a'.repeat(64)}`; const mapped = path.join(root, 'vm', directory);
  fs.mkdirSync(path.dirname(mapped), { recursive: true }); fs.symlinkSync(outside, mapped);
  expect(await deliver({ path: `${directory}/file`, url: 'https://storage.invalid/file' })).toMatchObject({ ok: false, consumed: true });
  fs.unlinkSync(mapped); fs.mkdirSync(mapped); fs.symlinkSync(path.join(outside, 'kept'), path.join(mapped, 'file'));
  expect(await deliver({ path: `${directory}/file`, url: 'https://storage.invalid/file' }, 2)).toMatchObject({ ok: false, consumed: true });
  expect(fs.readFileSync(path.join(outside, 'kept'), 'utf8')).toBe('unchanged');
});

it('consumes a failed download and accepts the next input without stopping the agent', async () => {
  const target = `${prefix}/${'b'.repeat(64)}/file`;
  fetchFile.mockResolvedValueOnce({ ok: false, status: 404 });
  expect(await deliver({ path: target, url: 'https://storage.invalid/missing' })).toMatchObject({ ok: false, consumed: true });
  expect(await deliver({ path: target, url: 'https://storage.invalid/missing' })).toMatchObject({ ok: false, consumed: true, dup: true });
  expect(fs.existsSync(path.join(root, 'vm', target))).toBe(false);
  expect((await sandbox.handle({ action: 'status' })).state).toBe('running');
  expect(await deliver({ path: target, url: 'https://storage.invalid/good' }, 2)).toMatchObject({ ok: true });
  expect(fs.readFileSync(path.join(root, 'vm', target), 'utf8')).toBe('resource');
  expect(await deliver({ path: target, url: 'https://storage.invalid/good' }, 2)).toMatchObject({ ok: true, dup: true });
});
