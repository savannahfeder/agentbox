// TAKE THE TUTORIAL STARTS THE WALKTHROUGH ON ITS FIRST STEP (2026-11-21). With the
// old walk gone, ⌘K's Take the tutorial starts the split view's walkthrough instead.
// Walked in the built app: it opened on "Walkthrough 2 of 5", because closing the
// palette it was picked from counted as the walkthrough's own ⌘K lesson
// (zero.tour read {"done":["palette"]}). With the press not counted it opens on 1 of 5.
// Two synthetic testers then took it over real work: its urgent step made a real
// thread urgent, a click on a real card moved it on, and in board view no tip showed.
// So while it runs the box shows only its practice project, as a list, and gives
// back what was there when it ends.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const body = (name: string) => {
  const at = app.indexOf(`const ${name} = useCallback(`);
  expect(at).toBeGreaterThan(-1);
  return app.slice(at, app.indexOf('\n  }, [', at));
};

describe('Take the tutorial', () => {
  it('is wired to the walkthrough', () => {
    expect(app).toContain('onTutorial={startTutorial}');
    expect(body('startTutorial')).toContain('beginWalkthrough();');
    expect(body('finishFresh')).toContain('beginWalkthrough();');
  });
  it('does not count the ⌘K it was picked from as the walkthrough\'s ⌘K lesson', () => {
    const fn = body('startTutorial');
    expect(fn.indexOf('paletteWasOpen.current = false;')).toBeGreaterThan(-1);
    expect(fn.indexOf('paletteWasOpen.current = false;')).toBeLessThan(fn.indexOf('beginWalkthrough();'));
  });
  it('starts a fresh walkthrough, not a resumed one', () => {
    expect(body('beginWalkthrough')).toContain('setTour(startTour());');
  });
  it('leaves no way into the old walk', () => {
    expect(app).not.toMatch(/<Onboarding\b|<TutorialOffer\b|tutorialRun|setRun\(/);
    for (const gone of ['components/Onboarding.tsx', 'components/TutorialOffer.tsx', 'tutorial.ts', 'walk-staging.ts']) {
      expect(fs.existsSync(new URL(`../renderer/src/${gone}`, import.meta.url))).toBe(false);
    }
  });
  it('shows only its practice project, as a list, while it runs over real work', () => {
    expect(body('startTutorial')).toContain('setTutorialOverWork(true);');
    expect(app).toContain("const tutorialSlug = tutorialOverWork && tourLive(tour) ? tour?.practice?.slug ?? null : null;");
    const effect = app.slice(app.indexOf('const beforeTutorial = useRef'), app.indexOf('}, [tutorialSlug, tutorialOverWork, tour]);'));
    expect(effect).toContain('setProductFilter(tutorialSlug);');
    expect(effect).toContain("view: 'list'");
    expect(effect).toContain("if (evView !== 'list') setEvView('list');");
  });
  it('gives back the filter and the view when it ends', () => {
    const effect = app.slice(app.indexOf('const beforeTutorial = useRef'), app.indexOf('}, [tutorialSlug, tutorialOverWork, tour]);'));
    expect(effect).toMatch(/else if \(tutorialOverWork && !tourLive\(tour\)\)/);
    expect(effect).toContain('setProductFilter(was.filter);');
    expect(effect).toContain('setInboxDisplay(was.display);');
    expect(effect).toContain('setEvView(was.ev);');
  });
  it('leaves the first run\'s walkthrough as it was', () => {
    expect(body('finishFresh')).not.toContain('setTutorialOverWork');
  });
  it('closes the practice thread when it is skipped with that thread open', () => {
    const at = app.indexOf('const tourGone =');
    const effect = app.slice(at, app.indexOf('}, [tourGone]);', at));
    expect(effect).toContain('if (focused?.product === tour.practice.slug) setFocused(null);');
  });
});
