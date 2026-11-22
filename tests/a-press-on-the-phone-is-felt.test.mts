// A PRESS ON THE PHONE IS FELT.
//
// What broke (phone review, 2026-11-21): nothing on the phone app answered a
// finger but a change of opacity, so sends, picks and swipes felt like taps on
// glass. `feel` gives the three kinds of touch, and does nothing where the
// phone has no motor (the web preview) or the build predates the module.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const feel = fs.readFileSync('mobile/src/lib/feel.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('mobile/package.json', 'utf8'));

describe('feel', () => {
  it('uses Expo\'s haptics module', () => {
    expect(pkg.dependencies['expo-haptics']).toBeTruthy();
    expect(feel).toMatch(/require\('expo-haptics'\)/);
  });
  it('has a tick for a pick, a tap for a press, and a thud for a send', () => {
    expect(feel).toMatch(/pick: \(\) =>[^\n]*selectionAsync/);
    expect(feel).toMatch(/tap: \(\) =>[^\n]*impactAsync\([^)]*Light/);
    expect(feel).toMatch(/thud: \(\) =>[^\n]*impactAsync\([^)]*Medium/);
  });
  it('never throws on the web or on a build without the module', () => {
    expect(feel).toMatch(/Platform\.OS !== 'web'/);
    expect(feel).toMatch(/catch/);
  });
});

const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const form = fs.readFileSync('mobile/src/ui/NewThreadForm.tsx', 'utf8');
const thread = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
const between = (src: string, from: string) => src.slice(src.indexOf(from), src.indexOf('\n}\n', src.indexOf(from)));

describe('where the phone is felt', () => {
  it('ticks on every pick in a sheet and on a tab', () => {
    expect(between(parts, 'export function SheetRow(')).toMatch(/onPress=\{\(\) => \{ feel\.pick\(\); onPress\(\); \}\}/);
    expect(between(inbox, 'function Tabs(')).toMatch(/onPress=\{\(\) => \{ if \(on !== t\.id\) feel\.pick\(\); pick\(t\.id\); \}\}/);
  });
  it('thuds on a send, new thread and reply alike', () => {
    expect(form).toMatch(/const send = \(later\?: Choices\) => \{ feel\.thud\(\);/);
    expect(thread).toMatch(/const sendByHand = \(\) => \{ feel\.thud\(\);/);
  });
  it('gives the new-thread button a press you can see, a spring down and back', () => {
    expect(parts).toMatch(/export function Squish\(/);
    expect(between(parts, 'export function Squish(')).toMatch(/Animated\.spring\(/);
    expect(inbox).toMatch(/<Squish accessibilityLabel="New thread"/);
  });
});
