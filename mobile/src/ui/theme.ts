// The phone's own two looks. Light is warm paper under near-black ink with
// white cards floating over it; Dark is the same page at night. One accent, the
// brand orange, and it is only for what is live or needs you.
//
// Every screen reads `color` while it draws, so wearing the other palette is
// one change to this object and a redraw (state/look.tsx). A colour copied into
// a constant when a file loads would stay on the old look, which
// tests/the-phone-app-changes-its-look-and-reaches-more-of-your-settings holds
// every screen to.
export const LIGHT = {
  bg: '#f9f8f4',
  text: '#1b1a18',
  dim: '#5c5953',
  faint: '#8a867e',
  accent: '#ee6018',
  line: 'rgba(27, 26, 24, 0.09)',
  lineStrong: 'rgba(27, 26, 24, 0.16)',
  rowLine: 'rgba(27, 26, 24, 0.07)',
  fill: 'rgba(27, 26, 24, 0.04)',
  picked: 'rgba(27, 26, 24, 0.07)',
  // A faint lift for code, table heads and small marks.
  film: 'rgba(27, 26, 24, 0.05)',
  pop: '#ffffff',
  card: '#ffffff',
  // A raised block inside a message: a code block, a file's frame.
  raised: '#f1efe9',
  // An approval card and a page of a file.
  sunk: '#ffffff',
  field: 'rgba(27, 26, 24, 0.045)',
  // The one filled button on a screen, and the words on it.
  graphite: '#1b1a18',
  ink: '#ffffff',
  scrim: 'rgba(27, 26, 24, 0.32)',
  // Lines a change added and took out.
  plus: '#2f7d4e',
  minus: '#c0503c',
  plusBed: 'rgba(47, 125, 78, 0.10)',
  minusBed: 'rgba(192, 80, 60, 0.09)',
  // How dark a floating card's shadow is.
  shade: 0.1,
};

export type Palette = typeof LIGHT;

export const DARK: Palette = {
  bg: '#1a1917',
  text: '#f1ede7',
  dim: '#bdb7af',
  faint: '#8f8a83',
  accent: '#ee6018',
  line: 'rgba(255, 250, 240, 0.10)',
  lineStrong: 'rgba(255, 250, 240, 0.18)',
  rowLine: 'rgba(255, 250, 240, 0.07)',
  fill: 'rgba(255, 250, 240, 0.05)',
  picked: 'rgba(255, 250, 240, 0.09)',
  film: 'rgba(255, 250, 240, 0.07)',
  pop: '#2a2826',
  card: '#262422',
  raised: '#2c2a28',
  sunk: '#242220',
  field: 'rgba(255, 250, 240, 0.06)',
  graphite: '#f1ede7',
  ink: '#1a1917',
  scrim: 'rgba(0, 0, 0, 0.6)',
  plus: '#7bc98e',
  minus: '#e28f82',
  plusBed: 'rgba(123, 201, 142, 0.13)',
  minusBed: 'rgba(226, 143, 130, 0.12)',
  shade: 0.5,
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
  // Titles: a screen's name, a thread's title, a greeting.
  display: 'Newsreader_500Medium',
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
