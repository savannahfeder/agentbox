// THE USAGE PANEL WAS DRAWN IN THE FOLDED SIDEBAR (w-07891cd502, 2026-11-01).
//
// "if i've hovered over claude code and then the window condenses the card gets
// weirdly stretched." The panel hangs off the sidebar at the sidebar's width
// (left: 0; right: 0). Pointing at the usage row opened it; moving off the
// sidebar folds the rail to 38 points at once, while the panel stayed up for its
// 220ms linger, so its text wrapped a word a line into a tall thin strip.
// Entering the folded rail straight onto the gauge did the same on the way in:
// the panel opened at 120ms, the rail at 140ms, and its width eases for 240ms.
// Asked for: no panel while the sidebar is folded.
//
// The suite has no DOM, so the wiring is read from the source, as the other
// usage tests do.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsagePill } from '../renderer/src/components/UsagePill.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../renderer/src/App.tsx');
const pill = read('../renderer/src/components/UsagePill.tsx');
const NOW = Date.parse('2026-11-01T12:00:00Z');
const reading = { engine: 'claude', at: NOW, limits: [
  { span: 'session', qualifier: null, name: 'This session', percent: 47, resetsAt: NOW + 2 * 3600_000 },
] };

describe('the usage panel and the folded sidebar', () => {
  it('is told when the sidebar is folded', () => {
    expect(app).toMatch(/<UsagePill[^>]*folded=\{sideFolded\}/s);
  });
  it('is never open while folded, whether hovered or pressed', () => {
    expect(pill).toContain('const open = !folded && (pinned || hovering);');
  });
  it('drops the hover the moment the sidebar folds, so it does not come back on its own', () => {
    const fold = pill.match(/useEffect\(\(\) => \{\s*if \(!folded\) return;([\s\S]*?)\}, \[folded\]\);/);
    expect(fold).not.toBeNull();
    expect(fold[1]).toMatch(/clearTimeout\(linger\.current\)/);
    expect(fold[1]).toMatch(/setHovering\(false\)/);
    expect(fold[1]).toMatch(/setPinned\(false\)/);
  });
  it('starts no hover while the rail is still folded, and starts one on the first move after it opens', () => {
    const enter = pill.match(/const enter = \(\) => \{([\s\S]*?)\n {2}\};/)[1];
    expect(enter).toMatch(/if \(folded\) return;/);
    expect(pill).toMatch(/onMouseMove=\{/);
  });
  it('still draws the row itself while folded, as every other icon stays', () => {
    const html = renderToStaticMarkup(createElement(UsagePill, { usage: reading, now: NOW, sidebar: true, folded: true, engineWord: 'Claude Code' }));
    expect(html).toContain('class="usage-pill');
    expect(html).not.toContain('usage-panel');
  });
  it('leaves the window corner, which has no sidebar to fold, as it was', () => {
    expect(pill).toMatch(/if \(!sidebar\) \{ setHovering\(true\); return; \}/);
  });
});
