// The menu bar on the Omarchy window was hidden, and a band of empty
// background stayed above the threads pane. That band is the 40px the layout
// keeps clear for the macOS traffic lights. The side and bottom inset are
// 22px. Measured 2026-10-07 from the window after the bar was gone: the pane
// still started a traffic light's height down, and nothing sits there on
// this computer. The Mac window keeps the 40px. The drag strip has to shrink
// with the inset, or it covers the top of the pane and eats the clicks.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const css = read('renderer', 'src', 'workspace-navigation.css');
const preload = read('preload.cjs');

function rule(selector) {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe('the window without traffic lights drops their headroom', () => {
  it('keeps the Mac clearance on a window that does not say otherwise', () => {
    expect(rule('.app.workspace-layout {')).toMatch(/padding:\s*40px 22px 22px/);
    expect(rule('.workspace-layout::before {')).toMatch(/top:\s*40px/);
    expect(rule('.workspace-navigation {')).toMatch(/top:\s*50px/);
    expect(rule('.workspace-layout::after {')).toMatch(/height:\s*40px/);
  });

  it('uses the same inset as the sides when the window is flat', () => {
    const layout = rule(':root[data-window="flat"] .app.workspace-layout {');
    const pane = rule(':root[data-window="flat"] .workspace-layout::before {');
    const nav = rule(':root[data-window="flat"] .workspace-navigation {');
    const strip = rule(':root[data-window="flat"] .workspace-layout::after {');
    expect(layout).toMatch(/padding-top:\s*22px/);
    expect(pane).toMatch(/top:\s*22px/);
    // The sidebar sits 10px under the pane on the Mac (50 against 40). It
    // keeps that, rather than staying at 50 while the pane moves up.
    expect(nav).toMatch(/top:\s*32px/);
    // Taller than the inset, the strip covers the pane and eats its top edge.
    expect(strip).toMatch(/height:\s*22px/);
    expect(strip).not.toMatch(/height:\s*40px/);
  });

  it('marks only a non-Mac window flat, and does not pretend it is a browser tab', () => {
    const gate = preload.indexOf("process.platform !== 'darwin'");
    expect(gate).toBeGreaterThan(-1);
    const arm = preload.indexOf("document.documentElement.dataset.window = 'flat'", gate);
    expect(arm).toBeGreaterThan(gate);
    expect(preload.slice(gate, arm)).not.toMatch(/data-shell/);
    expect(css).not.toMatch(/:root\[data-shell="tab"\][^{]*data-window/);
  });
});
