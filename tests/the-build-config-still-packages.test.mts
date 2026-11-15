// PACKAGE.JSON'S `build` BLOCK TAKES NO COMMENTS, AND THE LAST ONE STOPPED
// AGENTBOX SHIPPING.
//
// Found on 2026-08-27 while packing the rest build. A `"//"` key had been added
// inside `build.mac` on main that day to explain the usage strings.
// electron-builder 26.15.3 validates that object against a schema with no
// unknown keys allowed, so `npm run pack` and `npm run release` both died
// before building anything:
//
//   ⨯ Invalid configuration object. electron-builder 26.15.3 has been
//     initialized using a configuration object that does not match the API
//     schema.  - configuration.mac should be one of these:
//
// Nothing about the app was wrong. It was the comment. And nothing in the suite
// noticed, because packaging is the one step no test ran, so main sat unable to
// produce a build with a green suite above it.
//
// This is the cheap half of that lesson: the shape of the config, checked in
// milliseconds. It cannot prove a build succeeds. It can prove the thing that
// broke this one is not back.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Every object electron-builder validates strictly. A note in any of them is
// the same failure with a different word in the message.
const VALIDATED = [
  ['build', pkg.build],
  ['build.mac', pkg.build?.mac],
  ['build.dmg', pkg.build?.dmg],
  ['build.directories', pkg.build?.directories],
];

describe('the packaging config electron-builder actually accepts', () => {
  for (const [where, obj] of VALIDATED) {
    it(`has no explanatory key in ${where}`, () => {
      // extendInfo is the exception and is not in this list: it is copied
      // verbatim into Info.plist, so its keys are Apple's and not a schema's.
      const notes = Object.keys(obj ?? {}).filter((k) => k.startsWith('//'));
      expect(notes, `${where} carries ${notes.join(', ')}, which fails the build`).toEqual([]);
    });
  }

  it('still says why the usage strings are there, somewhere a comment is legal', () => {
    // The reasoning is not lost, it moved. If this fails, someone deleted the
    // note instead of relocating it, and the next person to see those strings
    // will not know they are deliberate.
    const release = fs.readFileSync(path.join(root, 'scripts/release.mjs'), 'utf8');
    expect(release).toContain('extendInfo');
    expect(release).toContain('a tester');
  });

  it('keeps every sentence macOS shows in its own permission panels', () => {
    // Deleting the comment must not take the strings it was explaining with it.
    // Without them the panel is the system's bare wording with no reason on it,
    // which is what a tester walked into.
    for (const key of [
      'NSDesktopFolderUsageDescription', 'NSDocumentsFolderUsageDescription',
      'NSDownloadsFolderUsageDescription', 'NSRemovableVolumesUsageDescription',
      'NSAppleEventsUsageDescription',
    ]) expect(pkg.build?.mac?.extendInfo?.[key], key).toBeTruthy();
  });

  // Nothing may claim to unpack a file the repository does not have.
  it('unpacks nothing that is not in the repository', () => {
    for (const entry of pkg.build?.asarUnpack ?? []) {
      if (entry.includes('*')) continue;
      expect(fs.existsSync(path.join(root, entry)), entry).toBe(true);
    }
  });

});
