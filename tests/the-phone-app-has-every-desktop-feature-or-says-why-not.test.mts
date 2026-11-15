// THE PHONE APP HAS EVERY DESKTOP FEATURE, OR SAYS WHY NOT.
//
// Asked for on 2026-11-08: the phone app 1:1 with the desktop, and kept that
// way. Nothing held the two together, so the desktop gained features the phone
// never heard of. Read against the code that day, the desktop offered 131
// features by name (⌘K rows, thread commands, Settings pages and the rows
// Settings search finds) and the phone lacked or only half had about 50.
//
// mobile/parity.mjs now names every one. This fails when the desktop gains a
// feature the ledger does not place, when a "the phone has it" claim no longer
// matches the phone's code, and when the count still to do moves without
// STILL_TO_DO moving with it, so it only ever goes down.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { DESKTOP_SOURCES, desktopFeatures, parityProblems, toDo } from '../scripts/lib/desktop-features.mjs';
import { PARITY, STILL_TO_DO } from '../mobile/parity.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Written out so a change to any of them runs this test before a push
// (scripts/lib/tests-that-read.mjs finds a test by the paths it names).
const READS_ON_THE_DESKTOP = [
  'renderer/src/components/Palette.tsx',
  'renderer/src/palette-rows.ts',
  'renderer/src/App.tsx',
  'renderer/src/thread-commands.ts',
  'renderer/src/run-now.ts',
  'renderer/src/priority.ts',
  'renderer/src/thread-model-commands.ts',
  'renderer/src/settings-search.ts',
];
const READS_ON_THE_PHONE = [
  'mobile/src/app/index.tsx',
  'mobile/src/app/settings/project/[slug].tsx',
  'mobile/src/app/thread/[product]/[id].tsx',
  'mobile/src/lib/actions.ts',
  'mobile/src/lib/palette.ts',
  'mobile/src/lib/rooms-settings.ts',
  'mobile/src/lib/thread-offers.ts',
  'mobile/src/lib/unread.ts',
  'mobile/src/ui/Filters.tsx',
  'mobile/src/ui/Pickers.tsx',
  'mobile/src/ui/SettingsHome.tsx',
  'mobile/src/ui/SettingsPages.tsx',
  'mobile/src/ui/TeamPage.tsx',
  'mobile/src/ui/ThreadMenu.tsx',
];

describe('the desktop and the phone', () => {
  it('are read from the files this test names', () => {
    expect([...DESKTOP_SOURCES].sort()).toEqual([...READS_ON_THE_DESKTOP].sort());
    const phone = [...new Set(Object.values(PARITY).map((e) => e.phone).filter(Boolean))];
    expect(phone.sort()).toEqual([...READS_ON_THE_PHONE].sort());
  });

  it('agree, feature by feature', () => {
    expect(parityProblems(desktopFeatures(root), PARITY, { read, stillToDo: STILL_TO_DO })).toEqual([]);
  });

  it('are read from every place the desktop lists its features', () => {
    const keys = [...desktopFeatures(root).keys()];
    for (const kind of ['palette:', 'thread:', 'settings-page:', 'settings:']) {
      expect(keys.filter((k) => k.startsWith(kind)).length, kind).toBeGreaterThan(3);
    }
    // One of each shape the reader has to understand.
    expect(keys).toEqual(expect.arrayContaining([
      'palette:new-thread', 'palette:cloud-toggle', 'palette:rank-*', 'palette:view-done', 'palette:theme-dark',
      'thread:done', 'thread:move-*', 'thread:rename', 'thread:run-now', 'thread:priority-*', 'thread:model-*',
      'settings-page:running', 'settings:running/How many run at once',
    ]));
  });

  it('never counts a label, a hint or an option value as a feature', () => {
    const keys = [...desktopFeatures(root).keys()];
    expect(keys).not.toContain('thread:urgent');
    expect(keys.some((k) => /\s/.test(k.split(':')[1]) && !k.startsWith('settings:'))).toBe(false);
  });
});

describe('the check', () => {
  const features = new Map([['palette:a', 'A.tsx'], ['thread:b', 'B.tsx']]);
  const files = { 'phone.tsx': "label: 'A'" };
  const readFake = (f) => { if (!(f in files)) throw new Error('no file'); return files[f]; };
  const ok = { 'palette:a': { phone: 'phone.tsx', find: "label: 'A'" }, 'thread:b': { desktopOnly: 'a terminal on the computer' } };

  it('passes a ledger that places everything', () => {
    expect(parityProblems(features, ok, { read: readFake, stillToDo: 0 })).toEqual([]);
  });

  it('fails on a desktop feature the ledger does not place', () => {
    const more = new Map([...features, ['thread:c', 'C.tsx']]);
    expect(parityProblems(more, ok, { read: readFake, stillToDo: 0 })).toEqual([expect.stringContaining('The desktop has thread:c (C.tsx)')]);
  });

  it('fails on an entry the desktop no longer has', () => {
    expect(parityProblems(features, { ...ok, 'thread:gone': { desktopOnly: 'a terminal on the computer' } }, { read: readFake, stillToDo: 0 }))
      .toEqual([expect.stringContaining('thread:gone, which the desktop no longer has')]);
  });

  it('fails when the phone file no longer holds what the entry claims, or is gone', () => {
    expect(parityProblems(features, { ...ok, 'palette:a': { phone: 'phone.tsx', find: "label: 'B'" } }, { read: readFake, stillToDo: 0 }))
      .toEqual([expect.stringContaining('does not')]);
    expect(parityProblems(features, { ...ok, 'palette:a': { phone: 'gone.tsx', find: 'x' } }, { read: readFake, stillToDo: 0 }))
      .toEqual([expect.stringContaining('which does not exist')]);
  });

  it('wants one shape per entry and a real reason for desktop only', () => {
    expect(parityProblems(features, { ...ok, 'thread:b': { desktopOnly: 'a terminal on the computer', missing: 'x' } }, { read: readFake, stillToDo: 1 }))
      .toEqual([expect.stringContaining('must be one of phone, desktopOnly or missing')]);
    expect(parityProblems(features, { ...ok, 'thread:b': { desktopOnly: 'mac' } }, { read: readFake, stillToDo: 0 }))
      .toEqual([expect.stringContaining('needs a reason')]);
  });

  it('holds the count still to do in both directions', () => {
    const gap = { ...ok, 'thread:b': { missing: 'a setting' } };
    expect(toDo(gap)).toEqual(['thread:b']);
    expect(parityProblems(features, gap, { read: readFake, stillToDo: 1 })).toEqual([]);
    expect(parityProblems(features, gap, { read: readFake, stillToDo: 0 })).toEqual([expect.stringContaining('more than STILL_TO_DO')]);
    expect(parityProblems(features, ok, { read: readFake, stillToDo: 1 })).toEqual([expect.stringContaining('Lower STILL_TO_DO')]);
    const part = { ...ok, 'palette:a': { ...ok['palette:a'], still: 'no filter' } };
    expect(toDo(part)).toEqual(['palette:a']);
  });
});
