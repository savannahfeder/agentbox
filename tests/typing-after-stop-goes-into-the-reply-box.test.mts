// Two power testers (2026-11-10) pressed Stop in a thread's reply box and typed
// the next instruction straight away, as the toast invites ("Reply to redirect
// it"). Twelve times the words were lost: "resume ..." arrived as "esume ...",
// because R is the reply key and put focus back in the box, and a reply not
// starting with R went nowhere at all. Stop sits in the box's send slot; once
// pressed it gives way to Send and takes focus with it, to the page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const slot = focus.match(/\{stop && !hasDraft \? ([\s\S]*?) : \(/)?.[1] ?? '';

describe('Stop in the reply box', () => {
  it('hands focus back to the box it sits in', () => {
    expect(slot).toMatch(/onClick=\{\(\) => requestAnimationFrame\(\(\) => ref\.current\?\.focus\(\)\)\}/);
    expect(slot).toContain('{stop}');
  });

  it('keeps the layout the slot always had', () => {
    expect(slot).toMatch(/display: 'contents'/);
  });

  it('a run ending on its own does not pull focus into the box', () => {
    expect(focus).not.toMatch(/useEffect\(\(\) => \{[^}]*!stop[^}]*ref\.current\?\.focus\(\)/);
  });
});
