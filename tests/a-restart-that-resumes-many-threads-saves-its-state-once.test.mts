// The 2026-11-07 freeze log put the supervisor's state save second: 639 holds,
// 2,677 s, the longest 951 s, under recoverInterrupted → _resumeInterrupted →
// spawnWorker → _folderFirst → _saveState. Each thread put back after a
// restart serialised and wrote the whole state file again, so a restart with
// many interrupted threads did that once per thread in one hold. Measured
// here by counting the writes of the state file during one recovery pass.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const THREADS = 40;
const row = (id) => ({ id, product: 'p', priority: 5, createdAt: 1, status: 'open', kind: 'directive', labels: ['founder'], title: id, wrote: {} });

let root;
let sup;
let items;
const stateFile = () => path.join(root, '.zero-supervisor.json');
const writesOfState = (spy) => spy.mock.calls.filter(([f]) => f === stateFile()).length;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-one-save-'));
  items = Array.from({ length: THREADS }, (_, i) => row(`w-${i}`));
  sup = new Supervisor(
    { home: '/nonexistent-home', storeRoot: root, maxConcurrentSessions: THREADS + 5, authProfiles: ['default'] },
    { listItems: () => items, listProducts: () => [], isDue: () => true, answerItem: () => {} },
    root,
  );
  sup._liveSessions = Object.fromEntries(items.map((i) => [i.id, { product: 'p', sessionId: `s-${i.id}`, engine: 'claude', profile: 'default' }]));
  sup.transcriptFile = () => '/somewhere/transcript.jsonl';
  // What _folderFirst does for each thread it parks: note it, and save.
  sup._resumeInterrupted = (item) => {
    sup._preparing ??= new Map();
    sup._preparing.set(item.id, { item: { ...item, answer: 'go' }, opts: { continuation: true } });
    sup._handledAnswers.add(`${item.id}:go`);
    sup._saveState();
    return true;
  };
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe('a restart that resumes many threads saves its state once', () => {
  it('writes the state file once for the whole pass, holding every thread it resumed', () => {
    const spy = vi.spyOn(fs, 'writeFileSync');
    const out = sup.recoverInterrupted('startup');
    expect(out.resumed).toBe(THREADS);
    expect(writesOfState(spy)).toBe(1);
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    expect(saved.handledAnswers).toContain(`w-${THREADS - 1}:go`);
  });

  it('resuming many ticked threads at once writes the state file once too', () => {
    sup.spawnWorker = (item) => {
      sup.sessions.set(item.id, { itemId: item.id });
      sup._handledAnswers.add(`${item.id}:go`);
      sup._saveState();
    };
    const spy = vi.spyOn(fs, 'writeFileSync');
    const out = sup.resumeItems(items.map((i) => i.id));
    expect(out.resumed).toBe(THREADS);
    expect(writesOfState(spy)).toBe(1);
  });

  it('a save outside a pass still writes at once', () => {
    const spy = vi.spyOn(fs, 'writeFileSync');
    sup._handledAnswers.add('w-x:hi');
    sup._saveState();
    expect(writesOfState(spy)).toBe(1);
  });

  it('a pass that throws still writes what it changed, and later saves are not held', () => {
    sup._resumeInterrupted = (item) => { sup._handledAnswers.add(`${item.id}:go`); sup._saveState(); throw new Error('boom'); };
    const spy = vi.spyOn(fs, 'writeFileSync');
    expect(() => sup.recoverInterrupted('startup')).toThrow('boom');
    expect(writesOfState(spy)).toBe(1);
    sup._handledAnswers.add('w-after:hi');
    sup._saveState();
    expect(writesOfState(spy)).toBe(2);
  });

  it('a pass with nothing to resume writes nothing', () => {
    sup._liveSessions = {};
    sup._saveState();
    const spy = vi.spyOn(fs, 'writeFileSync');
    sup.recoverInterrupted('startup');
    expect(writesOfState(spy)).toBe(0);
  });
});
