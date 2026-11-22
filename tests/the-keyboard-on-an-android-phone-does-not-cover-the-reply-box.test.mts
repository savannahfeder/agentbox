// THE KEYBOARD COVERED THE REPLY BOX ON AN ANDROID PHONE (2026-11-21): tapping
// Reply on a thread raised the keyboard over the whole box and its Send.
// Expo apps on Android are edge-to-edge, so the window no longer shrinks for
// the keyboard, and every KeyboardAvoidingView here had `behavior` only on iOS.
// Measured on the Android 35 emulator with uiautomator: the box sat under the keyboard.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx$/.test(e.name) ? [p] : [];
  });

const avoiders = files('mobile/src').flatMap((f) =>
  (fs.readFileSync(f, 'utf8').match(/<KeyboardAvoidingView\b[^>]*>/g) ?? []).map((tag) => ({ f, tag })),
);

describe('a view that keeps out of the keyboard', () => {
  it('is used on the phone', () => {
    expect(avoiders.length).toBeGreaterThan(0);
  });
  it('pads on Android as well as iOS', () => {
    const iosOnly = avoiders.filter(({ tag }) => !/behavior="padding"/.test(tag)).map(({ f }) => f);
    expect(iosOnly).toEqual([]);
  });
});
