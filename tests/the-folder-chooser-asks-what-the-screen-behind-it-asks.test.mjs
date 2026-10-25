// THE FOLDER CHOOSER'S TITLE BAR ASKS WHAT THE SCREEN BEHIND IT ASKS.
//
// Reported from the QA box, 2026-10-23, on Linux, where the GTK chooser draws
// its title where a Mac sheet does not: the screen said "Pick a folder for your
// first project." and pressing Choose a folder opened a window titled "Where is
// its code?" — the heading that screen carried until w-ec62ab6b38 redrew it.
// The chooser is opened for any project, not only the first, so its title says
// what it is for and nothing about which project.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY } from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Without its comments, where the question it stopped asking is written up.
const ipc = fs.readFileSync(path.join(root, 'main/ipc.mjs'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const dialog = ipc.slice(ipc.indexOf("ipcMain.handle('zero:choose-folder'"), ipc.indexOf("ipcMain.handle('zero:choose-folder'") + 600);

describe('the window the Choose a folder row opens', () => {
  it('is titled for picking a project folder', () => {
    expect(dialog).toContain("title: 'Pick a project folder'");
    expect(dialog).toContain("buttonLabel: 'Use this folder'");
  });

  it('no longer asks the question the screen stopped asking', () => {
    expect(ipc).not.toContain('Where is its code?');
    expect(COPY.folderHead).toBe('Pick a folder for your first project.');
  });

  it('and the title and the screen agree about what is being picked', () => {
    // Both say folder, and neither says code: the words on the two surfaces
    // are read one after the other, a second apart.
    expect(dialog).toMatch(/title: '[^']*folder'/);
    expect(COPY.folderHead.toLowerCase()).toContain('folder');
  });
});
