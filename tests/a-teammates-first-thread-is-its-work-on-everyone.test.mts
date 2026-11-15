// A TEAMMATE'S FIRST THREAD IS ITS WORK ON EVERYONE (2026-11-08).
//
// A new AI teammate (YC Partner) spent its first day in the thread it was made
// in, "Set up a new teammate": a kickoff page, a board and the week's plan. The
// Everyone page skipped every teammate thread titled "Set up …", so the
// teammate showed in the sidebar and nowhere on the page. Measured by feeding
// teamToday that row's shape from the store (done, labelled teammate:<id>,
// progress six steps long) and reading what the page draws for the teammate.
import { describe, it, expect } from 'vitest';
import { teamToday, groupsOf, shownDay } from '../renderer/src/team/today.ts';

const NOW = new Date(2026, 10, 8, 15, 22).getTime();
const at = (h, m = 0) => new Date(2026, 10, 8, h, m).getTime();
const item = (o) => ({ product: 'team', status: 'open', labels: [], updatedAt: at(9), createdAt: at(8), title: o.id, ...o });
const base = {
  range: 'today', now: NOW, me: 'p-me', products: [{ slug: 'team', name: 'Team', team: {} }],
  decisions: [], mentions: [], cards: [], people: [], mates: [{ id: 't-yc', name: 'YC Partner' }],
  mateOf: (r) => r.labels?.find((l) => l.startsWith('teammate:'))?.slice(9) ?? null,
};
const yc = (people) => people.find((p) => p.key === 'mate:t-yc');
const progress = 'Set up YC Partner: revenue, Sunday planning and Friday eval\nWeek 1 aims: 50 Looms, 1 paying seat';

describe('a teammate that worked in the thread it was made in', () => {
  it('is drawn with that thread under Done, saying how far it got', () => {
    const setup = item({ id: 'yc-setup', title: 'Set up a new teammate', labels: ['teammate:t-yc'], status: 'done', progress, updatedAt: at(14), wrote: { status: { ts: at(14, 6) } } });
    const shown = shownDay(teamToday({ ...base, items: [setup], needs: [] }));
    const done = groupsOf(yc(shown.people)).done;
    expect(done.map((l) => l.item.id)).toEqual(['yc-setup']);
    expect(done[0].says).toBe('Week 1 aims: 50 Looms, 1 paying seat');
    expect(shown.quiet).not.toContain('YC Partner');
  });

  it('is drawn under Working on while that thread is still running', () => {
    const setup = item({ id: 'yc-setup', title: 'Set up YC Partner', labels: ['teammate:t-yc'], progress, updatedAt: at(14) });
    const shown = shownDay(teamToday({ ...base, items: [setup], needs: [] }));
    expect(groupsOf(yc(shown.people)).working.map((l) => l.item.id)).toEqual(['yc-setup']);
  });

  it('is still quiet when that thread is waiting on you, which Needs you already shows', () => {
    const setup = item({ id: 'yc-setup', title: 'Set up a new teammate', labels: ['teammate:t-yc'], updatedAt: at(14) });
    const shown = shownDay(teamToday({ ...base, items: [setup], needs: [setup] }));
    expect(yc(shown.people)).toBeUndefined();
    expect(shown.quiet).toContain('YC Partner');
  });

  it('is quiet when the thread finished on another day', () => {
    const setup = item({ id: 'yc-setup', title: 'Set up a new teammate', labels: ['teammate:t-yc'], status: 'done', progress, updatedAt: at(14) - 86_400_000 });
    expect(yc(shownDay(teamToday({ ...base, items: [setup], needs: [] })).people)).toBeUndefined();
  });

  it('an agent setting up its own job is still not news', () => {
    const own = item({ id: 'own', title: 'Set up its job', labels: ['teammate:t-yc'], status: 'done', updatedAt: at(14) });
    expect(yc(shownDay(teamToday({ ...base, items: [own], needs: [] })).people)).toBeUndefined();
  });
});
