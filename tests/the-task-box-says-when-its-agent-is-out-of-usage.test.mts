// THE TASK BOX SAYS WHEN ITS AGENT IS OUT OF USAGE, BEFORE SEND.
//
// A tester at 100% of Codex's week typed a task on Home and saw nothing: no
// note, Send lit, the model menu silent. Only the folded sidebar's gauge knew.
// The app learned Codex was out only once a run had been refused, and then
// only per task (`atLimit`), so nothing could speak before Send. Measured on
// `Supervisor#status`: no per-tool answer existed while the reading said 100.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { outOfUsageNote } from '../renderer/src/compose-says';

const NOW = new Date(2026, 10, 11, 10, 0, 0).getTime();
const HOUR = 3600_000;
const week = (over = {}) => ({ span: 'week', qualifier: null, name: 'This week', percent: 100, resetsText: null, resetsOn: null, resetsAt: NOW + 50 * HOUR, zone: null, ...over });

describe('which agents are out of usage before anything is sent', () => {
  let root: string;
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); root = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-out-')); });
  afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

  const out = (reading: unknown, { codexLogins = ['default'] } = {}) => {
    const sup = new Supervisor({ storeRoot: root, home: path.join(root, 'home'), codexHome: path.join(root, 'codex'), maxConcurrentSessions: 3, authProfiles: ['default'] },
      { listItems: () => [], listProducts: () => [], recordSessionResult: () => {} }, root, root, root);
    sup._profilesFor = (engine: string) => (engine === 'codex' ? codexLogins : ['default']);
    sup._cloudLoginOf = () => null;
    sup.codexUsage = () => reading;
    return sup;
  };

  it('names Codex and its reset when its own reading is at a hundred', () => {
    expect(out({ limits: [week()], at: NOW - 60_000 }).toolsOutOfUsage()).toEqual({ codex: { tool: 'Codex', until: NOW + 50 * HOUR } });
  });
  it('says nothing at 99, after the reset, or with no reading', () => {
    expect(out({ limits: [week({ percent: 99 })], at: NOW - 60_000 }).toolsOutOfUsage()).toEqual({});
    expect(out({ limits: [week({ resetsAt: NOW - 1 })], at: NOW - 60_000 }).toolsOutOfUsage()).toEqual({});
    expect(out(null).toolsOutOfUsage()).toEqual({});
  });
  it('says nothing for a tool with no login', () => {
    expect(out({ limits: [week()], at: NOW - 60_000 }, { codexLogins: [] }).toolsOutOfUsage()).toEqual({});
  });
  it('rides the status the screens read', () => {
    expect(out({ limits: [week()], at: NOW - 60_000 }).status().outOfUsage).toEqual({ codex: { tool: 'Codex', until: NOW + 50 * HOUR } });
  });
});

describe('the note under the words', () => {
  const at6 = new Date(2026, 10, 11, 18, 10, 0).getTime();
  const sunday6 = new Date(2026, 10, 15, 18, 10, 0).getTime();
  it('names the hour, and the day when it is not today', () => {
    expect(outOfUsageNote({ tool: 'Codex', until: at6 }, NOW)).toBe('Codex is out of usage until 6:10pm, so this starts then.');
    expect(outOfUsageNote({ tool: 'Codex', until: sunday6 }, NOW)).toBe('Codex is out of usage until 6:10pm Sun, so this starts then.');
  });
  it('still says it is out when nobody said when it comes back', () => {
    expect(outOfUsageNote({ tool: 'Codex', until: 0 }, NOW)).toBe('Codex is out of usage, so this starts when it resets.');
  });
  it('says nothing when the agent has room, or its reset has already passed', () => {
    expect(outOfUsageNote(null, NOW)).toBeNull();
    expect(outOfUsageNote(undefined, NOW)).toBeNull();
    expect(outOfUsageNote({ tool: 'Codex', until: NOW - 1 }, NOW)).toBeNull();
  });
});
