// AFTER A FONT-SIZE CHANGE THE PHONE APP STILL OPENS SCREENS.
//
// What broke (QA M-35, 2026-11-07 to 11-11, native Android, 2 of 2 controlled
// repros): after the system font size changed and changed back, no tap opened
// a screen until a force-stop, and logcat said "router.push dropped: the
// screen did not come back within 5000 ms". Android recreates the activity,
// so a new root mounts before the old one unmounts. expo-router 58's bridge
// (build/global-state/routingQueueContext.js) binds the shared `router` in the
// new root's layout effect, then the old root's cleanup puts the unbound
// methods back, so the shared router stays unbound for the life of the
// process. The root layout now hands its own hook-made router to
// mobile/src/lib/patient-router.ts, and only the root that bound it may take
// it away.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { patientRouter, NOT_READY } from '../mobile/src/lib/patient-router';

type Calls = unknown[][];

function shared() {
  const calls: Calls = [];
  const thrower = () => { throw new Error(NOT_READY); };
  return { calls, real: { push: thrower, back: thrower, canGoBack: thrower } as Record<string, (...a: unknown[]) => unknown> };
}

function rootRouter(calls: Calls, name: string) {
  return { push: (h: unknown) => calls.push([name, 'push', h]), back: () => calls.push([name, 'back']), canGoBack: () => true };
}

function clock() {
  let t = 0; const queue: (() => void)[] = [];
  return { now: () => t, later: (f: () => void) => queue.push(f), tick(ms = 50) { t += ms; queue.splice(0).forEach((f) => f()); } };
}

describe('the router after Android recreates the activity', () => {
  it('a tap goes to the new root even though the old root unmounted after it mounted', () => {
    const s = shared(); const c = clock();
    const router = patientRouter(s.real, { now: c.now, later: c.later });
    const unbindOld = router.bindLive(rootRouter(s.calls, 'old'));
    router.bindLive(rootRouter(s.calls, 'new'));
    unbindOld();
    router.push('/settings');
    expect(s.calls).toEqual([['new', 'push', '/settings']]);
    expect(router.canGoBack()).toBe(true);
  });

  it('a tap held while no root was mounted lands on the root that mounts next', () => {
    const s = shared(); const c = clock();
    const router = patientRouter(s.real, { now: c.now, later: c.later });
    router.bindLive(rootRouter(s.calls, 'old'))();
    router.push('/new');
    expect(s.calls).toEqual([]);
    router.bindLive(rootRouter(s.calls, 'new'));
    c.tick();
    expect(s.calls).toEqual([['new', 'push', '/new']]);
  });

  it('with no root mounted it waits rather than calling a root that has gone', () => {
    const s = shared(); const c = clock(); const warned: string[] = [];
    const router = patientRouter(s.real, { now: c.now, later: c.later, giveUpMs: 200, warn: (m) => warned.push(m) });
    router.bindLive(rootRouter(s.calls, 'old'))();
    expect(router.canGoBack()).toBe(false);
    router.back();
    for (let i = 0; i < 10; i++) c.tick();
    expect(s.calls).toEqual([]);
    expect(warned).toHaveLength(1);
  });

  it('a root that unmounts twice does not take away the root after it', () => {
    const s = shared(); const c = clock();
    const router = patientRouter(s.real, { now: c.now, later: c.later });
    const unbindOld = router.bindLive(rootRouter(s.calls, 'old'));
    unbindOld();
    router.bindLive(rootRouter(s.calls, 'new'));
    unbindOld();
    router.push('/search');
    expect(s.calls).toEqual([['new', 'push', '/search']]);
  });
});

describe('the phone app', () => {
  it('its root layout hands its own router to the shared one', () => {
    const layout = fs.readFileSync(path.join(import.meta.dirname, '..', 'mobile', 'src', 'app', '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/useRouter\(\)/);
    expect(layout).toMatch(/router\.bindLive\(/);
  });
});
