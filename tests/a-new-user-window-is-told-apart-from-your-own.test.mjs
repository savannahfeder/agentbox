// TWO AGENTBOXES, THE SAME SIZE, IN THE SAME PLACE, WITH THE SAME TITLE.
//
// Reported from the Linux box, 2026-10-23: Ctrl+K, "Open Agentbox as a new
// user", and the second copy opened exactly over the first one — same bounds,
// same "Agentbox" in the title bar — so the two were easy to confuse and the
// screenshots of the session could not be told apart either.
//
// A throwaway copy already knows it is one (`runningAsAFreshUser`, off the env
// `freshEnv` writes), so it says so in its title and stands a window's shoulder
// clear of the one it was opened from.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshEnv, runningAsAFreshUser } from '../shared/fresh-user-home.mjs';
import { newUserWindow } from '../main/new-user-window.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'main/main.mjs'), 'utf8');

const screen = { x: 0, y: 0, width: 1920, height: 1080 };

describe('the window a throwaway copy opens', () => {
  it('says whose window it is in the title', () => {
    expect(newUserWindow({ fresh: true, name: 'Agentbox', screen }).title).toBe('Agentbox (new user)');
  });

  it('stands clear of the window it was opened from', () => {
    const { x, y } = newUserWindow({ fresh: true, name: 'Agentbox', screen, width: 1440, height: 900 });
    // Centred is x 240, y 90 on this screen. The second copy is down and across
    // from there, and its title bar is still on the screen.
    expect(x).toBeGreaterThan(240);
    expect(y).toBeGreaterThan(90);
    expect(x + 1440).toBeLessThanOrEqual(screen.width);
    expect(y + 900).toBeLessThanOrEqual(screen.height);
  });

  it('leaves her own window centred and titled as it always was', () => {
    const own = newUserWindow({ fresh: false, name: 'Agentbox', screen, width: 1440, height: 900 });
    expect(own.title).toBe('Agentbox');
    expect(own.x).toBeUndefined();
    expect(own.y).toBeUndefined();
  });

  it('offsets nothing it cannot fit, rather than putting a window off screen', () => {
    const tight = newUserWindow({ fresh: true, name: 'Agentbox', screen: { x: 0, y: 0, width: 1440, height: 900 }, width: 1440, height: 900 });
    expect(tight.title).toBe('Agentbox (new user)');
    expect(tight.x).toBeUndefined();
    expect(tight.y).toBeUndefined();
  });

  // THE CASE THAT MUST NOT MATCH: a copy in her own home is her own window.
  it('knows a throwaway copy from the real one', () => {
    expect(runningAsAFreshUser(freshEnv('/tmp/agentbox-fresh-user/x', {}, {}))).toBe(true);
    expect(runningAsAFreshUser({ HOME: '/Users/someone' })).toBe(false);
  });

  it('is what the window is actually built with', () => {
    expect(main).toContain("import { newUserWindow } from './new-user-window.mjs'");
    expect(main).toMatch(/window = new BrowserWindow\(\{[\s\S]{0,400}\.\.\.newUserWindow\(/);
  });

  // AND THE TITLE HAS TO SURVIVE THE PAGE LOADING. Measured in the real app on
  // Linux, 2026-10-24: the copy stood 48px clear, so it knew it was a copy, and
  // its title bar still said "Agentbox". renderer/index.html carries
  // `<title>Agentbox</title>`, and Electron hands the window's title to the
  // page's the moment it loads, which took the window option straight back out.
  it('holds the title the window was given against the page’s own', () => {
    expect(main).toMatch(/page-title-updated/);
    expect(main).toMatch(/page-title-updated[\s\S]{0,200}preventDefault/);
  });
});
