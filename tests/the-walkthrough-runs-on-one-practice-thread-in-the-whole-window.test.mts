// THE WALKTHROUGH RUNS ON ONE PRACTICE THREAD, IN THE WHOLE WINDOW (w-fbe5e95dea, 2026-11-10).
//
// The founder on the walkthrough beside Home: its step list on the left pulled
// her eye one way while the gold tip in the app pulled it another; it ran on
// her real threads (pressing 1 answered a real agent); its first task looked
// like real work; writing back took her to Home with nothing left to mark
// done; and the app's sidebar was folded to icons. Handing over to the old
// practice tutorial instead was rejected: "we used the gold components". Now
// the gold tips run on Home with no list beside them and the sidebar open,
// on one practice thread that nothing real is behind, which stays open after
// a reply and goes away when the walkthrough ends.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readTour, startTour, withPractice, practiceReplied, isTourPractice } from '../renderer/src/tour.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const body = (name: string) => app.slice(app.indexOf(`const ${name} = useCallback`), app.indexOf('\n  }, [', app.indexOf(`const ${name} = useCallback`)));
const memory = (seed: Record<string, string> = {}) => { const m = new Map(Object.entries(seed)); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe("the walkthrough's practice thread", () => {
  it('is carried by the tour, and survives a reload', () => {
    const t = withPractice(startTour(), { slug: 'practice', item: 'w-1' });
    const s = memory();
    s.setItem('zero.tour', JSON.stringify(t));
    expect(readTour(s)?.practice).toEqual({ slug: 'practice', item: 'w-1', replies: 0 });
  });
  it('counts the replies sent to it', () => {
    const t = practiceReplied(withPractice(startTour(), { slug: 'practice', item: 'w-1' }));
    expect(t.practice?.replies).toBe(1);
  });
  it('is the thread the walkthrough is about, and no other', () => {
    const t = withPractice(startTour(), { slug: 'practice', item: 'w-1' });
    expect(isTourPractice(t, { product: 'practice', id: 'w-1' })).toBe(true);
    expect(isTourPractice(t, { product: 'sandbox', id: 'w-2' })).toBe(false);
    expect(isTourPractice(startTour(), { product: 'practice', id: 'w-1' })).toBe(false);
  });
});

describe('the end of the setup', () => {
  it('starts the gold walkthrough on Home with a practice project of its own', () => {
    const fn = body('finishFresh');
    expect(fn).toMatch(/setTour\(startTour\(\)\)/);
    expect(fn).toMatch(/setHomeOpen\(homeOn\)/);
    expect(fn).toMatch(/api\.firstRunPractice\(\{ bare: true \}\)/);
    expect(fn).not.toMatch(/startTutorial/);
  });
});

describe('the window during the walkthrough', () => {
  it('has no step list beside the app', () => {
    expect(app).not.toMatch(/<TourList /);
  });
  it('keeps the sidebar open, so every place shows its name', () => {
    expect(app).toMatch(/sidebarFolded\(\{ phone: onPhone\(\), shrinks: sidebarShrinks && !tourLive\(tour\), pointedAt: railOpen \}\)/);
  });
});

describe("Home's box before the first send", () => {
  it('holds the practice task, addressed to the practice project', () => {
    expect(app).toMatch(/const tourTask = tourLive\(tour\) && !tour!\.sent && tour!\.practice && !tour!\.practice\.item \? tour!\.practice\.slug : null;/);
    expect(app).toMatch(/initial=\{walkCard \? \{ body: `\$\{TASK_TITLE\}\\n\\n\$\{TASK_BODY\}` \} : tourTask \? \{ body: `\$\{TASK_TITLE\}\\n\\n\$\{TASK_BODY\}`, product: tourTask \} : composeInitial\}/);
    expect(app).toMatch(/scripted=\{walkCard \|\| tourTask \? \{ labels: \[FIRST_RUN_LABEL\] \} : null\}/);
  });
});

describe('a reply on the practice thread', () => {
  it('stays on it, so the next tip can be done there', () => {
    expect(app).toMatch(/const stay = staysOnTheTask\(item, text, engine\) \|\| talking \|\| !movesOn\(item\) \|\| isTourPractice\(tourRef\.current, item\);/);
  });
  it('is answered by the store, as the practice tutorial is', () => {
    expect(app).toMatch(/api\.firstRunAnswer\(\{ product: p\.slug, id: p\.item!?, round: p\.replies \}\)/);
  });
});

describe('the practice project', () => {
  it('is made bare when asked, with no example threads in it', () => {
    const ipc = read('main/ipc.mts');
    expect(ipc).toMatch(/ipcMain\.handle\('zero:first-run-practice', \(_e, opts: \{ bare\?: boolean \} = \{\}\) => \{/);
    expect(ipc).toMatch(/if \(opts\?\.bare\) return \{ \.\.\.made, examples: \[\], backdrop: \[\] \};/);
  });
  it('goes when the walkthrough ends or is skipped', () => {
    expect(app).toMatch(/if \(tourGone && tour\?\.practice\) void api\.firstRunPracticeEnd\(\)/);
  });
});

describe('the tip on the practice task', () => {
  it('says it is practice', () => {
    const tour = read('renderer/src/components/Tour.tsx');
    expect(tour).toContain('Press <K k={CMD} /><K k="↵" /> to send this practice thread');
    expect(app).toMatch(/<Tour tour=\{tour\} practice=\{!!tourTask\}/);
  });
});

describe('marking the practice thread done', () => {
  // Walking it in a copy: E on the practice thread opened the next thread in
  // Needs you, a real chat brought in from the computer, with the next tip over it.
  it('goes back to where it was opened from, not on to a real thread', () => {
    expect(app).toMatch(/advanceRef\.current = advanceAfter\(\{ fromTask: !!focused && !isTourPractice\(tourRef\.current, item\), index, id: item\.id \}\);/);
  });
});

describe('after the practice thread is sent', () => {
  // In a copy, Home's box went on pointing at Practice, under "Nothing runs in
  // Practice", for the rest of the walkthrough.
  it("hands Home's box back the project it had before", () => {
    expect(app).toMatch(/rememberProject\(beforePractice\.current\);/);
    expect(app).toMatch(/beforePractice\.current = rememberedProject\(\);/);
  });
});

describe('the last tip on Home', () => {
  // Home has no tabs and no thread header, so the ⌘K tip had nothing to sit by and never drew.
  it('sits by the sidebar Search, which opens the same bar', () => {
    const tour = read('renderer/src/components/Tour.tsx');
    expect(tour).toMatch(/document\.querySelector\('\.workspace-find button'\)/);
  });
});
