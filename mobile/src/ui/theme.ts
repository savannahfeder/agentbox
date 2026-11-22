// Agentbox's two looks, as the desktop names them (renderer/src/styles.css):
// Light is the plain light theme's cool page and ink, Dark is Ember Grid. One
// accent, the brand orange, and it is only for what is live or needs you.
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
  // Ember Grid's wall: how strong its dots and its orange glow are. Light's page is plain.
  dots: 0,
  glow: 0,
};

export type Palette = typeof LIGHT;

export const DARK: Palette = {
  bg: '#1a1817',
  text: '#efebe7',
  dim: '#c4bdb8',
  faint: '#a09994',
  accent: '#ee6018',
  line: '#464443',
  lineStrong: '#52504f',
  rowLine: 'rgba(70, 68, 67, 0.375)',
  fill: 'rgba(255, 255, 255, 0.04)',
  picked: 'rgba(255, 255, 255, 0.08)',
  film: 'rgba(255, 255, 255, 0.07)',
  pop: '#363431',
  card: '#2d2b29',
  raised: '#2f2d2c',
  sunk: '#272524',
  field: 'rgba(0, 0, 0, 0.18)',
  // A dark key would be lost on Ember Grid's cards, so what is filled is light here.
  graphite: '#efebe7',
  ink: '#1a1817',
  scrim: 'rgba(0, 0, 0, 0.55)',
  plus: '#7bc98e',
  minus: '#e28f82',
  plusBed: 'rgba(123, 201, 142, 0.13)',
  minusBed: 'rgba(226, 143, 130, 0.12)',
  shade: 0.5,
  dots: 0.055,
  glow: 0.075,
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
