// THE TUTORIAL IS NOT OFFERED AFTER THE FIRST RUN IS DONE (F-164).
//
// What broke: two of two fresh desktop users finished the first run, then made
// a second project while filing a task, and "Take the tutorial first?" covered
// the task card. The offer is asked once, on a new project, unless it was
// already answered; the walk this first run replaced wrote that answer when it
// finished, and the new first run never did.
//
// How it was measured: QA sessions 28 and 29 on main 92e036c0.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { neverOffered, offerOnNewProject, rememberOffered } from '../renderer/src/tutorial.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const body = (name) => {
  const at = app.indexOf(`const ${name} = useCallback(`);
  expect(at).toBeGreaterThan(-1);
  return app.slice(at, app.indexOf('}, [', at));
};

it('counts finishing either first run as the answer', () => {
  for (const name of ['finishFresh', 'finishClassic']) expect(body(name)).toContain('rememberOffered(localStorage);');
});

it('then offers nothing on the next project', () => {
  const store = new Map();
  const local = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  expect(offerOnNewProject({ made: true, walking: false, offered: !neverOffered(local) })).toBe(true);
  rememberOffered(local);
  expect(offerOnNewProject({ made: true, walking: false, offered: !neverOffered(local) })).toBe(false);
});
