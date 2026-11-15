// THE TURN AFTER A KEY IS SAVED RUNS IN THE CLOUD, ON EVERY THREAD WAITING ON IT.
//
// A key pasted on a thread is kept in the cloud and given only to cloud runs.
// With the cloud set to take what this computer has no room for, the reply
// that saving sends would start here whenever there was room, without the
// key it had just been given. And in round one of the power test, two threads
// asked for the same Supabase key; saving it on one left the other sitting on
// its ask. Measured on `cloudKey` and `_whereToRun`: saving names every open
// thread whose asks are now all saved, and each one's next turn goes to the
// cloud when the cloud can take it, once.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { KEY_ASK } from '../shared/cloud-keys.mts';

let tmp; let sup; let puts; let items;
const asking = (id, ...names) => ({ id, product: 'team', status: 'open', result: names.map((n) => `${KEY_ASK} ${n} the key`).join('\n'), wrote: { result: { ts: 10 } } });
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'key-turn-')));
  items = [asking('w-1', 'SUPABASE_ACCESS_TOKEN'), asking('w-2', 'SUPABASE_ACCESS_TOKEN'), asking('w-3', 'VERCEL_TOKEN'), { id: 'w-4', product: 'team', status: 'open', result: 'Done.' }];
  sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], cloudRuns: 'full' }, { listItems: () => items, listProducts: () => [], isDue: () => true }, tmp);
  sup._saveState = () => {};
  puts = [];
  sup._cloudClients = async () => ({ storage: { async put(k) { puts.push(k); }, async del() {} } });
  sup._mayRunInCloud = () => true;
  sup._cloudSlotFor = () => true;
  sup._localSlotFor = () => true;
});
afterEach(() => { sup?.stop?.(); fs.rmSync(tmp, { recursive: true, force: true }); });

const at = (id) => ({ item: { id, product: 'team' }, product: { slug: 'team' }, cwd: null, engine: 'claude' });

describe('a saved key', () => {
  it('frees every thread waiting on it, and sends each one\'s next turn to the cloud, only the next', async () => {
    expect(sup._whereToRun(at('w-1'))).toBe('local');
    const out = await sup.cloudKey('save', 'SUPABASE_ACCESS_TOKEN', 'sbp_0123456789abcdef');
    expect(puts).toHaveLength(1);
    expect(out.freed).toEqual([
      { product: 'team', id: 'w-1', answer: 'I saved the key. Carry on.' },
      { product: 'team', id: 'w-2', answer: 'I saved the key. Carry on.' },
    ]);
    expect(out.keys.map((k) => k.name)).toEqual(['SUPABASE_ACCESS_TOKEN']);
    expect(sup._whereToRun(at('w-3'))).toBe('local');
    expect(sup._whereToRun(at('w-4'))).toBe('local');
    expect(sup._whereToRun(at('w-1'))).toBe('cloud');
    expect(sup._whereToRun(at('w-2'))).toBe('cloud');
    expect(sup._whereToRun(at('w-1'))).toBe('local');
  });

  it('leaves a freed thread here when the cloud cannot take it', async () => {
    sup._cloudSlotFor = () => false;
    await sup.cloudKey('save', 'SUPABASE_ACCESS_TOKEN', 'sbp_0123456789abcdef');
    expect(sup._whereToRun(at('w-1'))).toBe('local');
  });

  // Round two: with the cloud off, saving sent a thread on to run here, without the key.
  it('frees nothing while the cloud is off, and keeps the key for when it is on', async () => {
    sup.config.cloudRuns = false;
    const out = await sup.cloudKey('save', 'SUPABASE_ACCESS_TOKEN', 'sbp_0123456789abcdef');
    expect(out.freed).toEqual([]);
    expect(out.keys.map((k) => k.name)).toEqual(['SUPABASE_ACCESS_TOKEN']);
  });

  it('frees nothing when it is removed', async () => {
    await sup.cloudKey('save', 'OTHER_TOKEN', 'other-value-123');
    const out = await sup.cloudKey('remove', 'OTHER_TOKEN');
    expect(out.freed).toEqual([]);
    expect(sup._whereToRun(at('w-1'))).toBe('local');
  });

  it('frees nothing when the cloud would not keep it', async () => {
    await expect(sup.cloudKey('save', 'ANTHROPIC_API_KEY', 'sk-ant-xxxxxxxx')).rejects.toThrow();
    expect(sup._whereToRun(at('w-1'))).toBe('local');
  });
});
