// A THREAD PAUSED FOR RUN NOW IS TOLD WHY (w-34443a206b).
//
// Testers on 2026-11-22 pressed Run now with every slot full. It paused
// another thread's agent to make room, and that thread said nothing about it:
// its agent just stopped. And the toast, "Up next. It starts as soon as an
// agent is free.", was cut off in its 360px card beside the O key. Measured on
// the supervisor's slot taking, which Run now and an urgent task both use, and
// on the toast's words.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const NOW = 1_787_600_000_000;
const notes: { id: string; note: string }[] = [];
const hers = (id: string, priority: number, extra: Record<string, unknown> = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'], title: id,
  priority, createdAt: NOW, updatedAt: NOW, claim: null, claimExpired: false, ...extra,
});

let sup: InstanceType<typeof Supervisor>;
const build = (items: ReturnType<typeof hers>[]) => {
  sup = new Supervisor(
    { home: '/nonexistent-home-with-no-second-account', storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 1, authProfiles: ['default'] },
    { listItems: () => items, listProducts: () => [], isDue: () => true, settleAnswer() {}, noteItem: (_p: string, id: string, note: string) => { notes.push({ id, note }); } },
    '/nonexistent-app',
  );
  sup.spawnWorker = (item: { id: string; product: string }) => { sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: NOW, tail: [], traced: true }); };
  sup._kill = (session: { itemId: string; stoppedByUs?: boolean }) => { session.stoppedByUs = true; sup.sessions.delete(session.itemId); return true; };
  sup.transcriptFile = (rec: { sessionId?: string } | null) => (rec?.sessionId ? `/transcripts/${rec.sessionId}.jsonl` : null);
  sup._saveState = () => {};
};
const running = (id: string) => {
  sup.sessions.set(id, { itemId: id, product: 'agentbox', startedAt: NOW, tail: [], traced: true });
  sup._liveSessions[id] = { sessionId: `s-${id}`, product: 'agentbox', cwd: '/tmp', profile: 'default' };
};

beforeEach(() => { notes.length = 0; });

describe('the thread Run now paused', () => {
  it('says which thread took its place and that it carries on after', async () => {
    build([hers('w-busy', 5), hers('w-mine', 2, { label: 'Fix the cart total' })]);
    running('w-busy');
    sup.runNow('agentbox', 'w-mine');
    await sup.tick();
    expect(notes).toEqual([{ id: 'w-busy', note: 'Paused so “Fix the cart total” could run first. This carries on when an agent is free.' }]);
  });

  it('nothing is said when there was a free slot and nothing was paused', async () => {
    build([hers('w-mine', 2)]);
    sup.runNow('agentbox', 'w-mine');
    await sup.tick();
    expect(notes).toEqual([]);
  });
});

describe('the Run now toast', () => {
  it('fits beside its key: under 40 letters', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    const said = /showToast\(r\?\.ok \? '([^']+)'/.exec(app.slice(app.indexOf('const runNow = useCallback')))?.[1] ?? '';
    expect(said).toBe('Starts as soon as an agent is free.');
    expect(said.length).toBeLessThan(40);
  });
});
