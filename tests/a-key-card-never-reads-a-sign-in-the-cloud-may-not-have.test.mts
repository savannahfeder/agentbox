// A KEY CARD NEVER READS A SIGN-IN THE CLOUD MAY NOT HAVE.
//
// What was wrong (2026-11-13, daily security review): a cloud run asking this
// computer for a key named the key and where it was, and only the name was
// checked. An agent steered by a page it read could ask for POSTHOG_READ_KEY
// "from" file ~/.codex/auth.json, under a card titled in its own words. One
// press saved the person's whole Codex login for every later cloud run. A file
// card already refused that file whoever asked (shared/cloud-sent-files.mts).
// Measured with a stand-in home holding a 4.6 KB auth.json: read and saved.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKeyAsks } from '../main/cloud/key-asks.mts';
import { readKeyFrom } from '../main/cloud/key-source.mts';
import { keySource, keySourceFromWords } from '../shared/cloud-key-sources.mts';
import { needsIn } from '../shared/cloud-needs.mts';
import { approvalPublicKey, listPending, spoolDir } from '../main/approvals.mts';

let tmp: string; let home: string; let store: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'key-sign-ins-')));
  home = path.join(tmp, 'home');
  store = path.join(tmp, 'store');
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(home, 'app'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex', 'auth.json'), JSON.stringify({ tokens: { refresh_token: 'stand-in-refresh-token' } }));
  fs.writeFileSync(path.join(home, 'app', '.env'), 'POSTHOG_KEY=phx_stand-in\n');
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const security = (items: Record<string, string>) => vi.fn(async (_cmd: string, args: string[]) => {
  const service = args[args.indexOf('-s') + 1];
  if (!(service in items)) throw Object.assign(new Error('not found'), { code: 44 });
  return `${items[service]}\n`;
});

describe('a place that holds a sign-in is not a place a key comes from', () => {
  it.each([
    ['file', '~/.codex/auth.json'],
    ['file', '~/.claude/.credentials.json'],
    ['file', '~/.claude.json'],
    ['file', '/Users/x/.ssh/id_ed25519'],
    ['file', '~/.aws/credentials'],
    ['file', '~/.config/gh/hosts.yml'],
    ['keychain', 'Claude Code-credentials'],
    ['keychain', 'Claude Code-credentials-1a2b3c4d'],
    ['keychain', 'Claude Code'],
    ['keychain', 'Codex Auth'],
    ['keychain', 'Agentbox Safe Storage'],
    ['keychain', 'Chrome Safe Storage'],
  ])('%s %s is refused, typed by the agent or in an ask line', (place, from) => {
    expect(keySource({ place, from })).toBeNull();
    expect(keySourceFromWords(`${place} ${from}`)).toBeNull();
  });

  it.each([
    ['file', '~/app/.env', 'POSTHOG_KEY'],
    ['file', '~/projects/claude-notes/.env', 'KEY'],
    ['file', '~/codex-tools/key.txt', undefined],
    ['keychain', 'posthog-read-key', undefined],
    ['keychain', 'OPENAI_API_KEY', undefined],
    ['keychain', 'claude-api-notes', undefined],
    ['shell', 'POSTHOG_KEY', undefined],
  ])('%s %s is still a place a key comes from', (place, from, entry) => {
    expect(keySource({ place, from, entry })).not.toBeNull();
  });

  it('an ask line naming a sign-in offers no press that reads it', () => {
    const [need] = needsIn('AGENTBOX-NEEDS: key POSTHOG_READ_KEY | the PostHog read key | file ~/.codex/auth.json');
    expect(need).toMatchObject({ kind: 'key', name: 'POSTHOG_READ_KEY' });
    expect(need && 'from' in need ? need.from : null).toBeNull();
  });

  it('a link under home that leads into a sign-in folder is not read', async () => {
    fs.symlinkSync(path.join(home, '.codex', 'auth.json'), path.join(home, 'app', 'posthog.key'));
    const read = await readKeyFrom({ place: 'file', from: '~/app/posthog.key' }, { home });
    expect('value' in read).toBe(false);
    expect(await readKeyFrom({ place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' }, { home })).toEqual({ value: 'phx_stand-in' });
  });

  it('a Keychain item that holds a sign-in is never read, even when handed in whole', async () => {
    const run = security({ 'Claude Code-credentials': '{"claudeAiOauth":{}}' });
    const read = await readKeyFrom({ place: 'keychain', from: 'Claude Code-credentials' }, { home, platform: 'darwin', run });
    expect('value' in read).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('a cloud run asking for one is told no, and no card comes up', async () => {
    const ask = createKeyAsks({
      spool: spoolDir(store), publicKey: approvalPublicKey(), item: 'w-report', product: 'agentbox-team',
      home, storage: { async put() {}, async del() {}, async getUrl(k: string) { return k; } }, platform: 'darwin', run: security({}),
      carried: [], capable: () => true, deliver: async () => true, runKeysAt: 'run-1', waitMs: 500, pollMs: 20,
    });
    const said = await ask({ name: 'POSTHOG_READ_KEY', what: 'the PostHog read key', place: 'file', from: '~/.codex/auth.json' });
    expect(said.status).toBe('denied');
    expect(said.message).toMatch(/sign-in/i);
    expect(listPending(store)).toEqual([]);
  });
});
