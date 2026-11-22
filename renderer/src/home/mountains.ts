// The website's dithered mountains (agentbox.ac's hero), drawn once on the CPU:
// four ranges of ridged noise, fainter with distance, faces lit or shaded by
// slope, one bit per 3px dot decided by an 8x8 Bayer matrix.

export type Rgb = [number, number, number];
/** An ellipse the ranges thin out inside, in shares of the card: x from the left, y from the foot. */
export type Quiet = { x: number; y: number; rx: number; ry: number };
export type Mountains = {
  /** One ink per range, nearest first. */
  inks: [Rgb, Rgb, Rgb, Rgb];
  alpha: number;
  /** How far up the card the ranges reach; 1 is the website's. */
  lift: number;
  /** Which stretch of the ranges is drawn. */
  at?: number;
  quiet?: Quiet | null;
};
export type MountainDot = { x: number; y: number; range: number };

const fr = (x: number) => x - Math.floor(x);
const h = (x: number, y: number) => fr(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const ss = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function vn(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return mix(mix(h(ix, iy), h(ix + 1, iy), fx), mix(h(ix, iy + 1), h(ix + 1, iy + 1), fx), fy);
}
function ridge(x: number, s: number, n: number) {
  let v = 0, a = 0.62, f = 1;
  for (let k = 0; k < n; k++) { const r = 1 - Math.abs(vn(x * f, s + k * 7) * 2 - 1); v += Math.pow(r, 2.2) * a; f *= 2.1; a *= 0.38; }
  return v;
}
const b2 = (x: number, y: number) => fr(Math.floor(x) / 2 + Math.floor(y) * Math.floor(y) * 0.75);
const b8 = (x: number, y: number) => (b2(0.25 * x, 0.25 * y) * 0.25 + b2(0.5 * x, 0.5 * y)) * 0.25 + b2(x, y);

/** base height, height, frequency, drift: nearest range first. */
const RANGES: [number, number, number, number][] = [[-0.03, 0.26, 1.9, 0.011], [0.05, 0.36, 1.3, 0.006], [0.12, 0.44, 0.95, 0.003], [0.18, 0.5, 0.75, 0.0015]];
const TONE = [1, 0.82, 0.66, 0.5];

/** Every dot the ranges light on a W×H card, top-left corners in px from the card's top left. */
export function mountainDots(W: number, H: number, m: Mountains, pitch = 3): MountainDot[] {
  const out: MountainDot[] = [];
  const cols = Math.ceil(W / pitch), rows = Math.ceil(H / pitch), at = m.at ?? 55, q = m.quiet;
  for (let cx = 0; cx < cols; cx++) {
    const ux = (cx * pitch) / W, x = (ux * W) / H;
    const tops = RANGES.map((l, i) => {
      const xs = x * l[2] + at * l[3] + i * 13.1, s = i * 31.7;
      return { top: (l[0] + l[1] * Math.pow(ridge(xs, s, 5), 1.6)) * m.lift, slope: ridge(xs + 0.03, s, 2) - ridge(xs - 0.03, s, 2) };
    });
    const highest = Math.max(...tops.map((t) => t.top));
    for (let cy = 0; cy < rows; cy++) {
      const y = (cy * pitch) / H;
      if (y >= highest) break;
      let v = 0, range = 0;
      for (let i = 0; i < 4; i++) {
        if (y >= tops[i].top) continue;
        const lit = mix(0.5, 1, ss(-0.01, 0.01, tops[i].slope)), depth = (tops[i].top - y) / (RANGES[i][1] * m.lift);
        const body = mix(1, 0.12, ss(0, 0.55, depth)), edge = 1 - ss(0, 0.01, tops[i].top - y), mist = 0.75 + 0.25 * vn(x * 3 - at * 0.04, y * 9);
        v = TONE[i] * Math.max(lit * body * mist, edge); range = i; break;
      }
      v *= ss(0, 0.24, y);
      if (q) v *= ss(0.5, 1.4, ((ux - q.x) / q.rx) ** 2 + ((y - q.y) / q.ry) ** 2);
      if (v <= 0 || Math.min(1, v) < b8(cx, cy) + 0.004) continue;
      out.push({ x: cx * pitch, y: H - (cy + 1) * pitch, range });
    }
  }
  return out;
}

/** Paints the ranges into `canvas` at its CSS size, over `ground`, which fades to `foot` at the bottom when given. */
export function drawMountains(canvas: HTMLCanvasElement, m: Mountains, { dpr = 2, ground = null, foot = null, pitch = 3 }: { dpr?: number; ground?: string | null; foot?: string | null; pitch?: number } = {}) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (ground) {
    const fill = g.createLinearGradient(0, 0, 0, H);
    fill.addColorStop(0.4, ground); fill.addColorStop(1, foot ?? ground);
    g.fillStyle = fill; g.fillRect(0, 0, W, H);
  }
  const dots = mountainDots(W, H, m, pitch);
  for (let r = 0; r < 4; r++) {
    const [R, G, B] = m.inks[r];
    g.fillStyle = `rgba(${R},${G},${B},${m.alpha})`;
    for (const d of dots) if (d.range === r) g.fillRect(d.x, d.y, pitch - 0.9, pitch - 0.9);
  }
}
