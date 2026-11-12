// A TAP WHILE ANDROID REDRAWS THE PHONE APP DOES NOT CRASH IT.
//
// What broke (QA M-29, 2026-11-04, native Android): changing the system font
// size or display density and tapping New thread within a second or two closed
// the app, 3 times of 3. Android recreates the activity on those changes (not
// on a dark-mode switch, which is why that one was fine), the root remounts,
// and expo-router 58 swaps its `router` for one whose every method throws
// "The imperative router is unavailable before the first render has finished."
// (build/global-state/routingQueueContext.js). A throw in a tap handler is fatal
// in a release build. Screens now navigate through mobile/src/lib/router.ts,
// which holds the newest call until the router is bound again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { patientRouter, NOT_READY } from '../mobile/src/lib/patient-router';

// Mirrors expo-router: one object whose methods are swapped in place.
function fakeRouter() {
  const calls = [];
  const bound = {
    push: (h) => calls.push(['push', h]),
    replace: (h) => calls.push(['replace', h]),
    back: () => calls.push(['back']),
    canGoBack: () => true,
  };
  const thrower = () => { throw new Error(NOT_READY); };
  const unbound = { push: thrower, replace: thrower, back: thrower, canGoBack: thrower };
  const real = { ...bound };
  return { real, calls, bind: () => Object.assign(real, bound), unbind: () => Object.assign(real, unbound) };
}

function clock() {
  let t = 0; const queue = [];
  return {
    now: () => t,
    later: (f) => queue.push(f),
    tick(ms = 50) { t += ms; const due = queue.splice(0); due.forEach((f) => f()); },
  };
}

describe('navigating while the router is unbound', () => {
  it('does not throw, and the tap lands once the screen is back', () => {
    const r = fakeRouter(); const c = clock();
    const router = patientRouter(r.real, { now: c.now, later: c.later });
    r.unbind();
    expect(() => router.push('/new')).not.toThrow();
    c.tick();
    expect(r.calls).toEqual([]);
    r.bind();
    c.tick();
    expect(r.calls).toEqual([['push', '/new']]);
    c.tick(); c.tick();
    expect(r.calls).toEqual([['push', '/new']]);
  });

  it('a bound router is called straight through', () => {
    const r = fakeRouter(); const c = clock();
    const router = patientRouter(r.real, { now: c.now, later: c.later });
    router.push('/search');
    expect(r.calls).toEqual([['push', '/search']]);
    expect(router.canGoBack()).toBe(true);
  });

  it('two taps in the gap land as the newest one only', () => {
    const r = fakeRouter(); const c = clock();
    const router = patientRouter(r.real, { now: c.now, later: c.later });
    r.unbind();
    router.push('/new');
    router.push('/settings');
    r.bind();
    c.tick(); c.tick();
    expect(r.calls).toEqual([['push', '/settings']]);
  });

  it('a held tap is dropped, not replayed, when a later tap lands first', () => {
    const r = fakeRouter(); const c = clock();
    const router = patientRouter(r.real, { now: c.now, later: c.later });
    r.unbind();
    router.push('/new');
    r.bind();
    router.push('/search');
    c.tick();
    expect(r.calls).toEqual([['push', '/search']]);
  });

  it('asking whether it can go back answers no instead of throwing', () => {
    const r = fakeRouter(); const c = clock();
    const router = patientRouter(r.real, { now: c.now, later: c.later });
    r.unbind();
    expect(router.canGoBack()).toBe(false);
  });

  it('gives up with a warning when the router never comes back', () => {
    const r = fakeRouter(); const c = clock(); const warned = [];
    const router = patientRouter(r.real, { now: c.now, later: c.later, giveUpMs: 200, warn: (m) => warned.push(m) });
    r.unbind();
    router.back();
    for (let i = 0; i < 10; i++) c.tick();
    expect(warned).toHaveLength(1);
    r.bind(); c.tick();
    expect(r.calls).toEqual([]);
  });

  it('any other error still surfaces', () => {
    const router = patientRouter({ push: () => { throw new Error('bad href'); } });
    expect(() => router.push('/x')).toThrow('bad href');
  });
});

describe('the phone app', () => {
  it('never navigates through expo-router\'s own router', () => {
    const root = path.join(import.meta.dirname, '..', 'mobile', 'src');
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && p !== path.join(root, 'lib', 'router.ts')) {
          const src = fs.readFileSync(p, 'utf8');
          for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]expo-router['"]/g)) {
            if (/\brouter\b/.test(m[1])) offenders.push(path.relative(root, p));
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
