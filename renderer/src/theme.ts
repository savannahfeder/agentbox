// Light and dark, and which one you get.
//
// PURE, and out of App.tsx, because the rule has two inputs and only one of
// them is visible on screen. What she chose wins; with nothing chosen the
// answer is DARK, not the Mac's; and the answer is always written out as an
// explicit attribute rather than left to the stylesheet's default, so there is
// never a state where the tokens say light and the window is dark.
//
// THE MACHINE USED TO DECIDE, AND THAT IS WHAT BROKE. Only the first three
// setup screens and inbox zero pin dark and the lake; every other screen read
// this function, and on a fresh install nothing is stored, so it fell through
// to whatever the Mac preferred. A tester's Mac was light, so their onboarding went
// light the moment it left the third screen.
//
// So matching the Mac is no longer something that happens TO someone, it is a
// look they can pick. THAT OPTION IS NOW BUILT, and it is built in the exact
// shape the paragraph above reserved for it: a STORED CHOICE on this key, never
// a fallback. `resolveTheme` still answers dark for an empty store and for junk,
// so the bug that turned a tester's onboarding white cannot come back; the only way
// to reach the Mac's opinion is to have pressed the tile that says so.
//
// THIS FILE IS THE ONLY PLACE IN THE RENDERER THAT MAY READ THE MACHINE, and
// tests/theme-choice.test.mjs holds every other file to that. Two functions do
// it, `machineTheme` and `onMachineTheme`, and both are named for what they read
// so a grep for the Mac lands here.
//
// ). Light is the mockup's: a grey frame with near-white cards on it.

export type ThemeChoice = 'light' | 'dark';

/**
 * WHAT SHE PICKED, which is not always what is on the screen.
 *  it was pressed. */
export type ThemePick = ThemeChoice | 'match';

// WHETHER THE MAC IS ON DARK RIGHT NOW. Guarded because `matchMedia` is absent
// in the test runner and in any headless boot that stubs the DOM, and a picker
// throwing on a machine with no media engine would be a worse bug than showing
// dark.
export function machineTheme(): ThemeChoice {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * THE MAC CHANGING ITS MIND WHILE THE APP IS OPEN. Somebody who picked Match
 *  my system asked for the window to follow, so following it once at boot and
 *  never again would be a promise half kept: macOS flips at sunset on its own.
 *  Returns the unsubscribe, and does nothing at all on a machine with no media
 *  engine. */
export function onMachineTheme(fn: (t: ThemeChoice) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const on = () => fn(mq.matches ? 'dark' : 'light');
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}

// `stored` is whatever localStorage has, which is to say: anything. A value we
// do not recognise is treated as no preference rather than as a third theme,
// because a typo in a settings file should not be able to produce a window with
// no colours defined.
export function resolveTheme(stored: string | null | undefined): ThemeChoice {
  if (stored === 'light' || stored === 'dark') return stored;
  // THE ONE VALUE THAT REACHES THE MACHINE, and it is only ever here because
  // somebody pressed the tile that says so. Junk and an empty store still fall
  // to dark on the line below.
  if (stored === 'match') return machineTheme();
  return 'dark';
}

/**
 * WHAT IS IN THE STORE, before it is resolved. Settings and the walk need to
 *  know that `match` was picked, because the tile they tick is the choice and
 *  not the colour it happens to be showing this evening. */
export function resolvePick(stored: string | null | undefined): ThemePick {
  if (stored === 'light' || stored === 'dark' || stored === 'match') return stored;
  return 'dark';
}

// The toggle is a toggle, not a cycle through three states. Once she has
// touched it, the machine's preference stops being consulted: a person who
// picked light at noon did not mean "until sunset".
export function nextTheme(current: ThemeChoice): ThemeChoice {
  return current === 'dark' ? 'light' : 'dark';
}

export const THEME_KEY = 'zero.theme';

export function applyTheme(theme: ThemeChoice, root: { setAttribute(k: string, v: string): void } = document.documentElement): void {
  root.setAttribute('data-theme', theme);
}
