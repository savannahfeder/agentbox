import { THEME_KEY, type ThemeChoice } from './theme';

// The picture themes, and which one the window is wearing.
//
// A skin is a second axis laid over the light and dark token sets in theme.ts
// (pinned by tests/theme-tokens.test.mjs), carried on its own `data-skin`
// attribute so nothing under it moves. A third value of `theme` would have
// made every token block a three-way answer.

// The open end of the type promises no other id exists. SKINS is the only
// list of ids that do, and resolveSkin refuses anything not in it.
export type SkinId =
  | 'lake' | 'ice' | 'ice-river' | 'lake-harbour'
  | 'pixel-ridge' | 'pixel-orbit' | 'woodblock-sea' | 'riso-hills'
  | 'gouache-valley' | 'vector-dunes' | 'watercolour-mist'
  | 'orbit-rings' | 'moon-pines' | 'cel-dusk' | 'pixel-harbour' | 'lino-coast'
  | 'valley-haze' | 'frost-haze' | 'slate-haze' | 'peach-haze-2'
  | 'ember-grid'
  | (string & {});

// `none` is spelled out because an empty string in localStorage cannot be told
// apart from never having chosen.
export type SkinChoice = SkinId | 'none';

export type Skin = {
  id: SkinId;
  // Shown in Settings and searched in Command-K. Spell it the American way:
  // the search is a plain substring match, so "watercolor" never finds "Watercolour".
  name: string;
  // One line under the name in Settings.
  note: string;
  // A picture on a light window. Absent means dark; `lookMeans` reads it.
  light?: true;
};

// Adding a picture theme is an entry here plus its token block in styles.css.
// Everything else takes the count from this list.
//
// Ids never change even where a name was respelt. They key the asset files,
// the `data-skin` selectors and the stored choice, so renaming one drops the
// theme off a machine that is wearing it.
export const SKINS: Skin[] = [

  // The launch film's look, with values read from the film's stylesheet. Its
  // picture is an inline drawing of a dot grid, so it ships no image file.
  { id: 'ember-grid', name: 'Dark', note: 'The launch film’s look. A warm dark grey, a faint dot grid, square corners and one orange.' },

];

export const SKIN_KEY = 'zero.skin';

// localStorage may name a skin this build removed. An unknown id is no
// picture, never a `data-skin` the stylesheet has no block for.
export function resolveSkin(stored: string | null | undefined): SkinChoice {
  return SKINS.some((s) => s.id === stored) ? (stored as SkinId) : 'none';
}

export function skinName(skin: SkinChoice): string {
  return SKINS.find((s) => s.id === skin)?.name ?? 'None';
}

// A look is what the user picks: a theme or a picture, never both. The rest of
// the app still reads `theme` and `skin` separately, so this is a translation
// at the edge, not more state. `match` is stored on the theme key and resolved
// to light or dark on every paint.
export type Look = 'light' | 'dark' | 'match' | SkinId;

// Takes the theme as picked, not as resolved, so Match system on a light Mac
// ticks the Match tile and not Light.
export function lookOf(theme: 'light' | 'dark' | 'match', skin: SkinChoice): Look {
  return skin === 'none' ? theme : skin;
}

/**
 * Every look, in the order Settings, Command-K and the walk show them. It
 * lives here so those screens read one list rather than copies. */
export const LOOKS: Array<{ id: Look; name: string }> = [
  { id: 'light', name: 'Light' },
  { id: 'ember-grid', name: 'Dark' },
  { id: 'match', name: 'Match system' },
];

// The pictures that were light. Anybody still wearing one lands on Light.
const LIGHT_PICTURES = ['frost-haze', 'slate-haze', 'peach-haze', 'peach-haze-2'];

/**
 * Resolve old preferences once before the first paint, onto one of the three
 * choices. An empty store gets the default, Dark. Light and Match system are
 * kept. Plain dark and every dark picture become Dark, which is Ember Grid.
 * A light picture becomes Light. */
export function normalizeSavedLook(store: {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}): void {
  const theme = store.getItem(THEME_KEY);
  const skin = store.getItem(SKIN_KEY);
  const put = (look: Look) => {
    const l = lookMeans(look);
    if (theme !== l.theme) store.setItem(THEME_KEY, l.theme);
    if (skin !== l.skin) store.setItem(SKIN_KEY, String(l.skin));
  };
  // A new Mac gets the default, whatever its own light or dark setting says.
  if (theme === null && skin === null) return put(DEFAULT_SKIN);
  if (skin && LIGHT_PICTURES.includes(skin)) return put('light');
  if (skin && skin !== 'none') return put('ember-grid');
  if (theme === 'light') return put('light');
  if (theme === 'match') return put('match');
  put('ember-grid');
}

/**
 * The skin the window wears for a stored choice, given the Mac's own setting.
 * Match system on a dark Mac is Dark, which is Ember Grid. On a light Mac it
 * is plain Light. */
export function wornSkin(theme: 'light' | 'dark' | 'match', skin: SkinChoice, machine: ThemeChoice): SkinChoice {
  if (theme === 'match') return machine === 'dark' ? DEFAULT_SKIN : 'none';
  return skin;
}

export function lookMeans(look: Look): { theme: 'light' | 'dark' | 'match'; skin: SkinChoice } {
  if (look === 'light') return { theme: 'light', skin: 'none' };
  if (look === 'dark') return { theme: 'dark', skin: 'none' };
  // Stored as `match` so the Mac's setting is read on every paint, not frozen
  // at the moment of the press.
  if (look === 'match') return { theme: 'match', skin: 'none' };
  // Anything else is a picture, which takes dark ink unless its entry carries
  // `light: true`. An id not in SKINS stays dark; resolveSkin refuses it
  // before anything paints.
  return { theme: SKINS.find((s) => s.id === look)?.light ? 'light' : 'dark', skin: look };
}

type Root = {
  setAttribute(k: string, v: string): void;
  removeAttribute(k: string): void;
};

// No skin removes the attribute rather than setting "none", so
// `:root[data-skin]` in the stylesheet means exactly "a picture is on".
export function applySkin(skin: SkinChoice, root: Root = document.documentElement): void {
  if (skin === 'none') root.removeAttribute('data-skin');
  else root.setAttribute('data-skin', skin);
}

// A picture ships a sharp copy and a soft '-sm' copy resampled to 1536 wide.
// main/screen-detail.mjs picks which one a screen gets, because only the main
// process sees the display's real density. devicePixelRatio here includes page zoom.
export type SkinDetail = 'soft' | 'sharp';

// The stylesheet's plain rules are the sharp set and the soft set overrides on
// this attribute, so 'sharp' removes it. A window that never hears from main
// paints the sharp set.
export function applySkinDetail(detail: SkinDetail, root: Root = document.documentElement): void {
  if (detail === 'soft') root.setAttribute('data-skin-detail', 'soft');
  else root.removeAttribute('data-skin-detail');
}

// Anything but 'soft' is sharp, so an unreadable message from main cannot
// downgrade a picture.
export function resolveSkinDetail(sent: string | null | undefined): SkinDetail {
  return sent === 'soft' ? 'soft' : 'sharp';
}

// A picture's dials are the user's to set, stored per skin.
export type SkinTune = {
  panelOpacity?: number;
  backgroundBlur?: number;
  // Pixels of backdrop blur behind the card.
  blur: number;
  // How far the picture is turned down, 0..1, as the alpha of a flat dark
  // wash over it.
  dim: number;
};

export const TUNE_KEY = 'zero.skin.tune';

// The range each dial travels.
export const TUNE_LIMITS = {
  panelOpacity: { min: 0, max: 1, step: 0.01 },
  backgroundBlur: { min: 0, max: 80, step: 1 },
  blur: { min: 0, max: 80, step: 1 },
  // The floor is 0 because some pictures are darker than the veil colour
  // itself, so any veil would make them lighter.
  dim: { min: 0, max: 0.85, step: 0.01 },
} as const;

export const TUNE_DEFAULT: Record<SkinId, SkinTune> = {
  // Several of these follow reference screenshots, pinned by
  // tests/her-theme-screenshots-set-the-defaults.test.mjs. The Lake's 0.63 was
  // fitted per channel against a reference drawing, and the Lake is also the
  // fallback in resolveTune.
  lake: { blur: 8, backgroundBlur: 5, dim: 0.63 },
  // Each dim is solved per picture so the luminance behind the inbox card
  // lands near the Lake's, because the pictures differ widely in brightness.
  // Ice is a shadowed cave and stays darker than the Lake even at 0.85.
  ice: { blur: 2, dim: 0.85 },
  'ice-river': { blur: 2, dim: 0.735 },
  'lake-harbour': { blur: 2, dim: 0.68 },
  'pixel-ridge': { blur: 4, backgroundBlur: 6, dim: 0.77 },
  'pixel-orbit': { blur: 0, backgroundBlur: 5, dim: 0.2 },
  'woodblock-sea': { blur: 4, backgroundBlur: 12, dim: 0.84 },
  'riso-hills': { blur: 2, backgroundBlur: 3, dim: 0.85 },
  'gouache-valley': { blur: 4, backgroundBlur: 5, dim: 0.75 },
  'vector-dunes': { blur: 2, dim: 0.775 },
  'watercolour-mist': { blur: 2, backgroundBlur: 4, dim: 0.85 },
  // Zero is measured, not missing: these are drawn dark and already sit below
  // the Lake's luminance with no veil.
  'orbit-rings': { blur: 2, dim: 0 },
  'moon-pines': { blur: 2, dim: 0 },
  'cel-dusk': { blur: 2, dim: 0 },
  'pixel-harbour': { blur: 2, dim: 0 },
  'lino-coast': { blur: 2, dim: 0.85 },
  // Zero because the hazes ship with their darkening, or for the light ones
  // their white wash, baked into the file. A flat veil cannot express the
  // multiply they need.
  'valley-haze': { blur: 2, dim: 0 },
  'frost-haze': { blur: 2, dim: 0 },
  'slate-haze': { blur: 2, dim: 0 },
  'orbital-glass': { blur: 30, dim: .3, backgroundBlur: 24, panelOpacity: .16 },
  'peach-haze-2': { blur: 0, dim: 0.35, backgroundBlur: 0, panelOpacity: 0.2 },
  // The film's panels are solid, so there is nothing behind them to blur, and
  // its ground is already as dark as it should be.
  'ember-grid': { blur: 0, dim: 0 },
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// localStorage may hold an out-of-range number, a string, or a removed skin's
// shape. Anything unreadable falls back to the default, never a NaN in a CSS
// variable, which would leave the card with no blur and opaque.
export function resolveTune(stored: string | null | undefined, skin: SkinId): SkinTune {
  const base = TUNE_DEFAULT[skin] ?? TUNE_DEFAULT.lake;
  let parsed: unknown;
  try { parsed = stored ? JSON.parse(stored) : null; } catch { return base; }
  const got = (parsed as Record<string, unknown> | null)?.[skin] as Partial<SkinTune> | undefined;
  if (!got || typeof got !== 'object') return base;
  const num = (v: unknown, fallback: number, lim: { min: number; max: number }) =>
    (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lim.min, lim.max) : fallback);
  return {
    ...(got.backgroundBlur !== undefined || base.backgroundBlur !== undefined ? { backgroundBlur: (got.backgroundBlur === undefined ? base.backgroundBlur! : num(got.backgroundBlur, 0, TUNE_LIMITS.backgroundBlur)) } : {}),
    ...(base.panelOpacity !== undefined ? { panelOpacity: num(got.panelOpacity, base.panelOpacity, TUNE_LIMITS.panelOpacity) } : {}),
    blur: num(got.blur, base.blur, TUNE_LIMITS.blur),
    dim: num(got.dim, base.dim, TUNE_LIMITS.dim),
  };
}

// Read the whole map back so setting one skin's dials does not wipe another's.
export function storeTune(stored: string | null | undefined, skin: SkinId, tune: SkinTune): string {
  let parsed: Record<string, unknown> = {};
  try { const p = stored ? JSON.parse(stored) : null; if (p && typeof p === 'object') parsed = p as Record<string, unknown>; } catch { /* start over */ }
  return JSON.stringify({ ...parsed, [skin]: tune });
}

// The dials reach the stylesheet as custom properties on the root element. An
// inline property there outranks any selector, so the sliders move the live
// window and not just the next reload.
export function applyTune(tune: SkinTune, root: { style: { setProperty(k: string, v: string): void } } = document.documentElement): void {
  root.style.setProperty('--skin-panel-opacity', tune.panelOpacity === undefined ? '' : String(tune.panelOpacity));
  root.style.setProperty('--skin-background-blur', `${tune.backgroundBlur ?? 0}px`);
  root.style.setProperty('--skin-blur', `${tune.blur}px`);
  root.style.setProperty('--skin-dim', String(tune.dim));
}

// What a new Mac starts on (`seedFirstRunLook`, `normalizeSavedLook`) and what
// Match system wears on a dark Mac. Its place in SKINS is a separate decision.
export const DEFAULT_SKIN: SkinId = 'ember-grid';

/**
 * The picture inbox zero wears: the one that was picked, and none otherwise.
 */
export function idleSkin(skin: SkinChoice): SkinChoice {
  return skin;
}

/**
 * The picture behind the walk's setup screens: one the user picked, or
 * WALK_PICTURE when they have none or are on the default. Kept apart from
 * idleSkin because the rules differ. The caller paints it and stores nothing,
 * so the walk never changes anybody's saved look.
 */
export function walkSkin(skin: SkinChoice): SkinChoice {
  return skin === 'none' || skin === DEFAULT_SKIN ? WALK_PICTURE : skin;
}

/**
 * A landscape behind setup is a better first impression than the default's
 * near-black dot grid, so the walk does not fall back to DEFAULT_SKIN.
 */
export const WALK_PICTURE: SkinChoice = 'gouache-valley';

// Writes the default look into an empty store, so a fresh install does not
// fall through to the Mac's own light or dark setting and the picker opens
// with the worn look already ticked. Both keys, so theme and skin agree.
//
// A store holding any choice is left alone, which also makes `?firstrun=1`
// safe on a Mac that is already set up. Returns what it wrote so the caller
// can apply it at once, because localStorage is read once at mount.
export function seedFirstRunLook(store: {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}, themeKey: string): { theme: 'light' | 'dark' | 'match'; skin: SkinChoice } | null {
  if (store.getItem(themeKey) !== null || store.getItem(SKIN_KEY) !== null) return null;
  const look = lookMeans(DEFAULT_SKIN);
  store.setItem(themeKey, look.theme);
  store.setItem(SKIN_KEY, String(look.skin));
  return look;
}

