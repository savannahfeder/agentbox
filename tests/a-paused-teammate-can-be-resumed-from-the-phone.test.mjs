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
import { checkSetting, settingRoute } from '../shared/phone-settings.mjs';

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
  it('once taken, the computer\'s copy speaks for it', () => {
    expect(pauseOnItsWay([cmd(false, { taken_at: new Date(2500).toISOString() })], team, 't-growth0001')).toBeNull();
  });
  it('another teammate\'s request is not this one\'s', () => {
    expect(pauseOnItsWay([cmd(false)], team, 't-other0001')).toBeNull();
  });
});
