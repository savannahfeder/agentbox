// ⌘K can retag priority, because ⌘K is the searchable form of every chord.
//
// She had the palette open on a copy of the app row with "high" typed into it and an
// empty list under her hands.
//
// It was not broken, it was absent. Priority had a chord (⌘1..4) and two
// pickers (the composer, the reply dock) and no palette entry at all, against
// the palette's own stated contract: "the palette is the searchable form of
// every chord, and the reason no action needs its own memorized key". A chord
// with no entry is a feature only someone who has memorized it can reach, and
// while the palette is open the chord is deliberately dead (`!modal`), so the
// one place she looked for it was the one place it could not be.
//
// The vocabulary is the same one the pickers use. Priority.tsx exists because
// two lists of the same four words drifted apart once already ("medium" vs
// "Medium"); the chord in App.tsx was quietly a third copy, hardcoded as
// [9, 7, 5, 2] and ['urgent', 'high', 'medium', 'low'], and this would have
// been the fourth.

import { describe, it, expect } from 'vitest';
import { PRIORITIES, priorityCommands, priorityIdOf, priorityValueOf } from '../renderer/src/priority';

const item = (priority) => ({ id: 'w-180a4eb28d', product: 'harbour-new', priority });

describe('the vocabulary is one list', () => {
  it('names the four levels the pickers use', () => {
    expect(PRIORITIES.map((p) => p.id)).toEqual(['urgent', 'high', 'medium', 'low']);
    expect(PRIORITIES.map((p) => p.value)).toEqual([9, 7, 5, 2]);
  });

  // The chord is gone from all three places it fired, and no list here carries
  // a key to advertise. This is a test rather than a comment because the
  // natural repair for "the drawer looks bare" is to put the hint column back.
  it('carries no key, because there is no chord left to name', () => {
    for (const p of PRIORITIES) expect(p).not.toHaveProperty('key');
  });

  it('round-trips a level through the value it stores', () => {
    for (const p of PRIORITIES) expect(priorityIdOf(priorityValueOf(p.id))).toBe(p.id);
  });
});

describe('what ⌘K offers for one row', () => {
  it('offers every level, so typing "high" finds one', () => {
    const cmds = priorityCommands([item(5)]);
    expect(cmds).toHaveLength(4);
    const hit = cmds.filter((c) => c.label.toLowerCase().includes('high'));
    expect(hit).toHaveLength(1);
    expect(hit[0].value).toBe(7);
  });

  it('is findable by the word "priority" too', () => {
    const cmds = priorityCommands([item(5)]);
    expect(cmds.every((c) => c.label.toLowerCase().includes('priority'))).toBe(true);
  });

  // A hint pointing at a chord that no longer fires is worse than no hint: it
  // teaches a key that does nothing.
  it('advertises no key, because ⌘1..4 no longer fires', () => {
    for (const c of priorityCommands([item(5)])) expect(c.keyHint).toBeUndefined();
  });

  it('says which level the row is already on', () => {
    const cmds = priorityCommands([item(9)]);
    const current = cmds.filter((c) => c.current);
    expect(current).toHaveLength(1);
    expect(current[0].value).toBe(9);
    expect(current[0].label).toContain('current');
  });

  it('reads an untagged row as medium, the way the row itself renders', () => {
    for (const missing of [undefined, null]) {
      expect(priorityCommands([item(missing)]).find((c) => c.current)?.value).toBe(5);
    }
  });
});

describe('what ⌘K offers for a selection', () => {
  it('counts the rows it would retag', () => {
    const cmds = priorityCommands([item(5), item(7), item(9)]);
    expect(cmds.every((c) => c.label.includes('3 selected'))).toBe(true);
  });

  it('claims no current level when the selection disagrees', () => {
    // Three rows on three levels have no "current" between them, and marking
    // one would be a plain lie about the other two.
    expect(priorityCommands([item(5), item(7), item(9)]).some((c) => c.current)).toBe(false);
  });

  it('marks the shared level when they do agree', () => {
    const cmds = priorityCommands([item(7), item(7)]);
    expect(cmds.find((c) => c.current)?.value).toBe(7);
  });
});

describe('nothing to act on', () => {
  it('offers nothing rather than a command that would retag the void', () => {
    expect(priorityCommands([])).toEqual([]);
  });
});

// The row that should not have been there.
//
// Found while checking the entries above actually render: typing "high" listed
// "Close This Task" above "Priority: High". The palette keys its rows by command
// id, and two lists that do not know about each other both used 'done' — the
// "Closed" view and the "Close This Task" action. Under one key React kept the
// stale row alive through the filter, so a command that did not match sat under
// her return key. The ids are namespaced now; this makes the class impossible,
// because the next two lists to meet there will not know about each other
// either.

import { commandKeys } from '../renderer/src/palette-keys';

describe('keying the palette rows', () => {
  it('gives colliding ids distinct keys', () => {
    const keys = commandKeys([{ id: 'done' }, { id: 'reply' }, { id: 'done' }]);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toBe('done');
  });

  it('leaves ordinary ids exactly as they are', () => {
    const ids = ['approve', 'done', 'reply', 'priority-urgent', 'priority-high'];
    expect(commandKeys(ids.map((id) => ({ id })))).toEqual(ids);
  });

  it('holds for an empty palette', () => {
    expect(commandKeys([])).toEqual([]);
  });
});
