// A PHONE CAN PUT A THREAD OFF, AND IS NOT OFFERED THINGS IT CANNOT DO.
//
// What broke (QA batch 005, F-117 and F-118, on the hosted phone site at
// 360-390px): the thread's ⋯ menu offered "Open terminal ⌘J" — a phone has no
// terminal and no ⌘J — and offered no way at all to put a thread off, so the
// Later tab could never be filled from a phone while the laptop has done it
// with L since the beginning. Measured off the menu's own row list, which is
// the one place its words are decided.
import { describe, it, expect } from 'vitest';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';

const rows = (extra) => threadMenuRows({ change: false, terminal: 'closed', finish: true, ...extra });

describe('Later', () => {
  it('is a row on a phone, just above Mark done', () => {
    expect(rows({ later: true }).map((r) => r.id)).toEqual(['terminal', 'later', 'done']);
    expect(rows({ later: true }).find((r) => r.id === 'later')).toEqual({ id: 'later', label: 'Later', key: null });
  });

  // The boundary: a key printed here would teach a phone a key it has not got.
  it('names no key, because the menu is how a phone does it', () => {
    expect(rows({ later: true }).find((r) => r.id === 'later').key).toBeNull();
  });

  // The case that must NOT match: the laptop's menu is unchanged, because L
  // already does this from anywhere on the page.
  it('is not a row anywhere else', () => {
    expect(rows().map((r) => r.id)).toEqual(['terminal', 'done']);
    expect(rows({ later: false }).map((r) => r.id)).toEqual(['terminal', 'done']);
  });
});

describe('the terminal', () => {
  it('is still offered where there is one', () => {
    expect(rows({ terminal: 'open' }).map((r) => r.label)).toEqual(['Hide terminal', 'Mark done']);
  });

  // A phone is given `terminal: null` by Focus, which is the same door a
  // conversation with a person goes through.
  it('is no row at all when the screen drawing it has none', () => {
    expect(rows({ terminal: null, later: true }).map((r) => r.id)).toEqual(['later', 'done']);
  });
});
