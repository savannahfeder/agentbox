// A CLOUD RUN GETS A KEY FROM THIS COMPUTER ONLY AFTER A YES.
//
// What was wrong (2026-11-08): a cloud run of the daily report needed the
// PostHog read key, and the agent knew it was in the Keychain as
// "posthog-read-key". All it could do was end its turn and ask the person to
// find the key and paste it. "I find it a little annoying to have to set
// everything up and provide the API keys whenever I enter the cloud."
//
// Now the run asks this computer by name and place (request_cloud_key). The
// person gets the app's own Allow/Deny card, and only their signed yes reads
// the key, saves it for every cloud run and hands it to the one asking.
// Measured here with the app's real spool, its real signing of an answer, a
// stand-in bucket, and stand-ins for `security` and the login shell.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKeyAsks, KEY_CARD } from '../main/cloud/key-asks.mts';
import { readKeyFrom, keyIsThere } from '../main/cloud/key-source.mts';
import { keySource, keySourceFromWords, keySourceWords } from '../shared/cloud-key-sources.mts';
import { answer, approvalPublicKey, listPending, spoolDir } from '../main/approvals.mts';
import { cloudKeyNames, keysCarried, saveCloudKey } from '../main/cloud/keys.mts';
import { Supervisor } from '../main/supervisor.mts';

const SECRET = 'phx_stand-in-key-for-this-test-only-0000';
let tmp; let home; let store; let objects;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'key-asks-')));
  home = path.join(tmp, 'home');
  store = path.join(tmp, 'store');
  fs.mkdirSync(home, { recursive: true });
  objects = new Map();
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const storage = {
  async put(k, body) { objects.set(k, Buffer.from(body)); },
  async del(k) { objects.delete(k); },
  async getUrl(k) { return `https://bucket.invalid/${k}`; },
};

// `security`, as macOS answers it: 44 for no such item.
function keychain(items) {
  return vi.fn(async (cmd, args) => {
    if (cmd !== 'security' || args[0] !== 'find-generic-password') throw new Error(`ran ${cmd}`);
    const service = args[args.indexOf('-s') + 1];
    if (!(service in items)) throw Object.assign(new Error('The specified item could not be found in the keychain.'), { code: 44 });
    return args.includes('-w') ? `${items[service]}\n` : 'keychain: "/Users/x/Library/Keychains/login.keychain-db"\n';
  });
}

function asks(over = {}) {
  const delivered = [];
  const ask = createKeyAsks({
    spool: spoolDir(store), publicKey: approvalPublicKey(), item: 'w-report', product: 'agentbox-team',
    home, storage, platform: 'darwin', run: keychain({ 'posthog-read-key': SECRET }),
    carried: [], capable: () => true,
    deliver: async (key) => { delivered.push(key); return true; },
    runKeysAt: 'run-1', waitMs: 2_000, pollMs: 20,
    ...over,
  });
  return { ask, delivered };
}

// The person, at the app: the card on screen, then a press of Allow or Deny.
async function press(allow, { within = 1_500 } = {}) {
  const until = Date.now() + within;
  for (;;) {
    const [card] = listPending(store);
    if (card) { expect(answer(store, card.id, allow)).toBe(true); return card; }
    if (Date.now() > until) throw new Error('no card came up');
    await new Promise((r) => setTimeout(r, 10));
  }
}

const POSTHOG = { name: 'POSTHOG_PERSONAL_KEY', what: 'the PostHog personal API key the daily report reads', place: 'keychain', from: 'posthog-read-key' };

describe('where on this computer a key can come from', () => {
  it('takes a Keychain item, a file under the home folder, and a variable in the shell', () => {
    expect(keySource({ place: 'keychain', from: ' posthog-read-key ' })).toEqual({ place: 'keychain', from: 'posthog-read-key' });
    expect(keySource({ place: 'file', from: '~/.config/gilded/openai.key' })).toEqual({ place: 'file', from: '~/.config/gilded/openai.key' });
    expect(keySource({ place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' })).toEqual({ place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' });
    expect(keySource({ place: 'shell', from: 'POSTHOG_KEY' })).toEqual({ place: 'shell', from: 'POSTHOG_KEY' });
  });

  it('refuses anything else, so a card never shows something it cannot read', () => {
    expect(keySource({ place: 'browser', from: 'x' })).toBeNull();
    expect(keySource({ place: 'keychain', from: '' })).toBeNull();
    expect(keySource({ place: 'keychain', from: 'a\nb' })).toBeNull();
    expect(keySource({ place: 'file', from: 'relative/key.txt' })).toBeNull();
    expect(keySource({ place: 'file', from: '~/app/.env', entry: 'not a name' })).toBeNull();
    expect(keySource({ place: 'shell', from: 'POSTHOG_KEY; rm -rf ~' })).toBeNull();
  });

  it('reads the same place back from the words on an ask line', () => {
    expect(keySourceFromWords('keychain posthog-read-key')).toEqual({ place: 'keychain', from: 'posthog-read-key' });
    expect(keySourceFromWords('Keychain: Supabase CLI')).toEqual({ place: 'keychain', from: 'Supabase CLI' });
    expect(keySourceFromWords('file ~/app/.env POSTHOG_KEY')).toEqual({ place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' });
    expect(keySourceFromWords('shell POSTHOG_KEY')).toEqual({ place: 'shell', from: 'POSTHOG_KEY' });
    expect(keySourceFromWords('from posthog.com/settings')).toBeNull();
    expect(keySourceFromWords('')).toBeNull();
  });

  it('says where it is in words a person reads', () => {
    expect(keySourceWords({ place: 'keychain', from: 'posthog-read-key' })).toBe('your Keychain, as posthog-read-key');
    expect(keySourceWords({ place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' })).toBe('POSTHOG_KEY in ~/app/.env');
    expect(keySourceWords({ place: 'file', from: '~/.config/k.key' })).toBe('~/.config/k.key');
    expect(keySourceWords({ place: 'shell', from: 'POSTHOG_KEY' })).toBe('POSTHOG_KEY in your shell');
  });
});

describe('reading a key from this computer', () => {
  it('reads a Keychain item with `security`, and says when there is none', async () => {
    const run = keychain({ 'posthog-read-key': SECRET });
    expect(await readKeyFrom({ place: 'keychain', from: 'posthog-read-key' }, { home, platform: 'darwin', run })).toEqual({ value: SECRET });
    expect(run).toHaveBeenCalledWith('security', ['find-generic-password', '-s', 'posthog-read-key', '-w'], expect.anything());
    expect(await readKeyFrom({ place: 'keychain', from: 'nope' }, { home, platform: 'darwin', run })).toMatchObject({ missing: true });
    expect(await readKeyFrom({ place: 'keychain', from: 'posthog-read-key' }, { home, platform: 'linux', run })).toMatchObject({ missing: false, error: expect.stringMatching(/Keychain/) });
  });

  it('checks a Keychain item is there without reading its value', async () => {
    const run = keychain({ 'posthog-read-key': SECRET });
    expect(await keyIsThere({ place: 'keychain', from: 'posthog-read-key' }, { home, platform: 'darwin', run })).toEqual({ ok: true });
    expect(run.mock.calls.every(([, args]) => !args.includes('-w'))).toBe(true);
    expect(await keyIsThere({ place: 'keychain', from: 'other' }, { home, platform: 'darwin', run })).toMatchObject({ ok: false, missing: true });
  });

  it('reads a whole key file, or one line of an .env file, under the home folder', async () => {
    fs.mkdirSync(path.join(home, 'app'));
    fs.writeFileSync(path.join(home, 'k.key'), `${SECRET}\n`);
    fs.writeFileSync(path.join(home, 'app', '.env'), `# keys\nOTHER=1\nexport POSTHOG_KEY="${SECRET}"\nTAIL='x' # note\nBARE=abc # comment\n`);
    expect(await readKeyFrom({ place: 'file', from: '~/k.key' }, { home })).toEqual({ value: SECRET });
    expect(await readKeyFrom({ place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' }, { home })).toEqual({ value: SECRET });
    expect(await readKeyFrom({ place: 'file', from: path.join(home, 'app', '.env'), entry: 'TAIL' }, { home })).toEqual({ value: 'x' });
    expect(await readKeyFrom({ place: 'file', from: '~/app/.env', entry: 'BARE' }, { home })).toEqual({ value: 'abc' });
    expect(await readKeyFrom({ place: 'file', from: '~/app/.env', entry: 'MISSING' }, { home })).toMatchObject({ missing: true });
    expect(await readKeyFrom({ place: 'file', from: '~/none.key' }, { home })).toMatchObject({ missing: true });
  });

  it('never reads a file outside the home folder, a link out of it, or something too big to be a key', async () => {
    const outside = path.join(tmp, 'outside.key');
    fs.writeFileSync(outside, SECRET);
    fs.symlinkSync(outside, path.join(home, 'link.key'));
    fs.writeFileSync(path.join(home, 'big.key'), 'x'.repeat(70_000));
    expect(await readKeyFrom({ place: 'file', from: outside }, { home })).toMatchObject({ error: expect.stringMatching(/home folder/) });
    expect(await readKeyFrom({ place: 'file', from: '~/link.key' }, { home })).toMatchObject({ error: expect.stringMatching(/home folder/) });
    expect(await readKeyFrom({ place: 'file', from: '~/big.key' }, { home })).toMatchObject({ error: expect.stringMatching(/too big/) });
  });

  it('asks the login shell for a variable, by a name it has checked', async () => {
    const shell = vi.fn(async (sh, [flags, command]) => (command === 'printenv POSTHOG_KEY' ? `${SECRET}\n` : Promise.reject(Object.assign(new Error('exit 1'), { status: 1 }))));
    expect(await readKeyFrom({ place: 'shell', from: 'POSTHOG_KEY' }, { home, shell, env: { SHELL: '/bin/zsh' } })).toEqual({ value: SECRET });
    expect(await readKeyFrom({ place: 'shell', from: 'NOT_SET' }, { home, shell, env: { SHELL: '/bin/zsh' } })).toMatchObject({ missing: true });
  });
});

describe('a cloud run asking for a key', () => {
  it('puts a card in front of the person and waits: the key is read only after Allow', async () => {
    const run = keychain({ 'posthog-read-key': SECRET });
    const { ask, delivered } = asks({ run, waitMs: 5_000 });
    const pending = ask(POSTHOG);
    const card = await press(true);
    expect(card).toMatchObject({ item: 'w-report', product: 'agentbox-team', tool: KEY_CARD, input: { name: 'POSTHOG_PERSONAL_KEY', what: POSTHOG.what, place: 'keychain', from: 'posthog-read-key' } });
    const said = await pending;
    expect(said).toMatchObject({ status: 'saved', path: expect.stringContaining('POSTHOG_PERSONAL_KEY') });
    expect(said.message).toMatch(/every cloud/);
    expect(JSON.stringify(said)).not.toContain(SECRET);
    // Saved like a pasted key, for every later run, and handed to this one.
    expect(cloudKeyNames({ home }).map((k) => k.name)).toEqual(['POSTHOG_PERSONAL_KEY']);
    expect(cloudKeyNames({ home })[0].label).toBe('PostHog personal API key the daily report reads');
    const [saved] = keysCarried({ home });
    expect(JSON.parse(objects.get(saved.key))).toEqual({ name: 'POSTHOG_PERSONAL_KEY', value: SECRET });
    expect(delivered).toEqual([{ name: 'POSTHOG_PERSONAL_KEY', url: `https://bucket.invalid/${saved.key}` }]);
    // The value was read once, after the yes.
    expect(run.mock.calls.filter(([, args]) => args.includes('-w'))).toHaveLength(1);
    expect(listPending(store)).toEqual([]);
  });

  it('reads nothing and saves nothing on Deny, and tells the agent not to ask again', async () => {
    const run = keychain({ 'posthog-read-key': SECRET });
    const { ask, delivered } = asks({ run, waitMs: 5_000 });
    const pending = ask(POSTHOG);
    await press(false);
    const said = await pending;
    expect(said.status).toBe('denied');
    expect(said.message).toMatch(/not ask/i);
    expect(run.mock.calls.some(([, args]) => args.includes('-w'))).toBe(false);
    expect(cloudKeyNames({ home })).toEqual([]);
    expect(delivered).toEqual([]);
    // Asked again in the same run, it is not put in front of them twice.
    expect((await ask(POSTHOG)).status).toBe('denied');
    expect(listPending(store)).toEqual([]);
  });

  it('gives up after its wait, takes the card down, and points the agent at the ask line', async () => {
    const { ask } = asks({ waitMs: 200 });
    const said = await ask(POSTHOG);
    expect(said.status).toBe('no_answer');
    expect(said.message).toContain('AGENTBOX-NEEDS: key POSTHOG_PERSONAL_KEY | the PostHog personal API key the daily report reads | keychain posthog-read-key');
    expect(listPending(store)).toEqual([]);
    expect(cloudKeyNames({ home })).toEqual([]);
  });

  it('does not take an answer file the app did not sign as a yes', async () => {
    const { ask } = asks({ waitMs: 600 });
    const pending = ask(POSTHOG);
    let card;
    await vi.waitFor(() => { [card] = listPending(store); expect(card).toBeTruthy(); });
    fs.writeFileSync(path.join(spoolDir(store), `${card.id}.answer.json`), JSON.stringify({ allow: true, at: Date.now(), card: 'x', sig: 'AAAA' }));
    expect((await pending).status).toBe('no_answer');
    expect(cloudKeyNames({ home })).toEqual([]);
  });

  it('does not ask about a key that is not where the agent said', async () => {
    const { ask } = asks();
    const said = await ask({ ...POSTHOG, from: 'posthog-key-typo' });
    expect(said.status).toBe('not_found');
    expect(said.message).toMatch(/posthog-key-typo/);
    expect(listPending(store)).toEqual([]);
  });

  it('refuses a name a key can never have, before any card', async () => {
    const { ask } = asks();
    expect((await ask({ ...POSTHOG, name: 'ANTHROPIC_API_KEY' })).status).toBe('denied');
    expect((await ask({ ...POSTHOG, name: 'PATH' })).status).toBe('denied');
    expect((await ask({ ...POSTHOG, place: 'browser' })).status).toBe('denied');
    expect(listPending(store)).toEqual([]);
  });

  it('answers at once for a key the run already has, and hands over one saved since it started without asking', async () => {
    const carried = asks({ carried: ['POSTHOG_PERSONAL_KEY'] });
    expect((await carried.ask(POSTHOG)).status).toBe('already');
    await saveCloudKey('POSTHOG_PERSONAL_KEY', SECRET, { storage, home });
    const later = asks();
    const said = await later.ask(POSTHOG);
    expect(said.status).toBe('saved');
    expect(later.delivered).toHaveLength(1);
    expect(listPending(store)).toEqual([]);
  });

  it('saves the key for the next run when this cloud machine cannot take one mid-run', async () => {
    const { ask, delivered } = asks({ capable: () => false, waitMs: 5_000 });
    const pending = ask(POSTHOG);
    await press(true);
    const said = await pending;
    expect(said.status).toBe('saved');
    expect(said.path).toBeUndefined();
    expect(said.message).toMatch(/next/);
    expect(delivered).toEqual([]);
    expect(cloudKeyNames({ home }).map((k) => k.name)).toEqual(['POSTHOG_PERSONAL_KEY']);
  });

  it('is handed where to put its card by the app that starts the run', () => {
    const sup = new Supervisor({ storeRoot: store, home, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, store);
    sup._cloudAccountEnv = () => ({});
    const env = sup._cloudRelayEnv({ ZERO_ITEM: 'w-report' });
    expect(env.ZERO_APPROVALS_DIR).toBe(spoolDir(store));
    expect(env.ZERO_APPROVALS_PUBKEY).toBe(approvalPublicKey());
  });

  it('is a tool only a cloud run is offered', async () => {
    const { appHome } = await import('../main/store/home.mts');
    process.env.STORE_ACCOUNT_ID = 'acct-keys';
    fs.mkdirSync(path.join(appHome(), 'accounts', 'acct-keys'), { recursive: true });
    const { buildTools } = await import('../mcp/tools.mts');
    const names = (o) => buildTools({ holder: 'test', ...o }).tools.map((t) => t.name);
    expect(names({ requestCloudKey: async () => ({}) })).toContain('request_cloud_key');
    expect(names({})).not.toContain('request_cloud_key');
  });

  it('stops waiting when the run ends', async () => {
    const { ask } = asks({ waitMs: 60_000 });
    const pending = ask(POSTHOG);
    await vi.waitFor(() => expect(listPending(store)).toHaveLength(1));
    ask.close();
    expect((await pending).status).toBe('unavailable');
    expect(listPending(store)).toEqual([]);
  });
});
