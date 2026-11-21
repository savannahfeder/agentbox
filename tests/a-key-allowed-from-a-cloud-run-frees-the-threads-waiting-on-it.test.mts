// A KEY ALLOWED FROM A CLOUD RUN FREES THE THREADS WAITING ON IT.
//
// What broke (w-c07d8993c4, 2026-11-09 power test): two PostHog threads had
// ended their turns asking for the PostHog key. The tester then allowed the
// key on a third thread's "asks for a key from this computer" card. The key
// was saved for every cloud thread, but the two waiting threads still said "I
// need the PostHog personal API key to finish", with a "PostHog saved" card
// and nothing to carry them on. A key pasted on a thread's card frees them
// (Supervisor.cloudKey); a key allowed on a run's card is saved by that run's
// own process (main/cloud/key-asks.mts), so the app never heard of it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { saveCloudKey } from '../main/cloud/keys.mts';
import { KEY_ASK } from '../shared/cloud-keys.mts';

let tmp: string; let sup: Supervisor; let items: Record<string, unknown>[]; let answered: { id: string; answer: string }[];
const asking = (id: string, ...names: string[]) => ({ id, product: 'team', status: 'open', result: names.map((n) => `${KEY_ASK} ${n} the key`).join('\n'), wrote: { result: { ts: 10 } } });
const storage = { async put() {}, async del() {}, async getUrl(k: string) { return k; } };
const savedByARun = (name: string) => saveCloudKey(name, 'phx_0123456789abcdef', { storage, home: tmp, label: null });

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'key-elsewhere-')));
  items = [asking('w-1', 'POSTHOG_PERSONAL_KEY'), asking('w-2', 'POSTHOG_PERSONAL_KEY'), asking('w-3', 'RESEND_API_KEY'), { id: 'w-4', product: 'team', status: 'open', result: 'Done.' }];
  answered = [];
  const store = {
    listItems: () => items, listProducts: () => [], isDue: () => true,
    answerItem: (_product: string, id: string, { answer }: { answer: string }) => { answered.push({ id, answer }); return { id }; },
  };
  sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], cloudRuns: 'full' }, store, tmp);
  sup._saveState = () => {};
  sup._cloudClients = async () => ({ storage });
});
afterEach(() => { sup?.stop?.(); fs.rmSync(tmp, { recursive: true, force: true }); });

describe('a key a cloud run saved after a yes', () => {
  it('carries on every thread that was waiting only on it, once', async () => {
    await sup._freeForKeysSavedByRuns();
    await savedByARun('POSTHOG_PERSONAL_KEY');
    await sup._freeForKeysSavedByRuns();
    expect(answered).toEqual([{ id: 'w-1', answer: 'I saved the key. Carry on.' }, { id: 'w-2', answer: 'I saved the key. Carry on.' }]);
    await sup._freeForKeysSavedByRuns();
    expect(answered).toHaveLength(2);
  });

  it('does not answer threads a second time when the key was saved here', async () => {
    await sup._freeForKeysSavedByRuns();
    const out = await sup.cloudKey('save', 'POSTHOG_PERSONAL_KEY', 'phx_0123456789abcdef');
    expect(out.freed.map((t) => t.id)).toEqual(['w-1', 'w-2']);
    await sup._freeForKeysSavedByRuns();
    expect(answered).toEqual([]);
  });

  it('frees nothing while the cloud is off', async () => {
    sup.config.cloudRuns = false;
    await sup._freeForKeysSavedByRuns();
    await savedByARun('POSTHOG_PERSONAL_KEY');
    await sup._freeForKeysSavedByRuns();
    expect(answered).toEqual([]);
  });

  it('frees nothing for keys that were already saved when the app started', async () => {
    await savedByARun('POSTHOG_PERSONAL_KEY');
    await sup._freeForKeysSavedByRuns();
    expect(answered).toEqual([]);
  });
});
