// Home and the sky themes left Alpha features (w-1bf65f4322). Before, both
// hung on one switch kept in localStorage (`zero.alpha.home`), so anyone who
// had not found Alpha features opened on the Inbox and saw only Light, Dark
// and Match system in Appearance. Measured by reading the switch's every use:
// App.tsx gated Home, the sky, Command-K's themes and the first run's themes
// on it, and Settings drew the sky tiles only while it was on.
//
// Read from the source, since the wiring is in App.tsx and Settings.tsx.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const settings = read('renderer/src/components/Settings.tsx');
const homeSettings = read('renderer/src/home/home-settings.ts');

describe('Home and the sky themes, out of Alpha features', () => {
  it('have no switch left to read', () => {
    expect(homeSettings).not.toContain('zero.alpha.home');
    expect(homeSettings).not.toContain('HOME_KEY');
    for (const src of [app, settings]) {
      expect(src).not.toMatch(/homeSet\.on\b/);
      expect(src).not.toContain('HOME_KEY');
    }
  });

  it('are not offered as an alpha feature any more', () => {
    const alpha = settings.slice(settings.indexOf("pane === 'alpha' && ("), settings.indexOf("pane === 'general' && ("));
    expect(alpha).toContain('label="Rooms"');
    expect(alpha).not.toContain('label="Home"');
  });

  it('open the app on Home, and offer Home in the sidebar, on a computer but not on a phone', () => {
    expect(app).toMatch(/const \[homeOpen, setHomeOpen\] = useState\(homeOn\);/);
    expect(app).toMatch(/const homeOn = !onPhone\(\);/);
    expect(app).toMatch(/onHome=\{homeOn \? goHome : undefined\}/);
  });

  it('offer every sky beside Light, Dark and Match system in Settings, Command-K and the first run', () => {
    expect(settings).toMatch(/\{skies && SKY_THEMES\.map\(\(k\) => <SkyTile/);
    expect(app).toMatch(/skyThemes=\{homeOn \? SKY_THEMES\.map/);
    expect(app).toMatch(/skies=\{homeOn\}/);
  });
});
