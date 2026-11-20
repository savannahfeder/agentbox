// A HELPER SEES THE ASK TO THEM AND THE OWNER'S OWN PICKER (2026-11-20).
//
// Second rerun and its design review:
// - The helper's page drew the options twice: the message's own list, and
//   new pill buttons under it. The owner's page draws them once, in the
//   numbered option picker with 1-9 to pick. One component everywhere.
// - The helper's header read "Waits on Lena, it starts again when that is
//   done": the owner's wait, shown to the person waited on. It now says the
//   ask ("Theo asked you to help with this step"), then "Sent to Theo's
//   agent" once they answer, until the owner's real state takes over.
// - The owner's own In progress row said "Nothing running · Try again" for a
//   thread that is only waiting on a teammate, which reads as a failure.
// - Waits on… still said "It moves to Later" though an ask stays in In
//   progress.
// Measured on the live-line rules and by reading the pages.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { askedPatch } from '../shared/thread-ask.mts';
import { liveLine } from '../renderer/src/live-line.ts';
import { offersTryAgain } from '../renderer/src/try-again.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const at = 1_000_000;
const asked = {
  id: 'w-1', product: 'api', status: 'open', labels: ['founder'], title: 'Overlaps', result: 'Which approach?\n\n## Options\n1. In memory\n2. Database',
  ...askedPatch(['p-lena'], 'Asked Lena for help with this step', at, 'help'),
  wrote: { result: { source: 'agent', ts: at - 10 }, blockedBy: { source: 'founder', ts: at }, asked: { source: 'founder', ts: at } },
};

describe('the owner\'s row while a teammate has the step', () => {
  it('says nothing about agents, and offers no Try again', () => {
    expect(liveLine(asked as never, { inProgress: true, queued: [], now: at + 1 })).toBeNull();
    expect(offersTryAgain(asked as never, { inProgress: true, queued: [], now: at + 1 })).toBe(false);
  });
});

describe('the helper\'s page', () => {
  const page = read('renderer/src/threads/TeammateThread.tsx');
  it('offers the step in the owner\'s option picker, once, with 1-9 to pick', () => {
    expect(page).toContain('<OptionsOffer');
    expect(page).not.toContain('tp-options');
    expect(page).toContain('stripOptionsSection(');
    expect(page).toMatch(/\/\^\[1-9\]\$\/\.test\(e\.key\)/);
  });
  it('heads the page with the ask to them, then that it went', () => {
    expect(page).toContain('helping ? `asked you to help with this step`');
    expect(page).toContain('<div className="one-by"><Face person={person} /><span>{owner}</span><em>{askWords}</em></div>');
    expect(page).toContain("`Sent to ${owner}'s agent`");
  });
});

describe('Waits on…', () => {
  it('no longer promises Later', () => {
    const menu = read('renderer/src/threads/ThreadMenu.tsx');
    expect(menu).not.toContain('It moves to Later and comes back when that is done.');
    expect(menu).toContain("'It comes back to you when that is done.'");
  });
});
