// A NEW WINDOW WEARS THE ORANGE OR GREEN SKY (w-1bf65f4322, 2026-11-10).
//
// With no sky picked, the app wore plain Dark or plain Light, and the founder,
// shown Home before it shipped: "make sure default is dark orange theme for
// dark and then the green light for light; plain dark looks bad". Measured by
// reading home-settings: an empty `zero.sky.theme` meant no sky at all.
//
// Now nothing stored means the sky that matches the window: Dark orange sky
// when it is dark, Light green sky when it is light. A sky picked stays picked,
// and picking plain Light, Dark or Match system is remembered as plain, so the
// default never takes back a choice somebody made.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { PLAIN, shownSkyId, skyTheme } from '../renderer/src/home/sky.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const homeSettings = fs.readFileSync(new URL('../renderer/src/home/home-settings.ts', import.meta.url), 'utf8');

describe('with no sky picked', () => {
  it('a dark window wears Dark orange sky', () => {
    expect(skyTheme(shownSkyId(null, true))?.name).toBe('Dark orange sky');
  });
  it('a light window wears Light green sky', () => {
    expect(skyTheme(shownSkyId(null, false))?.name).toBe('Light green sky');
  });
});

describe('a choice somebody made', () => {
  it('keeps the sky they picked, dark or light', () => {
    expect(shownSkyId('dusk', true)).toBe('dusk');
    expect(shownSkyId('dusk-light', false)).toBe('dusk-light');
  });
  it('keeps plain Light, Dark or Match system plain', () => {
    expect(shownSkyId(PLAIN, true)).toBeNull();
    expect(shownSkyId(PLAIN, false)).toBeNull();
  });
  it('treats a sky that no longer exists as nothing picked', () => {
    expect(shownSkyId('ember-light', true)).toBe('ember');
  });
});

describe('the app', () => {
  // Match system follows the Mac, so it wears the default sky for whichever
  // way the Mac is set; only plain Light or plain Dark is kept plain.
  it('remembers picking plain Light or Dark as plain, and Match system as no pick', () => {
    expect(app).toMatch(/const chooseLook = useCallback\(\(next: Look\) => \{ setHomeSetting\(SKY_THEME_KEY, next === 'match' \? null : PLAIN\)/);
  });
  it('ticks Match system in Settings, not the sky it chose, unless a sky was picked', () => {
    const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
    expect(settings).toContain("const skyOn = skies && (homeSet.picked || look !== 'match') ? homeSet.skyTheme : null;");
  });
  it('reads the sky shown, not the raw setting, everywhere', () => {
    expect(homeSettings).toMatch(/const skyTheme = shownSkyId\(saved, darkNow\(\)\)/);
  });
});
