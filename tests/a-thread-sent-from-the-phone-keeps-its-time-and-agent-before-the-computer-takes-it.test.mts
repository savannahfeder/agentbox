// A THREAD SENT FROM THE PHONE KEEPS ITS TIME AND AGENT BEFORE THE COMPUTER TAKES IT.
//
// 2026-11-02 product-loop workday: three synthetic testers sent new threads
// from the phone with "Tomorrow morning", "Add it to Later" and Codex picked.
// Until the computer takes a thread, the phone draws it from the command it
// left, and that row kept only the title and body: every one showed under In
// progress as Queued, starting now, on the default model (logged 3 times, 3
// times and once). The row now carries the time, Later, agent, model, level
// and priority the command was sent with, through the same check the computer
// applies to it (`phoneChoices`).
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { madeHere } from '../shared/phone-snapshot.mts';
import { phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.parse('2026-11-02T22:40:00Z');
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const TOMORROW = NOW + 10 * 3600_000;

const sent = (payload, over = {}) => ({ id: 'c0ffee00-0000-4000-8000-000000000001', device: DEV, project: 'alpha', item: null, kind: 'new',
  payload: { title: 'Customer call follow-ups', body: 'Write them up', ...payload }, created_at: iso(NOW - 60_000), claimed_at: null, taken_at: null, ...over });
const rowOf = (cmd) => phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }], threads: [], commands: [cmd] }, NOW)
  .items.find((i) => i.id === madeHere(cmd.id) && i.product === A);

describe('a new thread the computer has not taken yet', () => {
  it('sent for tomorrow morning keeps that time', () => {
    expect(rowOf(sent({ runAt: TOMORROW }))).toMatchObject({ runAt: TOMORROW, status: 'open' });
  });

  it('added to Later is not started', () => {
    expect(rowOf(sent({ start: 'later' }))).toMatchObject({ start: 'later' });
  });

  it('sent to Codex keeps its agent, model and level', () => {
    expect(rowOf(sent({ engine: 'codex', model: 'gpt-6.1-sol', effort: 'high', priority: 3 })))
      .toMatchObject({ engine: 'codex', model: 'gpt-6.1-sol', effort: 'high', priority: 3 });
  });

  it('sent plainly carries no time, Later or agent of its own', () => {
    const row = rowOf(sent({}));
    expect(row).toMatchObject({ status: 'open', priority: 0 });
    for (const k of ['runAt', 'start', 'engine', 'model', 'effort']) expect(row).not.toHaveProperty(k);
  });

  it('takes nothing the computer would refuse from the command', () => {
    const row = rowOf(sent({ runAt: -5, start: 'whenever', priority: 99, status: 'done', labels: ['founder', 'clean'] }));
    expect(row).toMatchObject({ status: 'open', priority: 0, labels: ['founder'] });
    expect(row).not.toHaveProperty('runAt');
    expect(row).not.toHaveProperty('start');
  });

  it('sent for tomorrow or added to Later is listed under Later, and a plain one under In progress', () => {
    const view = (cmds) => phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }], threads: [], commands: cmds }, NOW);
    const listOf = (cmd) => {
      const tabs = phoneTabs(view([cmd]), NOW);
      return Object.keys(tabs).filter((t) => tabs[t].some((r) => r.id === madeHere(cmd.id)));
    };
    expect(listOf(sent({ runAt: TOMORROW }))).toEqual(['snoozed']);
    expect(listOf(sent({ start: 'later' }))).toEqual(['snoozed']);
    expect(listOf(sent({}))).toEqual(['progress']);
  });

  it('that the computer refused stays blocked with its reason, time or not', () => {
    expect(rowOf(sent({ runAt: TOMORROW }, { taken_at: iso(NOW - 30_000), outcome: 'refused: that project is not on your phone' })))
      .toMatchObject({ status: 'blocked' });
  });
});
