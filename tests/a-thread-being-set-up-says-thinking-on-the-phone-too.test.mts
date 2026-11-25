// While the computer makes a new thread's own copy of the project, the
// desktop reads it as a run (Thinking, beside the moving mark), not Queued
// (2026-11-22: a new user's first thread read Queued for 19.7 s and they asked
// whether Agentbox was connected to Claude Code at all). The phone parity
// round of 2026-11-25 found the phone still saying Queued then: the computer
// told it only that the thread was queued. The computer now says the thread is
// being set up, in a field an older phone passes over, so an older phone
// still says Queued.
import { describe, it, expect } from 'vitest';
import { phoneWaitsOf } from '../shared/phone-snapshot.mts';
import { phoneView, waitFacts } from '../renderer/src/phone-rows';
import { phoneTabs } from '../mobile/src/lib/tabs';
import { liveOf } from '../mobile/src/lib/thread-offers';

const NOW = Date.parse('2026-11-25T18:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';
const thread = (item: string, wait: unknown) => ({ device: DEV, project: 'alpha', item, updated_at: iso(NOW - 1000), snapshot: { v: 2, item: { id: item, title: `T ${item}`, kind: 'directive', labels: ['founder'], status: 'open', updatedAt: NOW - 1e4, createdAt: NOW - 2e4 }, history: [], wait } });

describe('a thread being set up, on the phone', () => {
  it('is said by the computer as queued and being set up', () => {
    const { byId } = phoneWaitsOf({ queued: ['w-s', 'w-q'], settingUp: ['w-s'] });
    expect(byId['w-s']).toEqual({ state: 'queued', settingUp: true });
    expect(byId['w-q']).toEqual({ state: 'queued' });
  });

  it('reads as a run on its row and Thinking in the thread, and a queued one still reads Queued', () => {
    const { byId } = phoneWaitsOf({ queued: ['w-s', 'w-q'], settingUp: ['w-s'] });
    const view = phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }], threads: [thread('w-s', byId['w-s']), thread('w-q', byId['w-q'])], commands: [] } as never, NOW);
    const rows = phoneTabs(view, NOW).progress;
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row('w-s')).toMatchObject({ queued: false, running: true });
    expect(row('w-q')).toMatchObject({ queued: true, running: false });
    const item = (id: string) => view.items.find((i: { id: string }) => i.id === id);
    expect(liveOf(item('w-s'), { session: null, inProgress: true, now: NOW, ...waitFacts(view, 'w-s') })).toMatchObject({ working: true, word: 'Thinking' });
    expect(liveOf(item('w-q'), { session: null, inProgress: true, now: NOW, ...waitFacts(view, 'w-q') })?.working).toBe(false);
  });
});
