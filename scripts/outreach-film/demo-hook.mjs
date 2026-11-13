// The film drives the app's own built screen, fed a made-up company instead of
// a store. This build plugin gives that one build a door for the film's world
// (window.__DEMO__) without touching the source: it appends to api.ts, after
// `export const api = {...}`, a wrapper around the methods the film needs, and
// to fixtures.ts the base world the film starts from. A renamed method or
// fixture fails the build by name instead of filming the canned world.

export const API_METHODS = ['snapshot', 'sessionTrace', 'codeChange', 'itemHistory', 'answer', 'compose', 'onChanged'];
export const FIXTURE_NAMES = ['fixtureSnapshot', 'fixtureSettings', 'ENGINES'];

export function apiAppendix() {
  return `
;{
  const D = (): any => (typeof window !== 'undefined' ? (window as any).__DEMO__ : null);
  const A: any = api;
  for (const m of ${JSON.stringify(API_METHODS)}) if (typeof A[m] !== 'function') throw new Error('outreach film: api.' + m + ' is gone; update scripts/outreach-film/demo-hook.mjs');
  const o: any = {}; for (const m of ${JSON.stringify(API_METHODS)}) o[m] = A[m].bind(A);
  A.snapshot = async () => (D() ? structuredClone(D().state) : o.snapshot());
  A.sessionTrace = async (p: any) => (D()?.trace ? { sessions: D().trace(p.id) } : o.sessionTrace(p));
  A.codeChange = async (p: any) => { const c = D()?.change?.(p.src); return c ? { ok: true, change: c } : o.codeChange(p); };
  A.itemHistory = async (p: any) => (D()?.history ? { ok: true, lines: D().history(p.id) } : o.itemHistory(p));
  A.answer = async (p: any) => (D() ? D().answer(p) : o.answer(p));
  A.compose = async (p: any) => (D() ? D().compose(p) : o.compose(p));
  A.onChanged = (fn: () => void) => { if (!D()) return o.onChanged(fn); D().listeners.add(fn); return () => D().listeners.delete(fn); };
}
`;
}

export function fixturesAppendix() {
  return `\n;(globalThis as any).__FIXTURE__ = { snapshot: fixtureSnapshot, settings: fixtureSettings, engines: ENGINES };\n`;
}

export function demoHook() {
  return {
    name: 'outreach-film-demo-hook',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/');
      if (file.endsWith('/renderer/src/api.ts')) {
        if (!/export const api\s*=\s*\{/.test(code)) throw new Error('outreach film: api.ts no longer exports `const api = {`; update scripts/outreach-film/demo-hook.mjs');
        return { code: code + apiAppendix(), map: null };
      }
      if (file.endsWith('/renderer/src/fixtures.ts')) {
        for (const n of FIXTURE_NAMES) if (!new RegExp(`\\b${n}\\b`).test(code)) throw new Error(`outreach film: fixtures.ts has no ${n}; update scripts/outreach-film/demo-hook.mjs`);
        return { code: code + fixturesAppendix(), map: null };
      }
      return null;
    },
  };
}
