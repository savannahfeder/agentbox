import { resolveTheme, THEME_KEY, type ThemeChoice } from './theme';

// The picture themes, and which one the window is wearing.
//
// A SKIN IS NOT A THIRD SET OF COLOURS. Light and dark stay exactly what
// theme.ts says they are: one token set, answered in both, pinned by
// tests/theme-tokens.test.mjs. A skin is a SECOND AXIS laid over dark — a
// photograph behind the window and the surfaces going translucent over it —
// carried on its own `data-skin` attribute so nothing under it moves. That
// separation is the whole reason this file exists: a third value of `theme`
// would have made `nextTheme` a cycle, made every token block a three-way
// answer, and made the next picture a new state rather than a block of colour.
//
// A SKIN IMPLIES DARK.So there is no such thing as a light Lake, and the one
// control she uses offers Light, Dark and the pictures as one list rather than
// as two settings she has to combine herself.
//
// The plural stays: this is a list of pictures with one entry in it, not a
// single picture hard-coded, and Lake is not promoted into Mountain's place
// anywhere.

// SIXTEEN PICTURES SHIP: 'lake', three of the four chosen in round three, seven
// of the eight chosen in round four, and the five chosen in round five. It is the second theme ever removed after shipping, and like Ice Vault
// it is never re-offered. The open end of the type is what let the deleted
// theme lab append candidates at boot. It stays because it costs nothing and
// because a wider type here was never a promise that any other id exists:
// SKINS below is the only list of what does, and resolveSkin refuses anything
// not in it.
export type SkinId =
  | 'lake' | 'ice' | 'ice-river' | 'lake-harbour'
  | 'pixel-ridge' | 'pixel-orbit' | 'woodblock-sea' | 'riso-hills'
  | 'gouache-valley' | 'vector-dunes' | 'watercolour-mist'
  | 'orbit-rings' | 'moon-pines' | 'cel-dusk' | 'pixel-harbour' | 'lino-coast'
  // THE THREE KEPT out of thirty five candidates. The other
  // thirty two are deleted; FAMILY in scripts/make-haze.mjs keeps every recipe
  // and decisions.md keeps every token block, so any of them is a minute away,
  // but every one of them was reviewed and passed on.
  | 'valley-haze' | 'frost-haze' | 'slate-haze' | 'peach-haze-2'
  // The launch film's look (w-b3e123a0af).
  | 'ember-grid'
  | (string & {});

// `none` is the absence of a skin, not a skin. It is spelled out because the
// stored value and the picker both need a word for "no picture", and an empty
// string in localStorage is indistinguishable from never having chosen.
export type SkinChoice = SkinId | 'none';

export type Skin = {
  id: SkinId;
  // What she reads in Settings and types into ⌘K. Plain, and the thing the
  // picture is of: no metaphor in UI copy.
  name: string;
  // One line under the name in Settings. What it does, not what it evokes.
  note: string;
  // A PICTURE ON PAPER RATHER THAN ON A DARK WINDOW, and until 2026-09-04 there
  // was no such thing.
  //
  // So the flag is the whole of it. `lookMeans` reads it to decide which theme
  // the window wears, and the stylesheet's dark block no longer claims every
  // window with a picture on it. Absent means dark, so the sixteen photographs
  // and the six dark hazes are untouched by its existence.
  light?: true;
};

// Adding a picture theme is adding an entry here plus its token block in
// styles.css. Nothing else in the app knows how many there are.
// Not readonly, a leftover from when the theme lab appended candidates at boot.
// Everything that reads it — Settings' tiles, the ⌘K theme rows, resolveSkin —
// takes its length from here, so this list is the only place the count lives.
//
// EVERY `name` IS SPELT THE AMERICAN WAY. Three of these themes were requested
// in American spelling and all three first shipped in British: "lake harbor"
// became `Lake Harbour`, "pixel harbor" became `Pixel Harbour`, "watercolor
// mist" became `Watercolour Mist`. A `name` is read in three places — the tiles
// in Settings, the look screen on the walk, and the ⌘K row "Switch to <name>" —
// so a name spelt the other way is a word she reads and cannot search for.
// Measured with `matchesQuery`, which is a plain substring over the row's
// label: typing `watercolor` matched NO row while the label said Watercolour.
//
// THE IDS DO NOT MOVE, and that asymmetry is deliberate rather than an
// oversight left half done. `lake-harbour`, `pixel-harbour` and
// `watercolour-mist` key the asset filenames, the `data-skin` selectors in
// styles.css and the look she has already picked and stored, so renaming them
// would silently drop her theme off a machine that was wearing it. Nobody reads
// an id.
export const SKINS: Skin[] = [

  // EMBER GRID LEADS (w-2ff620f13b): it is first among the themes. It is the
  // default too (DEFAULT_SKIN below), so the ticked tile on a new Mac is now
  // the first one.
  //
  // THE LAUNCH FILM'S LOOK (w-b3e123a0af). People who see the video expect to
  // come into the app and find that theme. So the values are the film's own, read out of its shared stylesheet. NOT A
  // PHOTOGRAPH: its picture is an inline drawing of a dot grid and one orange
  // light, so it ships no image file and has no small copy.
  { id: 'ember-grid', name: 'Ember Grid', note: 'The launch film’s look. A warm dark grey, a faint dot grid, square corners and one orange.' },

  // THE THREE HAZES COME NEXT, AND THAT IS A DECISION RATHER THAN A DEFAULT.
  // They were first placed up front, right after the basic dark and light.
  // That ordering was later superseded: LOOKS now leads with this list
  // in order, so leading here is the whole of "up front": Settings' tiles, the
  // walk's look step and the Command-K rows all move at once.
  //
  // THEY ARE NOT PHOTOGRAPHS, WHICH IS WHY THEY GROUP. Measured, that is a
  // spread of 4 to 7 over an 8x5 grid of the picture, where an ordinary
  // photograph reads 25 to 40.
  //
  // THIRTY FIVE WERE BUILT AND THESE THREE WERE KEPT, over five rounds on that
  // row. The other thirty two are deleted: FAMILY in scripts/make-haze.mjs keeps
  // every recipe and decisions.md keeps every token block, so any of them is a
  // minute away, but every one of them was reviewed and passed on.
  //
  // Valley Haze was requested from a reference picture. Frost and Slate are
  // LIGHT, which no picture in this app could be before them; `light: true`
  // and the Skin type above carry that story.
  { id: 'valley-haze', name: 'Valley Haze', note: 'The gouache valley, thrown out of focus. A blurred warm wash, edge to edge.' },
  { id: 'frost-haze', name: 'Frost Haze', note: 'Paper cooled toward blue. Light, with a cold edge to it.', light: true },
  { id: 'slate-haze', name: 'Slate Haze', note: 'A cool mid ground with a pale card on it. Between the two ends.', light: true },

  // THEN THE FIFTEEN PHOTOGRAPHS, in the order they were picked across rounds
  // three, four and five.
  { id: 'lake', name: 'Lake', note: 'The landing page\u2019s photograph, in dark mode.' },
  // FROM ROUND THREE: Ice, Ice River, Ice Vault and Lake Harbor were chosen.
  // Ice Vault was later removed. Its picture, its token block, its tile and its measured ground were all
  // deleted with it, and it is NEVER re-offered as a candidate.
  { id: 'ice', name: 'Ice', note: 'Blue daylight entering a glacier cave from the right.' },
  { id: 'pixel-ridge', name: 'Pixel Ridge', note: 'Pixel art. Flat ridges into a low sun, pixel conifers on the near cliff.' },
  // Keep the winning background's stored key so saved adjustments survive the rename.
  { id: 'peach-haze-2', name: 'Peach Haze', note: 'A diagonal peach glow across a sage and mauve wash.', light: true },
  // September 21: explicitly re-approved as a new glass treatment; the retired ID stays retired.
  { id: 'orbital-glass', name: 'Orbital Glass', note: 'A ringed planet through clear glass, with quiet gray text.' },
  { id: 'pixel-orbit', name: 'Pixel Orbit', note: 'Pixel art. A ringed planet low over a dark plain.' },
  { id: 'woodblock-sea', name: 'Woodblock Sea', note: 'A Japanese woodblock print. Pines on a headland, the sun on the water.' },
  { id: 'riso-hills', name: 'Riso Hills', note: 'A two colour risograph print in blue and coral ink.' },
  { id: 'gouache-valley', name: 'Gouache Valley', note: 'A painted animation background in gouache. A valley and a still river.' },
  { id: 'watercolour-mist', name: 'Watercolor Mist', note: 'A wet on wet watercolour. Five washes of mountain into mist.' },
  // THE FIVE FROM ROUND FIVE, in the order chosen: Orbit Rings, Moon Pines,
  // Cel Dusk, Pixel Harbor and Lino Coast. Round five's subject was a picture
  // DRAWN DARK, so four of these five wear almost no veil and arrive in their
  // own colour.
  //
  // LINO COAST SHIPS AGAINST THE RECOMMENDATION AND THAT IS FINE. The round
  // five write-up called it the one that does not work, 0.0021 chroma against
  // the Lake's 0.0216, near enough to plain dark mode to read as no theme. It
  // was chosen anyway. Do not quietly drop it or "fix" it by brightening the file.
  //
  // ORBIT RINGS IS THE ONE PICTURE THAT DOES NOT COME BACK. Two decisions
  // disagree about it, and the later one wins until it is revisited.
  //
  // IT IS ALSO WHAT PUTS AN EXISTING WINDOW BACK ON PLAIN DARK. `resolveSkin`
  // answers 'none' for any id not in this array, and a store can still hold
  // `zero.skin` = orbit-rings. Restoring the list with this line in it would
  // paint the removed picture straight back onto that app the moment the build
  // opened.
  //
  // The photograph, the CSS rule and the swatch are all still here. Putting the
  // line below back is the whole of undoing this. { id: 'orbit-rings', name:
  // 'Orbit Rings', note: 'Airbrushed cover art. A ringed giant rising over a
  // dark moon.
];

// THE THEME LAB IS GONE. `registerLabSkins` used to append candidate pictures
// to SKINS at boot so the strip, Settings' tiles and the Command-K rows all
// saw them without knowing they were candidates. The strip was removed, so
// SKINS below is now the whole truth and nothing appends to it at
// runtime.
export const SKIN_KEY = 'zero.skin';

// Anything at all can be in localStorage, including a skin this build has
// removed. An unknown name is no picture, never a `data-skin` the stylesheet
// has no block for, which would be a window with a photograph token set to
// `none` and surfaces already made translucent over nothing.
export function resolveSkin(stored: string | null | undefined): SkinChoice {
  return SKINS.some((s) => s.id === stored) ? (stored as SkinId) : 'none';
}

export function skinName(skin: SkinChoice): string {
  return SKINS.find((s) => s.id === skin)?.name ?? 'None';
}

// THE ONE CONTROL. `look` is what she picks: a theme or a picture, never both.
// Everything else in the app keeps reading `theme` and `skin` separately, so
// this is a translation at the edge rather than a fourth piece of state.
//
// `match` IS A THEME, NOT A FOURTH KIND OF THING. It is stored on the theme key
// exactly where light and dark are stored (`ThemePick` in theme.ts), and the
// window it produces is one of those two. What it adds is only that the answer
// is asked again on every paint instead of once.
export type Look = 'light' | 'dark' | 'match' | SkinId;

// The theme half of this is the PICK, not the resolved colour: somebody on
// Match my system on a light Mac must see the Match tile ticked, not Light.
export function lookOf(theme: 'light' | 'dark' | 'match', skin: SkinChoice): Look {
  return skin === 'none' ? theme : skin;
}

/**
 * EVERY LOOK THERE IS, IN THE ORDER SOMEBODY MEETS THEM: the two themes that
 * have always been here, then the pictures. It lives here rather than in a
 * component because TWO screens draw it now — Settings and the walk's own
 * fourth step — and a second copy of a list kept in step with the first by
 * nothing is the fault that broke the introduction's Next button and the tab
 * tour on the same day. */
// Haze defaults lead; plain surfaces remain available at the end.
export const LOOKS: Array<{ id: Look; name: string }> = [
  ...SKINS.map((sk) => ({ id: sk.id as Look, name: sk.name })),
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

/**
 * Resolve old preferences once before the first paint. Explicit plain themes
 * remain plain. The retired system picker migrates to the current Haze mode. */
export function normalizeSavedLook(store: {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}, system: ThemeChoice = resolveTheme('match')): void {
  const theme = store.getItem(THEME_KEY);
  const skin = store.getItem(SKIN_KEY);
  // Background 1 was retired when the user selected background 2.
  if (skin === 'peach-haze') {
    store.setItem(THEME_KEY, 'light');
    store.setItem(SKIN_KEY, 'peach-haze-2');
    return;
  }
  // A BRAND NEW MAC GETS THE DEFAULT, WHATEVER ITS OWN LIGHT OR DARK SAYS.
  // This runs before `seedFirstRunLook`, so without this line an empty store
  // was answered by the haze pair below and the default never reached anyone.
  // The ember theme is the default (w-3fc39983be).
  if (theme === null && skin === null) {
    const look = lookMeans(DEFAULT_SKIN);
    store.setItem(THEME_KEY, look.theme);
    store.setItem(SKIN_KEY, String(look.skin));
    return;
  }
  const retired = ['ice-river', 'lake-harbour', 'moon-pines', 'cel-dusk', 'pixel-harbour', 'vector-dunes', 'lino-coast'];
  if (theme === 'match' || skin === null || retired.includes(skin)) {
    const mode = theme === 'match' ? system : resolveTheme(theme);
    const selected = skin && resolveSkin(skin) !== 'none' ? lookMeans(skin)
      : lookMeans(mode === 'light' ? 'frost-haze' : 'valley-haze');
    store.setItem(THEME_KEY, selected.theme);
    store.setItem(SKIN_KEY, selected.skin);
  }
}

export function lookMeans(look: Look): { theme: 'light' | 'dark' | 'match'; skin: SkinChoice } {
  if (look === 'light') return { theme: 'light', skin: 'none' };
  if (look === 'dark') return { theme: 'dark', skin: 'none' };
  // STORED AS `match`, RESOLVED LATER. Turning it into light or dark here would
  // freeze the Mac's opinion at the moment of the press, which is the one thing
  // this look exists not to do.
  if (look === 'match') return { theme: 'match', skin: 'none' };
  // Everything else is a picture, and a picture is dark UNLESS ITS OWN ENTRY
  // SAYS OTHERWISE. Picking a photograph from the light theme must not leave
  // dark ink on a landscape, which is what this line has always been for. The
  // three light hazes are washes rather than landscapes and carry `light: true`;
  // for them the same reasoning runs the other way, and leaving pale ink on
  // paper would be the unreadable one.
  //
  // READ OFF `SKINS`, so a picture with no entry keeps the old answer. An id
  // that is not in the list is not a picture this build has, and resolveSkin
  // refuses it long before anything paints.
  return { theme: SKINS.find((s) => s.id === look)?.light ? 'light' : 'dark', skin: look };
}

type Root = {
  setAttribute(k: string, v: string): void;
  removeAttribute(k: string): void;
};

// No skin REMOVES the attribute rather than setting it to "none", so
// `:root[data-skin]` in the stylesheet is the whole of "a picture is on" and a
// window with no picture matches none of the skin rules at all.
export function applySkin(skin: SkinChoice, root: Root = document.documentElement): void {
  if (skin === 'none') root.removeAttribute('data-skin');
  else root.setAttribute('data-skin', skin);
}

/* ------------------------- one picture, two sizes ------------------------- */
// TWO SCREENS DISAGREE ABOUT THE SAME PICTURE, so each one ships twice.
//
// The redraw is NOT reverted and the small copy is NOT a second drawing: every
// '-sm' file is the shipped picture resampled down to 1536 wide by
// scripts/webp-downscale.mjs, so a theme is the same photograph on both screens
// and only the grain changes.
//
// 1536 IS MEASURED, NOT CHOSEN. scripts/measure-photo-detail.mjs, mean gradient
// at a common 1440px painted width, against the art from before the redraw:
//
//   theme            before   redrawn   at 1536   vs before
//   orbit-rings       1.975     3.602     2.157       +9%
//   woodblock-sea    10.440    12.609    10.039       -4%
//   riso-hills       15.630    17.650    14.188       -9%
//   pixel-ridge       1.551     1.784     1.587       +2%
//
// 1728 came back at 3.091 on orbit-rings, which is the sharp set again, and
// 1280 undershot. So 1536 is the width that gives back the earlier quality
// and nothing else does.
//
// WHICH SCREEN IS WHICH IS NOT DECIDED HERE. main/screen-detail.mjs decides it,
// because the honest signal (the display's own density, and whether it is the
// built-in panel) is only visible to the main process; devicePixelRatio in this
// window has any page zoom (120%, say) folded into it and lies.
export type SkinDetail = 'soft' | 'sharp';

// The stylesheet carries the sharp set as the plain rule and the soft set as an
// override on this attribute, so 'sharp' REMOVES it rather than spelling it
// out. That way a window that never hears from main, and a page in a test
// harness that has no main at all, both paint exactly what they painted before
// any of this existed.
export function applySkinDetail(detail: SkinDetail, root: Root = document.documentElement): void {
  if (detail === 'soft') root.setAttribute('data-skin-detail', 'soft');
  else root.removeAttribute('data-skin-detail');
}

// Anything that is not the word 'soft' is 'sharp', for the reason above: an
// unreadable message from main must not be able to downgrade a picture.
export function resolveSkinDetail(sent: string | null | undefined): SkinDetail {
  return sent === 'soft' ? 'soft' : 'sharp';
}

/* ------------------------------ the dials -------------------------------- */
// A PICTURE THEME IS A MATTER OF TASTE, SO IT IS THE USER'S TO SET, NOT OURS
// TO GUESS. These two numbers are the whole of it: how soft the
// photograph goes behind the words, and how far down it is turned. They are
// stored per skin, because the next picture will want its own.
export type SkinTune = {
  panelOpacity?: number;
  backgroundBlur?: number;
  // Pixels of backdrop blur behind the card. 0 is a photograph you can read
  // every branch of; the first build shipped 6 and that was much too much.
  blur: number;
  // How far the picture is turned down, 0..1, as the alpha of a flat dark
  // wash over it. Below about 0.3 the sunset starts to out-shout the words.
  dim: number;
};

export const TUNE_KEY = 'zero.skin.tune';

// The range each dial travels, and the value it starts at.
//
// The reference drawing and background-large.png are the same photograph at
// 1:1, so the veil can be read straight out of the difference. Fitted per
// channel over 262k pixels of the drawn window with no type near them, the
// ground is
// out = 0.247 / 0.307 / 0.374 * src + 19.9 / 19.5 / 17.6, which the stylesheet
// says as the photograph multiplied by rgb(168, 209, 255) under a flat
// rgb(32, 31, 28) at alpha 0.63.
// Scanning blur before the fit moves the correlation by 0.02 and never peaks,
// so there is none: the picture is sharp and what makes it quiet is the veil.
// `scripts/read-her-mockup.mjs` and `scripts/fit-her-veil.mjs` are the read,
// and styles.css carries the whole table beside the tokens.
export const TUNE_LIMITS = {
  panelOpacity: { min: 0, max: 1, step: 0.01 },
  backgroundBlur: { min: 0, max: 80, step: 1 },
  blur: { min: 0, max: 80, step: 1 },
  // 0, NOT 0.15, AND THE FLOOR MOVED FOR A MEASURED REASON. 0.15 was set when
  // there was one picture and it was a normally exposed photograph that needed
  // turning down. The theme lab's candidates include pictures of genuinely dark
  // things — a night sky, black silk, a glacier mouth — and six of the fifteen
  // sit BELOW the veil colour's own luminance, so on those the veil at any
  // alpha makes the window LIGHTER, not darker, and 0.15 is a floor on how much
  // of the app's grey is mixed into the photograph rather than a floor on
  // darkness. The app is the honest bottom of "how far down is it turned". NOTHING
  // ALREADY SET MOVED: TUNE_DEFAULT.lake is still 2 and 0.63.
  dim: { min: 0, max: 0.85, step: 0.01 },
} as const;

export const TUNE_DEFAULT: Record<SkinId, SkinTune> = {
  // BOTH NUMBERS WERE CHOSEN AND NEITHER IS A GUESS, so do not move them by
  // eye. They came from a focus ladder on this photograph, where step 3,
  // nearly a wash, won.
  //
  // WHERE 0.63 CAME FROM, which outlives the picture it was solved on: it was
  // FITTED against a reference drawing of the Mountain theme, per channel over
  // 262k pixels (scripts/fit-her-veil.mjs). Mountain was removed on 08-18 and
  // its dim is the one thing of it worth keeping, because it is the only
  // number here anyone ever measured rather than chose.
  lake: { blur: 8, backgroundBlur: 5, dim: 0.63 },
  // THE FIFTEEN. THE BLUR IS THE LAKE'S BECAUSE IT WAS SET THERE AND NOTHING
  // SAYS IT IS PER PICTURE; the dim is each picture's own and is MEASURED, not chosen.
  // Each was scanned over its whole range and set to the alpha whose luminance
  // BEHIND THE INBOX CARD lands on the Lake's 0.0274, which is what makes one
  // veil work over pictures of different brightness
  // (scripts/measure-theme-pictures.mjs, designs//pictures3.json for the first
  // three, pictures4.json for the eight below them).
  //
  // ICE CANNOT REACH IT AND WAS PICKED ANYWAY. At the floor of its range it
  // lands at 0.0127, less than half the Lake, because it is a picture of a
  // shadowed cave; 0.85 is that floor.Do not "fix" it by brightening the file.
  ice: { blur: 2, dim: 0.85 },
  'ice-river': { blur: 2, dim: 0.735 },
  'lake-harbour': { blur: 2, dim: 0.68 },
  // THE SPREAD HERE IS THE WHOLE POINT OF SOLVING IT PER PICTURE. Pixel Orbit
  // is a night plain and needs 0.36; Riso Hills is a print on off-white paper
  // and needs 0.85. One shared alpha would have made the first one loud and
  // the second one mud.
  'pixel-ridge': { blur: 4, backgroundBlur: 6, dim: 0.77 },
  'pixel-orbit': { blur: 0, backgroundBlur: 5, dim: 0.2 },
  'woodblock-sea': { blur: 4, backgroundBlur: 12, dim: 0.84 },
  'riso-hills': { blur: 2, backgroundBlur: 3, dim: 0.85 },
  'gouache-valley': { blur: 4, backgroundBlur: 5, dim: 0.75 },
  'vector-dunes': { blur: 2, dim: 0.775 },
  'watercolour-mist': { blur: 2, backgroundBlur: 4, dim: 0.85 },
  // ROUND FIVE'S FIVE. Same read, same script, and the spread is wider still
  // because these pictures were drawn dark rather than veiled dark. Orbit Rings
  // and Pixel Harbour need NO veil at all: at the floor of the range they still
  // land below the Lake's 0.0274 behind the card, so zero is the honest answer
  // and not a missing value (designs//pictures5.json).
  'orbit-rings': { blur: 2, dim: 0 },
  'moon-pines': { blur: 2, dim: 0 },
  'cel-dusk': { blur: 2, dim: 0 },
  'pixel-harbour': { blur: 2, dim: 0 },
  // The one that needs the whole veil, and it is the one the write-up flagged:
  // a linocut in dark inks is already at the ground, so the alpha is doing
  // nothing but the last of the muting.
  'lino-coast': { blur: 2, dim: 0.85 },
  // ZERO, AND FOR THE SAME REASON AS THE FOUR ABOVE: the picture arrives
  // treated. The reference window ran brightness(.66) over the blur, and a veil is one
  // flat alpha and cannot say a multiply, so the .66 is baked into the file and
  // there is nothing left for the veil to do. Sliding dim up still darkens it,
  // which is what the dial is for.
  'valley-haze': { blur: 2, dim: 0 },
  // ZERO FOR THE WHOLE FAMILY, for the reason above it: every one of these
  // pictures arrives already multiplied down by scripts/make-haze.mjs, onto a
  // mean that was solved. A veil on top would darken a number that was chosen,
  // which is the one thing that would make the ladder between them meaningless.
  // Sliding the dial still darkens any of them, which is what the dial is for.
  // The light three, zero for the same reason as the rest of the family: the
  // wash they ship with is already solved, and the veil that would darken it
  // here is baked into the picture. On these the veil is WHITE rather than
  // dark, which is the only thing about them that is not the dark recipe.
  'frost-haze': { blur: 2, dim: 0 },
  'slate-haze': { blur: 2, dim: 0 },
  'orbital-glass': { blur: 30, dim: .3, backgroundBlur: 24, panelOpacity: .16 },
  'peach-haze-2': { blur: 0, dim: 0.35, backgroundBlur: 0, panelOpacity: 0.2 },
  // Zero and zero: the film's panels are solid, so there is nothing behind
  // them to blur, and its ground is already the black it wants to be.
  'ember-grid': { blur: 0, dim: 0 },
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// Anything at all can be in localStorage, including a number from a build that
// allowed a wider range, a string, or a shape from a skin this build removed.
// An unreadable store is the default, never a NaN written into a CSS variable,
// which is a window with no blur value at all and a card that goes opaque.
export function resolveTune(stored: string | null | undefined, skin: SkinId): SkinTune {
  // A skin with no defaults registered is not a crash. It happens for one real
  // reason: localStorage still names a theme-lab picture and this build is one
  // scripts/release.mjs made, so the lab and its table are not in it.
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

// The dials reach the stylesheet as two custom properties on the root element,
// which is why every skin rule spends them through var rather than naming a
// number. An inline property on the root outranks any selector, so this is also
// what makes the sliders move the live window rather than the next reload.
export function applyTune(tune: SkinTune, root: { style: { setProperty(k: string, v: string): void } } = document.documentElement): void {
  root.style.setProperty('--skin-panel-opacity', tune.panelOpacity === undefined ? '' : String(tune.panelOpacity));
  root.style.setProperty('--skin-background-blur', `${tune.backgroundBlur ?? 0}px`);
  root.style.setProperty('--skin-blur', `${tune.blur}px`);
  root.style.setProperty('--skin-dim', String(tune.dim));
}

/* ------------------------- the app's own picture --------------------------- */
// It was the lake until then, and the lake is not deleted: it is still in
// SKINS, still pickable, still carries its two measured dials. What moved
// is which picture a Mac that has never chosen one is wearing.
//
// THIS ONE CONSTANT DOES THREE JOBS and they all moved together, because they
// are the same sentence read three ways: it is what inbox zero pins, what the
// three setup screens pin, and what `seedFirstRunLook` writes into an empty
// store. Splitting them would have given an app whose default is Gouache
// Valley and whose inbox-zero page is a different photograph.
//
// THE INBOX ZERO PAGE IS ALWAYS A PICTURE, whatever the app is set to.
//
// So this is a deliberate exception to everything above, and it is ONE PAGE
// wide: App.tsx applies it while that screen is the ground and puts her look
// straight back when it is not. Nothing is stored, so the setting she picked is
// still the setting she picked.
//
// THE PIN IS THE FALLBACK, NOT THE RULE. The question left
// open was what should happen once there are many pictures to pick from. There
// are sixteen now, and a walk whose last two screens wore this constant after a
// picture had been chosen read as the app forgetting the choice. So the app
// remembers the theme you chose, and the pin is the fallback rather than the
// rule.
//
// Somebody with a PICTURE on keeps that picture at inbox zero, because the
// picture is the nice theme. This constant is what inbox zero falls back to
// for somebody on plain Light or Dark with no picture at all. The clause is
// `skin === 'none'` in App.tsx and it is the only place it is decided.
//
// THE FIRST RUN'S THREE SETUP SCREENS TAKE THIS SAME PIN (App.tsx), and for a
// reason that is separate but agrees: on a first run nothing has chosen a
// picture yet, so a screen that waits to inherit one gets a charcoal slab. Two
// decisions, one value. If a second picture ever makes this a preference, both
// of them become that preference together.
//
// AND THE THIRD DECISION: it is what a brand new Mac STARTS on,
// everywhere, not just on the two surfaces that pin it. Seeded by
// `seedFirstRunLook` below. Valley Haze later replaced the former Gouache
// Valley default, and Ember Grid then replaced Valley Haze (w-3fc39983be).
// Valley Haze stays first in the list; the default and the order are separate decisions.
export const DEFAULT_SKIN: SkinId = 'ember-grid';

/**
 * THE PICTURE INBOX ZERO WEARS, WHICH IS THE ONE THAT WAS PICKED AND NOTHING
 * OTHERWISE. This used to answer Gouache Valley for somebody who had chosen no
 * picture, so the idle page wore a photograph nobody asked for.
 *
 * Deleting the sixteen pictures took the pictures away and left the rule that
 * put them there, which is the wrong half. The rule now, everywhere in this
 * file, is that a picture appears where somebody picked one and nowhere else.
 * Inbox zero is dark whatever the rest of the window is.
 */
export function idleSkin(skin: SkinChoice): SkinChoice {
  return skin;
}

/**
 * THE PICTURE THE WALK OPENS ON, which is NOT the same rule as the idle page
 * above and is deliberately its own function so the two cannot be conflated
 * again.
 *
 * THE AUTO-SELECTED THEME WAS MATCH MY SYSTEM. The six screens before the
 * picker used to paint `idleSkin(skin)`, which is nothing at all for the many
 * people who are on plain Light, plain Dark or Match my system, so the walk
 * overruled the Mac and opened on six charcoal slabs. The introduction is the
 * first thing anybody ever sees of this app and it was the plainest screen in it.
 *
 * SO: the user's own picture when one has been picked, and Gouache Valley when
 * not. The first half is an earlier decision and is not being taken back; the
 * second is this row.
 *
 * IT PAINTS AND IT STORES NOTHING. That is what keeps an earlier fault
 * fixed: the walk may WEAR a picture and may not put one on her.
 * `startTheWalkOnAPicture`, which wrote one, is still deleted and this is not
 * it coming back.
 */
export function walkSkin(skin: SkinChoice): SkinChoice {
  return skin === 'none' || skin === DEFAULT_SKIN ? WALK_PICTURE : skin;
}

/**
 * THE LANDSCAPE BEHIND SETUP (w-ec62ab6b38). Ember Grid became the
 * default for a new Mac, and because `walkSkin` fell back to the
 * default, every screen before the theme picker turned into near-black dots.
 * A landscape behind setup, before a theme is chosen, is the better first
 * impression. So the walk opens on Gouache Valley again, whatever the
 * default is, and a picture somebody picked themselves still wins. Nothing is
 * stored: from the picker on, the window wears what is saved.
 */
export const WALK_PICTURE: SkinChoice = 'gouache-valley';

// ------------------------- what a new Mac starts on ------------------------
// A PIN IS NOT A DEFAULT, and confusing the two is what a tester saw. The first
// three setup screens and inbox zero PIN the lake, which means they paint it
// and store nothing. Every other screen reads the store, and on a fresh
// install the store is empty, so the app fell through to what the Mac
// preferred. That Mac was light. Inbox zero was the lake, In progress was
// light, and the walk turned white the moment it left the third screen.
//
// So on a first run we WRITE the look down rather than leaving the question
// open. Both keys, because a picture is dark (`lookMeans`) and a stored skin
// with no stored theme is the same disagreement one layer down.
//
// IT ONLY EVER WRITES INTO AN EMPTY STORE. Someone who has already chosen
// anything, including someone who chose plain dark years of releases ago, is
// left exactly as they are: this is the fresh-install default, not a migration
// and not a reset. That guard is also what makes `?firstrun=1` safe to walk on
// a Mac that is already set up.
//
// Returns what it wrote so the caller can put the running window on it in the
// same beat, because localStorage is read once at mount and never watched.
//
// AND WHAT IT WRITES IS THE DEFAULT PICTURE, A DECISION MADE MORE THAN ONCE.
//
// It seeded a picture until one change read an earlier fault as a
// ruling that no default may be a picture, and changed this to plain dark. That
// fault was about a look being PUT ON a window without anybody picking
// it, which is the pin and not the seed, and that half stays fixed.
//
// A picture default has been chosen repeatedly (first the Lake during
// onboarding, then Gouache Valley by name), and the latest choice wins.
//
// WHAT IT BUYS: a brand new Mac walks the
// whole introduction on the default picture and then opens the picker with it
// ALREADY TICKED, so the window does not change under them at any point.
// That is the flicker seen on first runs, and the seed is the only thing
// that can close it, because the picker must show the truth and the truth is
// whatever is stored.
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

// -------- what the walk is wearing, and why nothing puts it there any more ---
// `startTheWalkOnAPicture` WAS HERE AND IT IS DELETED. It wrote Gouache Valley
// into any store that had no picture, every time the walk started, and ⌘K's
// "Run the onboarding again" is a row people use. So walking the tutorial on a
// Mac that was set up left a photograph on it afterwards, chosen by us.
//
// Being moved onto one was.
//
// WHAT IT WAS TRYING TO FIX IS REAL AND IS STILL FIXED.That flicker was the
// setup screens PAINTING a picture over a store that said something else, so
// the picker on beat seven opened white with Light ticked while the screen
// behind it was a valley. Nothing paints a look it has not stored now, and
// `firstRunPinned` is what holds it: the walk wears the stored look from the
// first screen to the last, whatever that look is, and on a Mac that has chosen
// nothing that is plain dark all the way through. The picker's tick and the
// window agree either way, which is the whole of what was wanted.
//
// DO NOT PUT A FUNCTION LIKE THIS BACK to make the walk prettier. The walk may
// SHOW every picture, on its own look step, and it may not put one on for her.
