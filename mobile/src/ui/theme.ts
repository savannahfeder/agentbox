// The desktop's two looks (renderer/src/styles.css): Dark is Ember Grid, Light
// is the plain light theme's tokens, at the phone layout's sizes
// (renderer/src/phone.css), as the phone site computes them.
//
// Every screen reads `color` while it draws, so wearing the other palette is
// one change to this object and a redraw (state/look.tsx). A colour copied into
// a constant when a file loads would stay on the old look, which
// tests/the-phone-app-changes-its-look-and-reaches-more-of-your-settings holds
// every screen to.
export const DARK = {
  bg: '#1a1817',
  text: '#efebe7',
  dim: '#c4bdb8',
  faint: '#a09994',
  accent: '#ee6018',
  line: '#464443',
  lineStrong: '#52504f',
  // A row's hairline: the line at 37.5% (`--row-line`).
  rowLine: 'rgba(70, 68, 67, 0.375)',
  fill: 'rgba(255, 255, 255, 0.04)',
  picked: 'rgba(255, 255, 255, 0.08)',
  // A faint lift for code, table heads and small marks (`--bg-raised` at low strength).
  film: 'rgba(255, 255, 255, 0.07)',
  pop: '#363431',
  card: '#2d2b29',
  // A raised block inside a message: a code block, a file's frame.
  raised: '#2f2d2c',
  // An approval card and a page of a file, a step below a card.
  sunk: '#272524',
  field: 'rgba(0, 0, 0, 0.18)',
  graphite: '#34312e',
  ink: '#f2eee8',
  scrim: 'rgba(0, 0, 0, 0.55)',
  // How dark a floating card's shadow is. Black at .55 reads as a smudge on Light.
  lift: 0.55,
};

export type Palette = typeof DARK;

export const LIGHT: Palette = {
  bg: '#f8f8fa',
  text: '#12182a',
  dim: '#4a5266',
  faint: '#6e7590',
  accent: '#ee6018',
  line: 'rgba(17, 25, 48, 0.11)',
  lineStrong: 'rgba(17, 25, 48, 0.16)',
  rowLine: 'rgba(17, 25, 48, 0.08)',
  fill: 'rgba(17, 25, 48, 0.03)',
  picked: 'rgba(17, 25, 48, 0.06)',
  film: 'rgba(17, 25, 48, 0.05)',
  pop: '#fefefe',
  card: '#fefefe',
  raised: '#f1f3f6',
  sunk: '#fefefe',
  field: 'rgba(17, 25, 48, 0.04)',
  // The pen button stays a dark key on a light page, as on the desktop.
  graphite: '#262b3a',
  ink: '#f8f8fa',
  scrim: 'rgba(17, 25, 48, 0.28)',
  lift: 0.14,
};

/** The colours every screen reads. Dark until a look is worn. */
export const color: Palette = { ...DARK };

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

export const size = {
  topBar: 56,
  tabs: 48,
  inset: 16,
};
