// A TESTER'S CLICK ON A LINK THAT WRAPS LANDS ON ITS WORDS (w-d19fcb9309).
//
// Third and fourth synthetic team runs, 2026-11-09: Maya clicked a thread link
// pasted into a chat, four times, and "stayed in the conversation". The link
// wrapped onto two lines, so the middle of its box fell on the sentence around
// it, and browse.mjs counted that as a hit because the sentence contains the
// link. A titled link, on one line, opened every time. The click now aims at
// the first line the element is drawn on, and only the element or something
// inside it counts as reached.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const browse = fs.readFileSync(new URL('../.claude/skills/verify-agentbox/scripts/browse.mjs', import.meta.url), 'utf8');

describe('where a tester\'s click lands', () => {
  it('aims at the first line of an element drawn over several', () => {
    expect(browse).toContain('const lines = el.getClientRects(); const r = el.getBoundingClientRect(); const aim = lines.length > 1 ? lines[0] : r;');
    expect(browse).toContain('const x = aim.left + aim.width / 2; const y = aim.top + aim.height / 2;');
  });
  it('does not count the sentence around it as the thing clicked', () => {
    expect(browse).toContain('reachable: !!top && (top === el || el.contains(top))');
    const click = browse.slice(browse.indexOf('async function thingAt'), browse.indexOf('async function thingAt') + 1500);
    expect(click).not.toContain('top.contains(el)');
  });
});
