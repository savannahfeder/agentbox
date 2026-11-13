// A KEY CARD ANSWERED IN WORDS REACHES THE RUN.
//
// What was missing (w-c07d8993c4, 2026-11-10): the card a cloud run puts up
// to ask this computer for a key offered only Allow and Deny. "Also should be
// a way to respond to it, not just approve or deny": the person may want the
// read-only key instead, or know the key is somewhere else. Their words go
// back as the signed answer's note, and the run reads them instead of a no.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKeyAsks } from '../main/cloud/key-asks.mts';
import { answer, approvalPublicKey, listPending, spoolDir } from '../main/approvals.mts';
import { cloudKeyNames } from '../main/cloud/keys.mts';

let tmp: string; let home: string; let store: string;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'key-words-')));
  home = path.join(tmp, 'home');
  store = path.join(tmp, 'store');
  fs.mkdirSync(home, { recursive: true });
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const storage = { async put() {}, async del() {}, async getUrl(k: string) { return k; } };
const run = vi.fn(async (_cmd: string, args: string[]) => (args.includes('-w') ? 'phx_secret_value_0000\n' : 'keychain: "login"\n'));
const POSTHOG = { name: 'POSTHOG_PERSONAL_KEY', what: 'the PostHog personal API key', place: 'keychain', from: 'posthog-read-key' };

function asking() {
  return createKeyAsks({
    spool: spoolDir(store), publicKey: approvalPublicKey(), item: 'w-report', product: 'agentbox-team',
    home, storage, platform: 'darwin', run,
    carried: [], capable: () => true, deliver: async () => true,
    runKeysAt: 'keys', waitMs: 2_000, pollMs: 20,
  });
}

async function card() {
  await vi.waitFor(() => expect(listPending(store)).toHaveLength(1));
  return listPending(store)[0];
}

describe('a key card answered in words', () => {
  it('hands the person\'s words to the run, and reads no key', async () => {
    run.mockClear();
    const ask = asking();
    const pending = ask(POSTHOG);
    const c = await card();
    expect(answer(store, c.id, false, 'Use the read-only one, posthog-readonly in the Keychain')).toBe(true);
    const out = await pending;
    expect(out.status).toBe('replied');
    expect(out.message).toContain('Use the read-only one, posthog-readonly in the Keychain');
    expect(run.mock.calls.some(([, args]) => (args as string[]).includes('-w'))).toBe(false);
    expect(cloudKeyNames({ home })).toEqual([]);
  });

  it('lets the run ask again in the same run after words, unlike after a no', async () => {
    const ask = asking();
    const first = ask(POSTHOG);
    expect(answer(store, (await card()).id, false, 'Ask for posthog-readonly instead')).toBe(true);
    expect((await first).status).toBe('replied');
    const second = ask({ ...POSTHOG, from: 'posthog-readonly' });
    expect(answer(store, (await card()).id, false)).toBe(true);
    expect((await second).status).toBe('denied');
    expect((await ask(POSTHOG)).status).toBe('denied');
  });

  it('is still a no when the note is empty', async () => {
    const ask = asking();
    const pending = ask(POSTHOG);
    expect(answer(store, (await card()).id, false, '   ')).toBe(true);
    expect((await pending).status).toBe('denied');
  });
});
