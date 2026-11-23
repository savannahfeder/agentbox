// AN ASKED THREAD SAYS WHERE IT WENT, AND A HALF-WRITTEN NOTE STAYS (w-f702d60afe, 2026-11-21).
//
// A review of the hand-off flow for the founder's onboarding:
// - After asking Theo, the thread left Needs you for In progress and the toast
//   said only "Asked Theo to help. It stays yours."
// - A press outside the ask sheet closed it and threw the note away; people
//   click into the thread to re-read the step mid-note.
// - The person asked saw Close task beside Hand back, a second way to end an
//   ask that sends nothing back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('asking a teammate', () => {
  it('says the thread waits in In progress until they hand it back', () => {
    expect(read('App.tsx')).toContain('It waits in In progress until ${first} hands it back.');
  });
  it('keeps the sheet open on a press outside while its note has words', () => {
    expect(read('threads/ThreadMenu.tsx')).toContain("if ([...(wrap.current?.querySelectorAll('textarea') ?? [])].some((t) => t.value.trim())) return;");
  });
  it('offers the person asked no Close task beside Hand back', () => {
    expect(read('components/Focus.tsx')).toContain('onCloseTask={canFinish && givenTask && !item.ask ? onCloseTask ?? null : null}');
  });
});
