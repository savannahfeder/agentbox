// A KEY SAVED ONCE REACHES EVERY CLOUD RUN.
//
// What broke (2026-11-03): a cloud thread that needed the Supabase sign-in to
// apply storage rules could only say it needed the computer, and stalled
// there; nothing asked for the key, and nothing kept one for the next thread.
// "We need a better solution for getting data like credentials and saving it
// to the cloud so it never needs to ask again for all agent threads."
//
// Measured by saving a key the way the thread's field does and starting a
// real sandbox run on it: the agent finds the variable, never prints its
// value home, and is told the name in its note.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { createSandbox, pickBaseEnv, REDACTED } from '../cloud/sandbox/server.mjs';
import { cloudRun, cloudNote, CLOUD_NOTE } from '../main/cloud/run.mts';
import { saveCloudKey, removeCloudKey, keysCarried, cloudKeyNames, cloudKeysPath, keyLabel } from '../main/cloud/keys.mjs';
import { keyNameRefused, keyObjectKey } from '../shared/cloud-keys.mjs';
import { NEED as KEY_ASK } from '../shared/cloud-needs.mjs';
import { TOKEN } from './fixtures/cloud/fake-vendor-cli.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
// Not a real token's shape (GitHub's push protection refused the 40-hex one).
const SECRET = 'sbp_stand-in-token-for-this-test-only-0000';

let tmp; let home; let objects; let s3; let s3Url; let sandbox; let bin;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-keys-')));
  home = path.join(tmp, 'home');
  objects = new Map();
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  // The agent: prints the variable it was given and the note it was told.
  bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "token=$SUPABASE_ACCESS_TOKEN short=$SHORT_ONE"\nfor a in "$@"; do case "$a" in *"${KEY_ASK}"*) echo "told about keys: $(printf '%s' "$a" | grep -o 'under these names: [A-Z_, ]*')";; esac; done\n`, { mode: 0o755 });
});

afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const storage = {
  async put(k, body) { objects.set(k, Buffer.from(body)); },
  async get(k) { throw new Error(`the Mac read ${k}`); },
  async del(k) { objects.delete(k); },
  async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
};

function makeSandbox() {
  sandbox = createSandbox({
    workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock'),
    baseEnv: { ...pickBaseEnv(process.env), PATH: `${bin}:${process.env.PATH}` },
    terminal: (line) => ['sh', '-c', line], whoIs: async () => null, uploadRetryMs: 10,
  });
}

function repo() {
  const mac = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(mac, { recursive: true });
  git(mac, 'init', '-q', '-b', 'main');
  git(mac, 'config', 'user.email', 'dev@example.com');
  git(mac, 'config', 'user.name', 'Dev');
  fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
  git(mac, 'add', '.');
  git(mac, 'commit', '-q', '-m', 'first');
  git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
  return mac;
}

async function runInTheCloud({ imageCaps = ['keys'], keys = keysCarried({ home }) } = {}) {
  makeSandbox();
  const mac = repo();
  const sent = [];
  const stdin = new PassThrough(); stdin.end();
  objects.set('logins/claude/L1.json', Buffer.from(JSON.stringify({ engine: 'claude', token: TOKEN })));
  const stdout = new PassThrough();
  let printed = '';
  stdout.on('data', (d) => { printed += d; });
  await cloudRun({
    argv: ['-p'], env: { ...process.env, ZERO_ITEM: 'w-1', CLAUDE_CONFIG_DIR: path.join(tmp, 'mac', 'claude-home') },
    cwd: mac, storage,
    transport: { invoke: (sid, p) => { sent.push(p); return sandbox.handle(p); }, async stop() {} },
    login: { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' }, keys, imageCaps,
    stdin, stdout, stderr: new PassThrough(), remoteCommand: 'claude',
    pollWaitMs: 50, resultsWaitMs: 5000, watchParent: false, homeDir: home,
  });
  return { start: sent.find((p) => p.action === 'start'), printed };
}

describe('saving a key on the Mac', () => {
  it('puts the value in the cloud and keeps only its name here', async () => {
    await saveCloudKey('SUPABASE_ACCESS_TOKEN', `  ${SECRET}\n`, { storage, home, now: 5 });
    const [carried] = keysCarried({ home });
    expect(carried.name).toBe('SUPABASE_ACCESS_TOKEN');
    expect(JSON.parse(objects.get(carried.key))).toEqual({ name: 'SUPABASE_ACCESS_TOKEN', value: SECRET });
    expect(fs.readFileSync(cloudKeysPath(home), 'utf8')).not.toContain(SECRET.slice(4, 20));
    expect(cloudKeyNames({ home })).toEqual([{ name: 'SUPABASE_ACCESS_TOKEN', savedAt: 5, label: null }]);
  });

  it('replaces a key saved again under the same name, and deletes the old one', async () => {
    await saveCloudKey('VERCEL_TOKEN', 'first-value-123', { storage, home });
    const [old] = keysCarried({ home });
    await saveCloudKey('VERCEL_TOKEN', 'second-value-456', { storage, home });
    const [now] = keysCarried({ home });
    expect(now.key).not.toBe(old.key);
    expect(objects.has(old.key)).toBe(false);
    expect(JSON.parse(objects.get(now.key)).value).toBe('second-value-456');
  });

  it('takes a removed key out of the cloud and out of every later run', async () => {
    await saveCloudKey('EXPO_TOKEN', 'expo-value-123', { storage, home });
    const [k] = keysCarried({ home });
    expect(await removeCloudKey('EXPO_TOKEN', { storage, home })).toBe(true);
    expect(objects.has(k.key)).toBe(false);
    expect(keysCarried({ home })).toEqual([]);
    expect(await removeCloudKey('EXPO_TOKEN', { storage, home })).toBe(false);
  });

  it('tries a delete the cloud refused again at the next change', async () => {
    await saveCloudKey('GH_TOKEN', 'gh-value-1234', { storage, home });
    const [old] = keysCarried({ home });
    const refusing = { ...storage, async del() { throw new Error('the cloud said 500'); } };
    await saveCloudKey('GH_TOKEN', 'gh-value-5678', { storage: refusing, home });
    expect(objects.has(old.key)).toBe(true);
    await saveCloudKey('OTHER_TOKEN', 'other-value-1', { storage, home });
    expect(objects.has(old.key)).toBe(false);
  });

  it.each([
    ['ANTHROPIC_API_KEY'], ['CLAUDE_CODE_OAUTH_TOKEN'], ['CODEX_HOME'], ['OPENAI_API_KEY'], ['AGENTBOX_BRIDGE_SOCK'],
    ['PATH'], ['HOME'], ['LD_PRELOAD'], ['NODE_OPTIONS'], ['supabase_token'], ['1TOKEN'], ['A'], ['MY-TOKEN'],
  ])('refuses to save a key named %s', async (name) => {
    expect(keyNameRefused(name)).toBeTruthy();
    await expect(saveCloudKey(name, 'some-value-123', { storage, home })).rejects.toThrow();
    expect(objects.size).toBe(0);
  });

  it.each([['SUPABASE_ACCESS_TOKEN'], ['AWS_ACCESS_KEY_ID'], ['OPENAI_ORG'], ['GH_TOKEN'], ['STRIPE_SECRET_KEY']])('takes a key named %s', (name) => {
    expect(keyNameRefused(name)).toBeNull();
  });

  // Round two: Settings listed STRIPE_SECRET_KEY and nothing a person would call it.
  it('keeps what the agent said the key is, in a few plain words, and keeps it when replaced without one', async () => {
    await saveCloudKey('STRIPE_SECRET_KEY', 'sk_test_0123456789abcdef', { storage, home, label: 'your Stripe secret key, from dashboard.stripe.com/apikeys' });
    expect(cloudKeyNames({ home })[0]).toMatchObject({ name: 'STRIPE_SECRET_KEY', label: 'Stripe secret key' });
    await saveCloudKey('STRIPE_SECRET_KEY', 'sk_test_9876543210fedcba', { storage, home });
    expect(cloudKeyNames({ home })[0].label).toBe('Stripe secret key');
    await saveCloudKey('PLAIN_TOKEN', 'plain-value-123', { storage, home });
    expect(cloudKeyNames({ home }).find((k) => k.name === 'PLAIN_TOKEN').label).toBeNull();
  });

  it.each([
    ['a Vercel token, from vercel.com/account/tokens', 'Vercel token'],
    ['your AWS access key ID, from the IAM console under Security credentials', 'AWS access key ID'],
    ['the Expo token (from expo.dev)', 'Expo token'],
    ['', null],
  ])('names "%s" as %s', (what, label) => {
    expect(keyLabel(what)).toBe(label);
  });

  it('refuses an empty paste', async () => {
    await expect(saveCloudKey('VERCEL_TOKEN', '   ', { storage, home })).rejects.toThrow(/Paste/);
    expect(objects.size).toBe(0);
  });
});

describe('a cloud run', () => {
  it('finds each saved key in its environment, never prints one home, and is told their names', async () => {
    await saveCloudKey('SUPABASE_ACCESS_TOKEN', SECRET, { storage, home });
    await saveCloudKey('SHORT_ONE', 'abc', { storage, home });
    const { start, printed } = await runInTheCloud();
    expect(start.keys.map((k) => k.name)).toEqual(['SHORT_ONE', 'SUPABASE_ACCESS_TOKEN']);
    expect(printed).toContain(`token=${REDACTED}`);
    expect(printed).not.toContain(SECRET);
    // Too short to hide without cutting every word that holds it.
    expect(printed).toContain('short=abc');
    expect(printed).toContain('told about keys: under these names: SHORT_ONE, SUPABASE_ACCESS_TOKEN');
  });

  it('is told it has none, and still how to ask, when none are saved', async () => {
    const { start, printed } = await runInTheCloud();
    expect(start.keys).toBeUndefined();
    expect(printed).toContain('token= ');
    expect(start.argv.join(' ')).toContain('They have saved no keys or sign-ins for cloud runs yet.');
  });

  it('carries no key, and is never told to ask for one, on an image that cannot place them', async () => {
    await saveCloudKey('SUPABASE_ACCESS_TOKEN', SECRET, { storage, home });
    const { start } = await runInTheCloud({ imageCaps: [] });
    expect(start.keys).toBeUndefined();
    expect(start.argv.join(' ')).not.toContain(KEY_ASK);
  });

  it('starts without a key it cannot fetch, or one whose object names another key', async () => {
    await saveCloudKey('SUPABASE_ACCESS_TOKEN', SECRET, { storage, home });
    await saveCloudKey('SHORT_ONE', 'abc', { storage, home });
    const [short, supa] = keysCarried({ home });
    objects.delete(supa.key);
    objects.set(short.key, Buffer.from(JSON.stringify({ name: 'PATH', value: '/nowhere' })));
    const { printed } = await runInTheCloud();
    expect(printed).toContain('token= short=');
  });

  it('is refused a key under a name it may not take', async () => {
    makeSandbox();
    const out = await sandbox.handle({ action: 'start', runId: 'r-x', cwd: tmp, branch: 'b', bundleUrl: 'x', argv: ['true'], keys: [{ name: 'ANTHROPIC_API_KEY', url: `${s3Url}/k` }] });
    expect(out).toMatchObject({ ok: false, message: expect.stringMatching(/keys/) });
  });
});

describe('the note a cloud run reads', () => {
  it('is unchanged for a run that cannot be given keys', () => {
    expect(CLOUD_NOTE).not.toContain(KEY_ASK);
    expect(cloudNote({ keys: null })).toBe(CLOUD_NOTE);
  });

  it('asks for a missing key on its marked line instead of handing the thread back for it', () => {
    const note = cloudNote({ keys: ['VERCEL_TOKEN'] });
    expect(note).toContain('under these names: VERCEL_TOKEN.');
    expect(note).toContain(`${KEY_ASK} key VARIABLE | what it is and where they get it`);
    expect(note).toContain(`${KEY_ASK} sign-in SERVICE | what it is for`);
    expect(note).toContain(`${KEY_ASK} file PATH | what it is for`);
    expect(note).toContain(`${KEY_ASK} code WHAT | what it is for`);
    expect(note).toContain('When the work itself cannot go ahead without something none of those can carry');
    // A file on their computer is asked for, not a reason to hand the thread back.
    expect(note).toContain('When the request needs such a file, ask for it with a file line');
    expect(note).not.toContain('that is work that cannot go ahead here');
    expect(note).not.toContain('cannot go ahead without a key,');
    expect(note).not.toContain('your AWS sign-in');
    expect(cloudNote({ plain: true, keys: [] })).toContain('They have saved no keys or sign-ins for cloud runs yet.');
  });
});

describe('the name rule', () => {
  it('is the same file on the Mac and in the cloud image', () => {
    const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
    expect(read('../cloud/sandbox/key-names.mjs')).toBe(read('../shared/cloud-key-names.mjs'));
    expect(read('../cloud/sandbox/Dockerfile')).toMatch(/COPY [^\n]*key-names\.mjs/);
    expect(read('../scripts/cloud-setup.mjs')).toMatch(/IMAGE_FILES = \[[^\]]*'key-names\.mjs'/);
  });

  it('puts a key where the bucket keeps it for good', () => {
    expect(keyObjectKey('abc-123-def')).toBe('logins/keys/abc-123-def.json');
  });
});
