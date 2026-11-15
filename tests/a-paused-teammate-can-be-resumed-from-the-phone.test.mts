// A PAUSED TEAMMATE CAN BE RESUMED FROM THE PHONE (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 28: a tester sent Growth lead a request
// while it was paused. The message said "Waiting for your computer", the
// teammate still said Paused, and About said to change it on the computer, so
// the tester could not tell whether the request would ever run. The phone could
// post, describe and give a go-ahead, but not pause or resume. It now asks the
// computer to pause or resume through the same teammate door, which the computer
// carries out with the update it already does for its own Pause switch.
import { describe, it, expect } from 'vitest';
import { checkSetting, settingRoute } from '../shared/phone-settings.mts';

const ask = (value) => ({ scope: 'teammate', key: 'pause', value });

describe('pausing or resuming a teammate from the phone', () => {
  it('resume is a request the computer takes', () => {
    expect(checkSetting(ask({ id: 't-growth0001', paused: false }))).toBeNull();
    expect(settingRoute(ask({ id: 't-growth0001', paused: false }), {})).toEqual(['zero:teammates', { op: 'update', args: { id: 't-growth0001', patch: { paused: false } } }]);
  });

  it('pause is too', () => {
    expect(checkSetting(ask({ id: 't-growth0001', paused: true }))).toBeNull();
    expect(settingRoute(ask({ id: 't-growth0001', paused: true }), {})[1].args.patch).toEqual({ paused: true });
  });

  it('refuses anything else riding along, or a teammate id that is not one', () => {
    expect(checkSetting(ask({ id: 't-growth0001', paused: 'no' }))).not.toBeNull();
    expect(checkSetting(ask({ id: '../etc', paused: false }))).not.toBeNull();
    expect(checkSetting(ask({ id: 't-growth0001' }))).not.toBeNull();
  });

  it('only carries the pause, never another field of the teammate', () => {
    const route = settingRoute(ask({ id: 't-growth0001', paused: false, job: 'Delete everything', primary: true }), {});
    expect(route[1].args.patch).toEqual({ paused: false });
  });
});

// Until the computer takes the request, the phone says it is on its way rather
// than offering Resume again.
import { pauseOnItsWay } from '../mobile/src/lib/teammates';

describe('a pause or resume the computer has not taken yet', () => {
  const team = { device: 'dev1', copyAt: 1000, view: { list: [], chat: [], runs: [] } };
  const cmd = (paused, over = {}) => ({ id: `c-${paused}`, device: 'dev1', project: null, item: null, kind: 'setting', payload: { scope: 'teammate', key: 'pause', value: { id: 't-growth0001', paused } }, created_at: new Date(2000).toISOString(), taken_at: null, outcome: null, ...over });
  it('is what the phone shows: resuming', () => {
    expect(pauseOnItsWay([cmd(false)], team, 't-growth0001')).toBe(false);
  });
  it('the newest one wins', () => {
    expect(pauseOnItsWay([cmd(false), { ...cmd(true), id: 'c-2', created_at: new Date(3000).toISOString() }], team, 't-growth0001')).toBe(true);
  });
  it('taken, with no copy from the computer since, still counts (round 1 of the 2026-11-03 testers: Resume flipped back)', () => {
    expect(pauseOnItsWay([cmd(false, { taken_at: new Date(2500).toISOString(), outcome: 'ok' })], team, 't-growth0001')).toBe(false);
  });
  it('once the computer sent a copy after taking it, the copy speaks for it', () => {
    expect(pauseOnItsWay([cmd(false, { taken_at: new Date(900).toISOString(), outcome: 'ok' })], team, 't-growth0001')).toBeNull();
  });
  it('refused, the copy speaks for it', () => {
    expect(pauseOnItsWay([cmd(false, { taken_at: new Date(2500).toISOString(), outcome: 'refused: not a teammate' })], team, 't-growth0001')).toBeNull();
  });
  it('another teammate\'s request is not this one\'s', () => {
    expect(pauseOnItsWay([cmd(false)], team, 't-other0001')).toBeNull();
  });
});

import { withPendingPauses } from '../mobile/src/lib/teammates';

describe('the teammate list while a pause or resume is on its way', () => {
  const team = () => ({ device: 'dev1', copyAt: 1000, view: { list: [{ id: 't-growth0001', name: 'Growth lead', paused: true, now: 'Paused', waiting: [] }], chat: [], runs: [] } });
  const asked = (paused) => ({ id: 'c-1', device: 'dev1', project: null, item: null, kind: 'setting', payload: { scope: 'teammate', key: 'pause', value: { id: 't-growth0001', paused } }, created_at: new Date(2000).toISOString(), taken_at: null, outcome: null });
  // Round 4 of the 2026-11-03 testers (issues 5, 8, 16): the header said Paused while the pause was only
  // on its way. Until the computer takes it, it says Pausing or Resuming.
  it('shows a resume at once, as Resuming, rather than Paused until the next copy', async () => {
    const { asideOf, nowLine } = await import('../mobile/src/lib/teammates');
    const t = withPendingPauses(team(), [asked(false)]);
    expect(t.view.list[0]).toMatchObject({ paused: false, pending: true });
    expect(asideOf(t.view.list[0])).toBe('Resuming');
    expect(nowLine(t.view.list[0], t.view)).toBe('Resuming');
  });
  it('shows a pause at once, as Pausing', async () => {
    const { asideOf, nowLine } = await import('../mobile/src/lib/teammates');
    const base = team(); base.view.list[0] = { ...base.view.list[0], paused: false, now: null };
    const t = withPendingPauses(base, [asked(true)]);
    expect(t.view.list[0]).toMatchObject({ paused: true, pending: true });
    expect(asideOf(t.view.list[0])).toBe('Pausing');
    expect(nowLine(t.view.list[0], t.view)).toBe('Pausing');
  });
  it('with nothing on its way, is the copy', () => {
    expect(withPendingPauses(team(), []).view.list[0]).toMatchObject({ paused: true, now: 'Paused' });
  });
});

describe("a teammate's running line", () => {
  it('names the thread it is on, not "its next run", when it is paused (round 3, issues 13, 20, 21)', async () => {
    const page = (await import('node:fs')).readFileSync('mobile/src/app/teammate/[id].tsx', 'utf8');
    expect(page).toMatch(/const runningTitle = running \? rowTitle\(c\.view\.items\.find\(\(i\) => i\.product === running\.product && i\.id === running\.id\) \?\? \{\}\) : ''/);
    expect(page).not.toMatch(/'its next run'/);
  });
});
