// A FILM ON THE PHONE APP PLAYS IN THE PHONE'S OWN PLAYER.
//
// "I tried a different thread that has an MP4 and it just doesn't seem to be
// loading at all. It just stays on this little icon with an external circle
// and a little white square in the middle ... Clicking on anything doesn't
// seem to do anything" (2026-10-23, the phone app in Expo Go on an iPhone).
// The film played inside a web page (react-native-webview) with JavaScript
// switched off, and on iOS the video controls WebKit draws inside a page are
// themselves scripted. Not reproduced off a phone: no iPhone or simulator was
// at hand. The app now plays a film with expo-video, the phone's own player,
// which Expo Go carries (expo-video ~58.0.12 in Expo 58's bundled modules),
// with its own controls, its own spinner while the film loads, and full screen.
// The browser preview keeps the page's own <video> (Player.web.tsx).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const player = read('src/ui/Player.tsx');

describe('a film on the phone', () => {
  it('plays in the phone\'s own player, with its own controls and full screen', () => {
    expect(player).toMatch(/from 'expo-video'/);
    expect(player).toMatch(/<VideoView\b/);
    expect(player).toMatch(/nativeControls/);
    expect(player).toMatch(/fullscreenOptions=\{\{ enable: true/);
  });

  it('is not drawn inside a web page any more', () => {
    expect(player).not.toMatch(/WebView/);
  });

  it('is a package Expo Go carries', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies['expo-video']).toMatch(/^~?58\./);
  });

  it('keeps the page\'s own player in the browser preview', () => {
    expect(read('src/ui/Player.web.tsx')).toMatch(/<video controls/);
  });
});
