// A THREAD CAN BE MOVED FROM ITS MENU (w-8b637c7802).
//
// In the round after moving a thread that ran became possible, three testers
// looked for it in the thread's More actions menu ("next to Rename") and found
// it only by guessing in ⌘K. The menu row opens ⌘K with "Move to " typed, so
// its rows (one per project, or the sentence saying why this one cannot move)
// are the ones already there. Measured by the menu's rows and the box's text.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { Palette } from '../renderer/src/components/Palette.tsx';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const labels = (opts) => threadMenuRows({ change: false, terminal: 'closed', finish: true, ...opts }).map((r) => r.label);

describe('the More actions menu', () => {
  it('lists Move to another project under Rename when offered', () => {
    expect(labels({ rename: true, move: true })).toEqual(['Open terminal', 'Rename', 'Move to another project', 'Mark done']);
  });
  it('does not when not offered', () => {
    expect(labels({ rename: true })).not.toContain('Move to another project');
  });
  it('is offered on an open thread of yours, not a finished one, an outside agent or a conversation', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/onMove=\{canFinish && !agent && !direct \? onMove \?\? null : null\}/);
  });
  it('opens ⌘K with Move to typed', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/onMove=\{\(\) => \{ setPaletteTyped\('Move to '\); setModal\('palette'\); \}\}/);
  });
});

describe('⌘K', () => {
  const draw = (props) => renderToStaticMarkup(React.createElement(Palette, { products: [], supervisorPaused: false, onClose() {}, open: true, ...props }));
  it('opens with the words it is handed', () => {
    expect(draw({ typed: 'Move to ' })).toMatch(/value="Move to "/);
  });
  it('opens empty otherwise', () => {
    expect(draw({})).toMatch(/value=""/);
  });
  it('forgets them once it closes', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/if \(modal !== 'palette'\) setPaletteTyped\(''\)/);
  });
});
