// A THREAD WAITING FOR THE COMPUTER READS QUEUED ON THE WEB APP.
//
// What broke (2026-10-26, the web app driven in Chromium against a stand-in
// cloud with the computer shut): a new thread started on the web app sat in In
// progress reading "Nothing running", the word the desktop keeps for a row
// nothing will ever start. It was waiting for the computer, which starts it the
// moment it takes the command. A reply waiting the same way read the same.
// Both are now among the snapshot's queued rows, so they read "Queued".
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { madeHere } from '../shared/phone-snapshot.mjs';
import { liveLine } from '../renderer/src/live-line';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const NEW_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const thread = (item, extra = {}) => ({ device: DEV, project: 'alpha', item, snapshot: { v: 2, item: { id: item, title: `T ${item}`, status: 'blocked', updatedAt: NOW - 1e5, ...extra }, history: [] } });
const cmd = (id, kind, extra = {}) => ({ id, device: DEV, project: 'alpha', item: 'w-1', kind, payload: {}, created_at: iso(NOW - 1000), taken_at: null, outcome: null, ...extra });
const rows = (commands = []) => ({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha' }], threads: [thread('w-1'), thread('w-2')], commands });

describe('waiting for the computer', () => {
  it('a new thread is queued, and reads Queued', () => {
    const v = phoneView(rows([cmd(NEW_ID, 'new', { item: null, payload: { title: 'Ship it', body: 'today' } })]), NOW);
    expect(v.queued).toEqual([madeHere(NEW_ID)]);
    const row = v.items.find((i) => i.id === madeHere(NEW_ID));
    expect(liveLine(row, { queued: v.queued, inProgress: true, now: NOW })?.state).toBe('queued');
  });

  it('a reply is queued on its thread', () => {
    const v = phoneView(rows([cmd('c1', 'reply', { payload: { text: 'Yes' } })]), NOW);
    expect(v.queued).toEqual(['w-1']);
  });

  it('is not queued once the computer took it, the cloud has it, or it was refused or taken back', () => {
    expect(phoneView(rows([cmd('c1', 'reply', { payload: { text: 'Yes' }, taken_at: iso(NOW), outcome: 'done' })]), NOW).queued).toEqual([]);
    expect(phoneView(rows([cmd('c1', 'reply', { payload: { text: 'Yes' }, claimed_at: iso(NOW), claimed_by: 'cloud:run-1' })]), NOW).queued).toEqual([]);
    expect(phoneView(rows([cmd('c1', 'reply', { payload: { text: 'Yes' }, taken_at: iso(NOW), outcome: 'refused: no' })]), NOW).queued).toEqual([]);
    expect(phoneView(rows([cmd(NEW_ID, 'new', { item: null, payload: { title: 'x' }, taken_at: iso(NOW), outcome: 'refused: taken back on the phone' })]), NOW).queued).toEqual([]);
  });

  it('a close or a Later is not a thread waiting to run', () => {
    expect(phoneView(rows([cmd('c1', 'close'), cmd('c2', 'snooze', { item: 'w-2', payload: { until: NOW + 864e5 } })]), NOW).queued).toEqual([]);
  });

  it('reaches the screens through the snapshot', async () => {
    const fs = await import('node:fs');
    expect(fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8')).toMatch(/running: view\.running, queued: view\.queued/);
  });
});
