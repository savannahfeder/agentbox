// The phone's two looks. Light is the desktop's plain light theme
// (renderer/src/styles.css): its cool page and ink. Dark is the phone's own, a
// neutral grey with no tint. One accent, the brand orange, and it is only for
// what is live or needs you.
//
// Every screen reads `color` while it draws, so wearing the other palette is
// one change to this object and a redraw (state/look.tsx). A colour copied into
// a constant when a file loads would stay on the old look, which
// tests/the-phone-app-changes-its-look-and-reaches-more-of-your-settings holds
// every screen to.
export const LIGHT = {
  bg: '#f8f8fa',
  text: '#12182a',
  dim: '#4a5266',
  faint: '#6e7590',
  accent: '#ee6018',
  line: 'rgba(17, 25, 48, 0.11)',
  lineStrong: 'rgba(17, 25, 48, 0.16)',
  rowLine: 'rgba(17, 25, 48, 0.08)',
  fill: 'rgba(17, 25, 48, 0.04)',
  // `fill` over the page, as one solid colour: a round button, which the wall must not show through.
  round: '#efeff2',
  picked: 'rgba(17, 25, 48, 0.07)',
  film: 'rgba(17, 25, 48, 0.05)',
  pop: '#fefefe',
  card: '#fefefe',
  // A raised block inside a message: a code block, a file's frame.
  raised: '#f1f3f6',
  sunk: '#fefefe',
  field: 'rgba(17, 25, 48, 0.04)',
  // What is filled: the picked tab, Send, a main button. `ink` is what is written on it.
  graphite: '#262b3a',
  ink: '#f8f8fa',
  scrim: 'rgba(17, 25, 48, 0.28)',
  plus: '#2f7d4e',
  minus: '#c0503c',
  plusBed: 'rgba(47, 125, 78, 0.10)',
  minusBed: 'rgba(192, 80, 60, 0.09)',
  // How dark a floating card's shadow is.
  shade: 0.1,
  // The website's orange halftone, in the page's top corner.
  halftone: 0.34,
};

export type Palette = typeof LIGHT;

export const DARK: Palette = {
  bg: '#191919',
  text: '#ececec',
  dim: '#b8b8b8',
  faint: '#8f8f8f',
  accent: '#ee6018',
  line: '#333333',
  lineStrong: '#444444',
  rowLine: 'rgba(255, 255, 255, 0.07)',
  fill: 'rgba(255, 255, 255, 0.05)',
  round: '#252525',
  picked: 'rgba(255, 255, 255, 0.09)',
  film: 'rgba(255, 255, 255, 0.07)',
  pop: '#2c2c2c',
  card: '#232323',
  raised: '#292929',
  sunk: '#202020',
  field: 'rgba(0, 0, 0, 0.18)',
  // A dark key would be lost on a dark card, so what is filled is light here.
  graphite: '#ececec',
  ink: '#191919',
  scrim: 'rgba(0, 0, 0, 0.55)',
  plus: '#7bc98e',
  minus: '#e28f82',
  plusBed: 'rgba(123, 201, 142, 0.13)',
  minusBed: 'rgba(226, 143, 130, 0.12)',
  shade: 0.5,
  halftone: 0,
};

/** The colours every screen reads. Light until a look is worn. */
export const color: Palette = { ...LIGHT };

/** Put on a palette. Screens see it on their next draw. */
export function wear(worn: 'light' | 'dark') {
  Object.assign(color, worn === 'light' ? LIGHT : DARK);
}

export const font = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
};

// What you press or type in, a card, a sheet, and a pill.
export const corner = { small: 12, card: 20, sheet: 28, pill: 999 };

export const size = {
  topBar: 56,
  tabs: 52,
  inset: 20,
};

/** The one shadow under what floats: `card` for a card on the page, `float` for what hangs over it. */
export function lift(kind: 'card' | 'float') {
  const far = kind === 'float';
  return { shadowColor: '#000', shadowOpacity: color.shade * (far ? 1.6 : 1), shadowRadius: far ? 32 : 16, shadowOffset: { width: 0, height: far ? 14 : 6 }, elevation: far ? 16 : 6 };
}
