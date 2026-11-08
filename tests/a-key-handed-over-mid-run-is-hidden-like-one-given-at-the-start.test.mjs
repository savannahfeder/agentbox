// A KEY HANDED OVER MID-RUN IS HIDDEN LIKE ONE GIVEN AT THE START.
//
// A key the person allows while a cloud run waits (request_cloud_key) reaches
// a machine that is already running, so it cannot be in the agent's
// environment. The machine puts it in a file only the agent can read, and adds
// its value to what is cut out of everything that comes home, as it does for
// keys placed at the start. Measured with the real sandbox server, a stand-in
// bucket and an agent that prints the key once the file appears.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createSandbox, REDACTED } from '../cloud/sandbox/server.mjs';

const SECRET = 'phx_stand-in-key-for-this-test-only-0000';
const runId = 'key-run';
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const keyPath = (name) => `/tmp/agentbox-resources/${hash(runId)}/keys/${name}`;
let root; let sandbox; let bucket;

beforeEach(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'live-key-')));
  bucket = new Map([['k1', { name: 'POSTHOG_PERSONAL_KEY', value: SECRET }], ['k2', { name: 'OTHER_KEY', value: SECRET }]]);
  const fetchImpl = vi.fn(async (url) => {
    const body = bucket.get(String(url).split('/').pop());
    return body ? { ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(body)) } : { ok: false, status: 404 };
  });
  sandbox = createSandbox({ workRoot: path.join(root, 'work'), pathRoot: path.join(root, 'vm'), bridgeSocket: path.join(root, 'bridge.sock'), fetchImpl });
  const file = path.join(root, 'vm', keyPath('POSTHOG_PERSONAL_KEY'));
  const agent = `const fs=require('fs');const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(file)})){console.log('key='+fs.readFileSync(${JSON.stringify(file)},'utf8'));clearInterval(t);}},20);setTimeout(()=>process.exit(0),4000);`;
  const started = await sandbox.handle({ action: 'start', runId, plain: true, cwd: '/project', argv: [process.execPath, '-e', agent], files: [] });
  expect(started.ok).toBe(true);
  expect(started.caps).toContain('live-keys');
  await vi.waitFor(async () => expect((await sandbox.handle({ action: 'status' })).state).toBe('running'));
});
afterEach(async () => { await sandbox?.close(); fs.rmSync(root, { recursive: true, force: true }); });

const hand = (name, url, n = 1, at = keyPath(name)) => sandbox.handle({ action: 'files', resource: true, runId, n, files: [{ key: name, url, path: at }] });
async function printed() {
  const page = await sandbox.handle({ action: 'events', runId, since: 0 });
  return (page.events || []).filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString()).join('');
}

it('puts the key where the agent reads it, and never lets its value come home', async () => {
  expect(await hand('POSTHOG_PERSONAL_KEY', 'https://bucket.invalid/k1')).toMatchObject({ ok: true });
  const file = path.join(root, 'vm', keyPath('POSTHOG_PERSONAL_KEY'));
  expect(fs.readFileSync(file, 'utf8')).toBe(SECRET);
  expect(fs.statSync(file).mode & 0o077).toBe(0);
  let out = '';
  await vi.waitFor(async () => { out = await printed(); expect(out).toContain('key='); }, { timeout: 3000 });
  expect(out).toContain(`key=${REDACTED}`);
  expect(out).not.toContain(SECRET);
});

it('refuses a name a key can never have, a key that is not the one named, and a place it did not choose', async () => {
  bucket.set('k3', { name: 'CLAUDE_CODE_OAUTH_TOKEN', value: SECRET });
  expect(await hand('CLAUDE_CODE_OAUTH_TOKEN', 'https://bucket.invalid/k3')).toMatchObject({ ok: false, consumed: true });
  expect(await hand('POSTHOG_PERSONAL_KEY', 'https://bucket.invalid/k2', 2)).toMatchObject({ ok: false, consumed: true });
  expect(await hand('POSTHOG_PERSONAL_KEY', 'https://bucket.invalid/k1', 3, '/project/key')).toMatchObject({ ok: false, consumed: true });
  expect(fs.existsSync(path.join(root, 'vm', keyPath('POSTHOG_PERSONAL_KEY')))).toBe(false);
  expect(fs.existsSync(path.join(root, 'vm', '/project/key'))).toBe(false);
  expect((await sandbox.handle({ action: 'status' })).state).toBe('running');
});

it('replaces a key handed over again', async () => {
  expect(await hand('POSTHOG_PERSONAL_KEY', 'https://bucket.invalid/k1')).toMatchObject({ ok: true });
  bucket.set('k4', { name: 'POSTHOG_PERSONAL_KEY', value: 'phx_second-stand-in-value-1111' });
  expect(await hand('POSTHOG_PERSONAL_KEY', 'https://bucket.invalid/k4', 2)).toMatchObject({ ok: true });
  expect(fs.readFileSync(path.join(root, 'vm', keyPath('POSTHOG_PERSONAL_KEY')), 'utf8')).toBe('phx_second-stand-in-value-1111');
});
