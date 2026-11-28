// A CAUSE NOTHING WAITS ON LEAVES NEEDS YOU (w-59864bc630).
//
// A tester's Needs you held "Git cannot write the shared worktree index"
// reading "0 waiting", every look and after a relaunch. Its lead had asked
// the person on behalf of one thread, which was then answered on its own and
// so stopped waiting (`waitingOn` counts only blocked threads). Nothing closed
// the cause, so a row that said nothing waited sat in Needs you for good.
// Now the supervisor closes an unanswered cause once nothing waits on it.
import { describe, it, expect, beforeEach } from 'vitest';
import { CAUSE_KIND, CAUSE_LABEL, CAUSE_SETTLES_MS, nothingWaitsOn } from '../shared/causes.mts';
import { Supervisor } from '../main/supervisor.mts';

const T = 1_794_000_000_000;
const old = T - CAUSE_SETTLES_MS;
const cause = (id: string, over = {}) => ({ id, product: 'agentbox', kind: CAUSE_KIND, labels: ['founder', CAUSE_LABEL], status: 'blocked', title: 'Git cannot write the shared worktree index', createdAt: old, wrote: { kind: { source: 'system' } }, ...over });
const thread = (id: string, on: string, over = {}) => ({ id, product: 'website', status: 'blocked', blockedBy: [on], ...over });

describe('which causes nothing waits on', () => {
  it('one whose only thread was answered and runs again', () => {
    const c = cause('c1');
    expect(nothingWaitsOn(c, [c, thread('a', 'c1', { status: 'open' })], T)).toBe(true);
  });
  it('not one a thread still waits on, in any project', () => {
    const c = cause('c1');
    expect(nothingWaitsOn(c, [c, thread('a', 'c1', { status: 'open' }), thread('b', 'c1')], T)).toBe(false);
  });
  it('not one just opened, whose first thread is still writing its wait', () => {
    const c = cause('c1', { createdAt: T - CAUSE_SETTLES_MS + 1 });
    expect(nothingWaitsOn(c, [c], T)).toBe(false);
    expect(nothingWaitsOn({ ...c, createdAt: old }, [c], T)).toBe(true);
  });
  it('not one the person answered, whose lead is starting or working', () => {
    for (const status of ['open', 'claimed', 'done']) {
      const c = cause('c1', { status });
      expect(nothingWaitsOn(c, [c], T)).toBe(false);
    }
  });
  it('not an ordinary blocked row', () => {
    const c = cause('c1', { kind: 'task' });
    expect(nothingWaitsOn(c, [c], T)).toBe(false);
  });
});

describe('the supervisor closes it, as the app', () => {
  let sup: Supervisor; let items: Record<string, unknown>[]; let writes: { id: string; patch: Record<string, unknown>; source: string }[];
  beforeEach(() => {
    writes = [];
    const store = {
      listItems: () => items, listProducts: () => [], isDue: () => true, productDir: (slug: string) => `/x/${slug}`,
      modules: { workItemsDisk: { updateWorkItem: (_dir: string, id: string, patch: Record<string, unknown>, { source }: { source: string }) => { writes.push({ id, patch, source }); } } },
    };
    sup = new Supervisor({ home: '/nonexistent-home', storeRoot: '/nonexistent-root', maxConcurrentSessions: 2, authProfiles: ['default'] }, store as never, '/nonexistent-app');
  });

  it('closes the one nothing waits on and leaves the one with a thread behind it', () => {
    items = [cause('c1'), thread('a', 'c1', { status: 'open' }), cause('c2', { title: 'Write access to repository Git metadata' }), thread('b', 'c2'), thread('c', 'c2')];
    expect(sup.closeCausesNothingWaitsOn(items as never, T)).toEqual(['c1']);
    expect(writes).toEqual([{ id: 'c1', patch: { status: 'done', note: expect.stringMatching(/nothing waits on it/i) }, source: 'system' }]);
  });

  it('is called on every tick, beside the waits it clears', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    expect(src).toMatch(/this\.closeCausesNothingWaitsOn\(items, now\)/);
  });
});
