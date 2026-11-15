// A THREAD ENDS AT ITS OPTIONS WITH NO HAZE.
//
// The owner's screenshot, 2026-11-02: a picture in the thread washed into a white
// haze above the options, "should just end as normal components do, no haze".
// The one-at-a-time page lost its fade for the same reason
// (the-answer-is-cut-off-at-the-choices-without-a-fade); every other thread
// page still had three: a 22px mask on the scroll in the workspace layout, a
// 34px mask on it in a picture theme, and a 34px painted band above the dock.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rules = (css, needle) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1].includes(needle)).map((m) => m[2]);

describe('the bottom of a thread', () => {
  it('is not masked into a fade in any layout or theme', () => {
    for (const f of ['renderer/src/styles.css', 'renderer/src/workspace-navigation.css']) {
      for (const body of rules(read(f), '.focus-scroll')) expect(body).not.toMatch(/mask-image/);
    }
  });

  it('rounds the options like the reply box under them', () => {
    expect(read('renderer/src/soft-corners.css')).toMatch(/\.opt-strip \{ border-radius: var\(--artifact-corner\); \}/);
  });

  it('has no band painted above the reply box', () => {
    for (const body of rules(read('renderer/src/styles.css'), '.focus-dock::before')) expect(body).not.toMatch(/gradient/);
  });
});
