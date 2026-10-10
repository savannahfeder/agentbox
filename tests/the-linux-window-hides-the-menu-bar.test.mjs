// The open window on Omarchy drew Agentbox, Edit, View, Agents, Window as a
// bar across the top. Measured 2026-10-07 from that window. The bar is the
// application menu, which Electron puts inside the window on Linux. On macOS
// the same menu is the system menu bar, and it stays. Removing the menu would
// also remove the Ctrl chords bound to it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const main = read('main', 'main.mjs');
const menu = read('main', 'menu.mjs');

function windowConstruction() {
  const start = main.indexOf('window = new BrowserWindow({');
  expect(start).toBeGreaterThan(-1);
  const end = main.indexOf('const currentScreenDetail', start);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('the linux window hides the menu bar', () => {
  it('hides the bar on everything but the Mac', () => {
    const block = windowConstruction();
    expect(block).toMatch(/process\.platform !== 'darwin'/);
    expect(block).toMatch(/setMenuBarVisibility\(false\)/);
  });

  it('keeps the application menu, so the chords still exist', () => {
    expect(main).toMatch(/installMenu\(/);
    expect(menu).toMatch(/Menu\.setApplicationMenu\(Menu\.buildFromTemplate/);
    expect(main).not.toMatch(/setApplicationMenu\(null\)/);
    expect(menu).not.toMatch(/setApplicationMenu\(null\)/);
  });

  it('does not auto-hide, which would bring the bar back when Alt is pressed', () => {
    const block = windowConstruction();
    expect(block).not.toMatch(/autoHideMenuBar/);
    expect(block).not.toMatch(/setAutoHideMenuBar/);
  });
});
