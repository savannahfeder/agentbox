// A KEY ALLOWED ON ONE CARD ANSWERS EVERY RUN ASKING FOR IT.
//
// What broke (w-c07d8993c4, 2026-11-09 power test): two cloud threads asked
// this computer for the PostHog key at once, so two Allow/Deny cards came up.
// The tester allowed one; the key was saved for every cloud thread, but the
// other card stayed up, still asking for "the same keychain posthog-read-key",
// and its run kept waiting for an answer it no longer needed. Seen in the
// startup-engineer tester's diary and actions.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKeyAsks } from '../main/cloud/key-asks.mts';
import { answer, approvalPublicKey, listPending, spoolDir } from '../main/approvals.mts';

const SECRET = 'phx_stand-in-key-for-this-test-only-0000';
let tmp: string; let home: string; let store: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'key-twice-')));
  home = path.join(tmp, 'home');
  store = path.join(tmp, 'store');
  fs.mkdirSync(home, { recursive: true });
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const storage = {
  async put() {},
  async del() {},
  async getUrl(k: string) { return `https://bucket.invalid/${k}`; },
};
const run = vi.fn(async (_cmd: string, args: string[]) => (args.includes('-w') ? `${SECRET}\n` : 'keychain: "login"\n'));

function runAsking(item: string, waitMs = 3_000) {
  const delivered: { name: string }[] = [];
  const ask = createKeyAsks({
    spool: spoolDir(store), publicKey: approvalPublicKey(), item, product: 'agentbox-team',
    home, storage, platform: 'darwin', run,
    carried: [], capable: () => true,
    deliver: async (key) => { delivered.push(key); return true; },
    runKeysAt: `keys-${item}`, waitMs, pollMs: 20,
  });
  return { ask, delivered };
}

async function cards(n: number) {
  const until = Date.now() + 1_500;
  while (listPending(store).length < n) {
    if (Date.now() > until) throw new Error(`${n} cards never came up`);
    await new Promise((r) => setTimeout(r, 10));
  }
  return listPending(store);
}

const POSTHOG = { name: 'POSTHOG_PERSONAL_KEY', what: 'the PostHog personal API key', place: 'keychain', from: 'posthog-read-key' };

describe('two runs asking for the same key', () => {
  it('both get it when the person allows one card, and the other card goes', async () => {
    const a = runAsking('w-report');
    const b = runAsking('w-funnel');
    const first = a.ask(POSTHOG);
    const second = b.ask(POSTHOG);
    const [one] = await cards(2);
    const began = Date.now();
    expect(answer(store, one.id, true)).toBe(true);

    const answers = await Promise.all([first, second]);
    expect(answers.map((x) => x.status)).toEqual(['saved', 'saved']);
    expect(Date.now() - began).toBeLessThan(1_500);
    expect(a.delivered.length + b.delivered.length).toBe(2);
    expect(listPending(store)).toEqual([]);
  });

  it('leaves the other card up when the person says no to one', async () => {
    const a = runAsking('w-report');
    const b = runAsking('w-funnel', 600);
    const first = a.ask(POSTHOG);
    const second = b.ask(POSTHOG);
    const [one] = await cards(2);
    expect(answer(store, one.id, false)).toBe(true);
    const denied = await Promise.race([first, second]);
    expect(denied.status).toBe('denied');
    expect(listPending(store)).toHaveLength(1);
    expect(['denied', 'no_answer']).toContain((await Promise.all([first, second])).find((x) => x !== denied)?.status);
  });

  it('does not answer a card for a different key', async () => {
    const a = runAsking('w-report');
    const b = runAsking('w-mail', 600);
    const first = a.ask(POSTHOG);
    const second = b.ask({ name: 'RESEND_API_KEY', what: 'the Resend API key', place: 'keychain', from: 'resend-api-key' });
    await cards(2);
    const posthogCard = listPending(store).find((c) => (c.input as { name?: string }).name === 'POSTHOG_PERSONAL_KEY')!;
    expect(answer(store, posthogCard.id, true)).toBe(true);
    expect((await first).status).toBe('saved');
    expect((await second).status).toBe('no_answer');
  });
});
