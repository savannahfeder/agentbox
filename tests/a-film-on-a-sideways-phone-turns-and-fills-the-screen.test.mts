// A FILM ON A SIDEWAYS PHONE TURNS AND FILLS THE SCREEN.
//
// "I watch a video and turn my phone on the side it doesn't extend/rotate and
// fill up the screen" (2026-11-08, the phone app). The app's config said
// `orientation: 'portrait'`, which writes portrait alone into Info.plist, and
// iOS caps every view controller by that list, the full-screen player
// included: expo-video asks for every orientation (FullscreenOrientation
// `default` is `.all`) and iOS refused it. Read from the installed native code;
// not run on a phone, as no iPhone or simulator was at hand.
//
// So the app allows every orientation, its screens hold themselves upright
// (react-native-screens' `orientation`), and only a film turns: the full-screen
// player, and the film's own screen, which drops its bar and margins when wide.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');

describe('a film on a sideways phone', () => {
  it('is not capped to portrait by the app itself', () => {
    const config = read('app.config.ts');
    expect(config).not.toMatch(/orientation: 'portrait'/);
    expect(config).toMatch(/orientation: 'default'/);
  });

  it('leaves every other screen upright, in the app and in its settings', () => {
    for (const layout of ['src/app/_layout.tsx', 'src/app/settings/_layout.tsx']) {
      expect(read(layout)).toMatch(/<Stack\b[^>]*screenOptions=\{\{[^}]*orientation: 'portrait'/);
    }
  });

  it('turns on the film screen and, when wide, gives the film the whole screen', () => {
    const file = read('src/app/file.tsx');
    expect(file).toMatch(/<Stack\.Screen options=\{\{ orientation: 'default' \}\} \/>/);
    expect(file).toMatch(/const wide = film && width > height/);
    expect(file).toMatch(/\{!wide && <TopBar/);
  });

  it('does not let a picture or a document turn', () => {
    const file = read('src/app/file.tsx');
    expect(file).toMatch(/\{film && <Stack\.Screen options=\{\{ orientation: 'default' \}\} \/>\}/);
  });
});
