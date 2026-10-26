// THE WORDS OVER THE FINISHED TUTORIAL GO WHEN THE NEXT THING OPENS.
//
// QA finished the browser version's tutorial on 2026-10-25 and pressed N for a
// new thread (F-72). "You finished the tutorial." and the two lines under it
// were still drawn, over the composer, at z-index 303 against the modal's 40.
//
// The layer is meant to go on any key and to take itself down after
// LANDED_MS. Neither happened, and the reason is one line: the app writes
// `onGone` inline, so it is a new function on every render of the app, and the
// effect listed it as a dependency. Every render tore the listener down,
// re-armed it a macrotask later, and restarted the fourteen-second clock from
// zero — so on an app that renders at all (a toast, an agent's line landing,
// the clock) the words never left.
//
// The same shape is called out in components/PlanSetup.tsx: "`onReady` is
// written inline at the call site, so it is a new function on every render".

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDED_MS } from '../renderer/src/components/Onboarding.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const card = read('renderer/src/components/Onboarding.tsx');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');

/** The body of `Landed`, which is the whole of this. */
const landed = card.slice(card.indexOf('export function Landed('), card.indexOf('export function PracticeBand('));

describe('1. the layer is armed once', () => {
  it('holds the way out in a ref rather than in a dependency', () => {
    expect(landed).toMatch(/const gone = useRef\(onGone\);/);
    expect(landed).toMatch(/gone\.current = onGone;/);
  });

  it('so nothing the app redraws restarts its clock or drops its listener', () => {
    const effect = landed.slice(landed.indexOf('useEffect(()'), landed.indexOf('\n  return ('));
    expect(effect).toMatch(/\n  \}, \[\]\);/);
    expect(effect).not.toMatch(/\[onGone\]/);
    // The timer and the listeners are the two things the restart was losing.
    expect(effect).toMatch(/setTimeout\(\(\) => gone\.current\(\), LANDED_MS\)/);
    expect(effect).toMatch(/addEventListener\('keydown'/);
    expect(effect).toMatch(/addEventListener\('pointerdown'/);
  });

  it('and it is still the app that owns what the way out does', () => {
    expect(app).toMatch(/<Landed agents=\{landing\.agents\} onGone=\{\(\) => setLanding\(null\)\} \/>/);
  });
});

describe('2. and anything opened over the app takes it down', () => {
  it('because the words draw above every card and say nothing about one', () => {
    expect(app).toMatch(/useEffect\(\(\) => \{ if \(modal\) setLanding\(null\); \}, \[modal\]\);/);
  });
});

describe('3. and it never outstays a card opened over it', () => {
  it('goes after fourteen seconds on its own', () => {
    expect(LANDED_MS).toBe(14_000);
  });

  it('and is drawn over everything while it is there, which is why it has to go', () => {
    const layer = css.slice(css.indexOf('.fr-landed {'), css.indexOf('.fr-landed-say {'));
    expect(layer).toMatch(/z-index: 302/);
    const modal = css.slice(css.indexOf('.modal-backdrop {'), css.indexOf('.modal {'));
    expect(modal).toMatch(/z-index: 40/);
  });
});
