// The dithered sky drawn behind Home and the Inbox.
// Square dots on a grid, four levels per channel, ordered by an 8x8 Bayer
// matrix: a bright streak with a glow on its upper side and sparse grain.

export type Rgb = [number, number, number];
export type Palette = { core: Rgb; hot: Rgb; halo: Rgb; ember: Rgb };
/** colour, line width, blur, vertical offset */
export type Glow = [string, number, number, number];

export type SkyArt = {
  palette: Palette;
  /** Panel colour under the dots. */
  bg: string;
  y0: number; y1: number; bend: number;
  peak: number; fall?: number;
  dim?: number; coreW?: number; hotW?: number; haloW?: number;
  grain?: number;
  light?: boolean; lightBg?: Rgb; lightStrength?: number; lightDepth?: number;
  glow?: Glow[];
};

export type SkyId = string;
/** A theme of its own: the window's light or dark look, with this sky on Home and the Inbox. */
export type Sky = { id: SkyId; name: string; dark: boolean; art: SkyArt; frame?: string };

const DUSK: Palette = { core: [235, 85, 150], hot: [255, 195, 160], halo: [105, 60, 185], ember: [150, 40, 90] };
const EMBER: Palette = { core: [250, 92, 28], hot: [140, 150, 90], halo: [30, 92, 175], ember: [170, 55, 20] };
const AURORA: Palette = { core: [50, 215, 150], hot: [170, 255, 205], halo: [50, 80, 175], ember: [20, 110, 90] };

const DARK_BASE = { y0: 1.0, y1: 0.36, bend: -0.1, dim: 0.95, peak: 0.7, coreW: 0.024, haloW: 0.3, grain: 0.1 };

// The card stays a step off black so rows and text keep their contrast.
const DARK_SKIES: Sky[] = [
  { id: 'dusk', name: 'Dark purple sky', dark: true, art: { ...DARK_BASE, palette: DUSK, bg: '#1a171d' } },
  { id: 'ember', name: 'Dark orange sky', dark: true, art: { ...DARK_BASE, palette: EMBER, bg: '#1b1917', y0: 0.25, y1: 1.0, peak: 0.3 } },
  { id: 'aurora', name: 'Dark green sky', dark: true, art: { ...DARK_BASE, palette: AURORA, bg: '#161a19', y0: 0.6, y1: 0.68, bend: -0.55, peak: 0.55, fall: 0.5 } },
];

const light = (palette: Palette, glow: Glow[]): SkyArt => ({
  ...DARK_BASE, coreW: 0.03, haloW: 0.22, palette, glow,
  bg: '#ffffff', light: true, lightBg: [255, 255, 255], dim: 1, grain: 0.03, lightStrength: 1, lightDepth: 165,
});

// The card is white and the sky fades into it, the way dark fades to black.
// `frame` tints the window around the card so the white stands off it.
const LIGHT_SKIES: Sky[] = [
  { id: 'sage', name: 'Light green sky', dark: false, frame: '#e3e8e5', art: light(
    { core: [40, 160, 125], hot: [170, 215, 120], halo: [70, 135, 190], ember: [40, 120, 100] },
    [['rgba(90,150,200,0.30)', 280, 90, -130], ['rgba(80,185,150,0.40)', 120, 50, -10], ['rgba(190,225,140,0.55)', 34, 18, 0]]) },
  { id: 'dusk-light', name: 'Light purple sky', dark: false, frame: '#ebe5e9', art: light(
    { core: [240, 90, 160], hot: [255, 150, 150], halo: [130, 100, 225], ember: [200, 80, 150] },
    [['rgba(170,140,240,0.30)', 260, 90, -120], ['rgba(255,150,195,0.42)', 120, 50, -10], ['rgba(255,185,170,0.50)', 34, 18, 0]]) },
];

/** Every sky theme, in the order Settings and Command-K show them. */
export const SKY_THEMES: Sky[] = [...DARK_SKIES, ...LIGHT_SKIES];

export function skyTheme(id: string | null | undefined): Sky | null {
  return SKY_THEMES.find((s) => s.id === id) ?? null;
}

/** Stored when plain Light or Dark is picked, so the default sky never covers that choice. */
export const PLAIN = 'none';

/** The sky worn: the one picked, none for a plain look picked, and otherwise orange in the dark and green in the light. */
export function shownSkyId(saved: string | null, dark: boolean): SkyId | null {
  if (saved === PLAIN) return null;
  return skyTheme(saved)?.id ?? (dark ? 'ember' : 'sage');
}

/** The look step's choice that follows the Mac: it saves no sky, so shownSkyId wears orange in the dark and green in the light. */
export const MATCH_SKY = 'match';

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

/** Paints `art` into `canvas` at its CSS size. Dots start at `from` px and are
 *  fully in by `from + span`, dropping out in the ordered pattern above that. */
/** `curveTop` lays the streak out in the card below that line instead of the whole card. */
export function drawSky(canvas: HTMLCanvasElement, art: SkyArt, { from, span, dpr = 2, curveTop = 0 }: { from: number; span: number; dpr?: number; curveTop?: number }) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pitch = 3, dot = 2;
  g.fillStyle = art.bg; g.fillRect(0, 0, W, H);
  const cols = Math.ceil(W / pitch), rows = Math.ceil(H / pitch);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const N = 64, grid = Array.from({ length: N * N }, rnd);
  const at = (x: number, y: number) => grid[((y % N + N) % N) * N + ((x % N + N) % N)];
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    const s = xf * xf * (3 - 2 * xf), t = yf * yf * (3 - 2 * yf);
    return a + (b - a) * s + (c - a) * t + (a - b - c + d) * s * t;
  };
  const { y0, y1, bend, palette: P } = art;
  const CH = H - curveTop;
  const S = Math.max(W, H);
  const dim = art.dim ?? 1, coreW = art.coreW ?? 0.022, hotW = art.hotW ?? 0.006, haloW = art.haloW ?? 0.2;
  const grain = art.grain ?? 0.16, peak = art.peak, fall = art.fall ?? 0.9;
  const levels = 4;
  const keepAt = (y: number) => Math.min(1, Math.max(0, (y - from) / span));

  if (art.light && art.glow) {
    const gc = document.createElement('canvas'); gc.width = canvas.width; gc.height = canvas.height;
    const gx = gc.getContext('2d');
    if (gx) {
      gx.scale(dpr, dpr);
      const path = () => { gx.beginPath(); for (let xx = -40; xx <= W + 40; xx += 8) { const t = xx / W; const yy = curveTop + (y0 + (y1 - y0) * t + bend * t * (1 - t)) * CH; if (xx === -40) gx.moveTo(xx, yy); else gx.lineTo(xx, yy); } };
      for (const [col, w, bl, dy] of art.glow) { gx.save(); gx.filter = `blur(${bl}px)`; gx.strokeStyle = col; gx.lineWidth = w; gx.lineCap = 'round'; gx.translate(0, dy); path(); gx.stroke(); gx.restore(); }
      gx.globalCompositeOperation = 'destination-in';
      const gr = gx.createLinearGradient(0, from, 0, from + span + 120);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      gx.fillStyle = gr; gx.fillRect(0, 0, W, H);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(gc, 0, 0); g.restore();
    }
  }

  const q = (v: number, th: number) => { const s = Math.min(1, Math.max(0, v / 255)) * (levels - 1); const f = Math.floor(s); return ((f + (s - f > th ? 1 : 0)) / (levels - 1)) * 255; };
  const LB = art.lightBg ?? [255, 255, 255];
  for (let j = 0; j < rows; j++) {
    const y = j * pitch;
    const keep = keepAt(y);
    if (keep <= 0) continue;
    for (let i = 0; i < cols; i++) {
      const x = i * pitch;
      const t = x / W;
      const cyv = curveTop + (y0 + (y1 - y0) * t + bend * t * (1 - t)) * CH;
      const slope = ((y1 - y0) + bend * (1 - 2 * t)) * CH / W;
      const d = ((cyv - y) / Math.sqrt(1 + slope * slope)) / S;
      const n = vn(i / 22, j / 22) * 0.6 + vn(i / 6, j / 6) * 0.4;
      const along = Math.max(0, 1 - Math.abs(t - peak) * fall);
      const dc = d + (vn(i / 40, 3) - 0.5) * coreW * 1.2;
      const core = Math.exp(-((dc / coreW) ** 2)) * (0.5 + 0.5 * n) * (0.35 + 0.65 * along);
      const hot = Math.exp(-(((dc + coreW * 0.25) / hotW) ** 2)) * along * (0.6 + 0.4 * n);
      const halo = dc > 0 ? Math.exp(-dc / haloW) * (0.3 + 0.7 * n) * (0.25 + 0.75 * along) : 0;
      const ember = dc < 0 ? Math.exp(dc / (coreW * 3)) * 0.45 * n * along : 0;
      const r = (core * P.core[0] + hot * P.hot[0] + halo * P.halo[0] + ember * P.ember[0]) * dim;
      const gg = (core * P.core[1] + hot * P.hot[1] + halo * P.halo[1] + ember * P.ember[1]) * dim;
      const b = (core * P.core[2] + hot * P.hot[2] + halo * P.halo[2] + ember * P.ember[2]) * dim;
      const th = (BAYER[(j % 8) * 8 + (i % 8)] + 0.5) / 64;
      let fadeK = 1;
      if (keep < 1) {
        const th2 = 0.5 * (BAYER[((j + 3) % 8) * 8 + ((i + 5) % 8)] + 0.5) / 64 + 0.5 * rnd();
        if (Math.pow(keep, 1.6) < th2) continue;
        fadeK = Math.pow(keep, 1.2);
      }
      let R = q(r * fadeK, th), G = q(gg * fadeK, th), B = q(b * fadeK, th);
      if (art.light) {
        const mx = Math.max(R, G, B);
        if (mx < 30) {
          if (rnd() < grain * fadeK) { const m = 214 + rnd() * 22; g.fillStyle = `rgb(${m | 0},${(m - 7) | 0},${(m - 1) | 0})`; g.fillRect(x, y, dot, dot); }
          continue;
        }
        const k = Math.min(1, mx / 255) * (art.lightStrength ?? 0.82);
        const sc = (art.lightDepth ?? 190) / mx;
        g.fillStyle = `rgb(${(LB[0] * (1 - k) + R * sc * k) | 0},${(LB[1] * (1 - k) + G * sc * k) | 0},${(LB[2] * (1 - k) + B * sc * k) | 0})`;
        g.fillRect(x, y, dot, dot);
        continue;
      }
      if (R + G + B < 30) {
        if (rnd() >= grain * fadeK) continue;
        const m = 20 + rnd() * 24; R = m * (0.7 + rnd() * 0.6); G = m * (0.7 + rnd() * 0.5); B = m * (0.7 + rnd() * 0.6);
      }
      g.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
      g.fillRect(x, y, dot, dot);
    }
  }
}
