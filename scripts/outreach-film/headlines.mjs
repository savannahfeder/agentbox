// The film's "three new headlines" picture: their live homepage, three times,
// each with only the hero headline's words changed, in their own font, size
// and colour, so it looks like their page because it is their page.
//
// usage: node headlines.mjs <domain> <out.png> "<headline 1>" "<headline 2>" "<headline 3>"
// prints each headline's line count; a headline that wraps to more lines than
// theirs, or pushes the hero past the crop, fails the check.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium, chromePath, DESKTOP_UA } from './lib/browser.mjs';

const [domain, out, ...heads] = process.argv.slice(2);
if (heads.length !== 3) throw new Error('three headlines');
const b = await chromium.launch({ executablePath: chromePath(), args: ['--hide-scrollbars'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2, userAgent: DESKTOP_UA, colorScheme: 'light' });
const page = await ctx.newPage();
await page.goto(`https://${domain}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => page.goto(`https://www.${domain}`, { waitUntil: 'domcontentloaded', timeout: 30000 }));
await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
await page.waitForTimeout(2000);
const b1 = page.getByRole('button', { name: /^(accept|accept all|allow all|agree|got it|ok)$/i }).first();
if (await b1.isVisible().catch(() => false)) await b1.click({ timeout: 2000 }).catch(() => {});
await page.evaluate(() => {
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el); if (cs.position !== 'fixed') continue;
    const t = (el.innerText || '').toLowerCase(); const id = `${el.id} ${el.className}`.toLowerCase();
    if (/cookie|consent/.test(t) || /intercom|crisp|drift|hubspot|launcher|tidio|zendesk/.test(id)) el.remove();
  }
  // Stop motion so all three pictures are drawn the same way.
  const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}'; document.head.appendChild(s);
  window.scrollTo(0, 0);
});
const before = await page.evaluate(() => {
  const heroEl = () => {
    const inFirst = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.height > 0 && r.width > 0 && r.top >= 0 && r.top < innerHeight * 0.85 && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
    const h1 = [...document.querySelectorAll('h1')].find(inFirst);
    if (h1 && h1.innerText.trim().length > 3) return h1;
    // No visible h1: the biggest words on the first screen are the hero.
    let best = null, size = 0;
    for (const e of document.querySelectorAll('h1,h2,h3,p,div,span')) {
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
      const t = e.innerText?.trim() ?? '';
      if (!own || t.length < 8 || t.length > 140 || !inFirst(e)) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs > size) { size = fs; best = e; }
    }
    return best;
  };
  const h = heroEl();
  if (!h) return null;
  h.id = h.id || 'film-hero';
  const r = h.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(h).lineHeight) || parseFloat(getComputedStyle(h).fontSize) * 1.15;
  return { id: h.id, text: h.innerText, box: [r.left, r.top, r.width, r.height], lines: Math.round(r.height / lh), lh };
});
if (!before) { console.error(`${domain}: no visible h1`); process.exit(2); }
// The crop: the headline with the line under it and the buttons, as the hero reads.
const clip = await page.evaluate(({ id }) => {
  const h = document.getElementById(id); const r = h.getBoundingClientRect();
  // The headline, the lines under it and the buttons: what sits in its column just below it.
  let L = r.left, T = r.top, Rt = r.right, B = r.bottom;
  for (const e of document.querySelectorAll('p, a, button, input, form, span')) {
    const q = e.getBoundingClientRect();
    if (q.width < 8 || q.height < 8 || q.width > 1000 || q.top < r.bottom - 2 || q.top > r.bottom + 230) continue;
    if (q.right < r.left - 120 || q.left > r.right + 120) continue;
    if (!(e.innerText || e.value || '').trim()) continue;
    L = Math.min(L, q.left); Rt = Math.max(Rt, q.right); B = Math.max(B, q.bottom);
  }
  const padX = 48, padY = 40;
  let x = Math.max(0, L - padX), w = Math.min(1440 - x, Rt - L + 2 * padX);
  // Never so wide that the words are small in the film; keep about 16:9 or taller.
  const y = Math.max(0, T - padY); let hgt = Math.min(810 - y, B - T + 2 * padY);
  if (w / hgt > 2.4) { const want = Math.min(810 - y, w / 2.4); hgt = Math.max(hgt, want); }
  return { x, y, width: w, height: hgt };
}, before);
const report = [];
const files = [];
for (const [i, text] of heads.entries()) {
  const got = await page.evaluate(({ id, text, lh, width }) => {
    // Some heroes size to their words; a new line wraps in the width theirs had.
    const hero = document.getElementById(id);
    hero.style.maxWidth = `${Math.ceil(width) + 2}px`; hero.style.whiteSpace = 'normal';
    const h = document.getElementById(id);
    // Keep their markup's first text styling: replace the words, not the element.
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT); const nodes = []; for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.textContent.trim()) nodes.push(t);
    if (nodes.length) { nodes[0].textContent = text; for (const t of nodes.slice(1)) t.textContent = ''; } else h.textContent = text;
    for (const br of h.querySelectorAll('br')) br.remove();
    const r = h.getBoundingClientRect();
    const rg = document.createRange(); rg.selectNodeContents(h); const tr = rg.getBoundingClientRect();
    const over = h.scrollWidth > h.clientWidth + 2 || [...h.querySelectorAll('*')].some((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible');
    return { lines: Math.round(r.height / lh), bottom: Math.max(r.bottom, tr.bottom), right: tr.right, left: tr.left, over };
  }, { id: before.id, text, lh: before.lh, width: before.box[2] });
  await page.waitForTimeout(300);
  const f = `${out}.${i + 1}.png`;
  await page.screenshot({ path: f, clip });
  files.push(f);
  const why = got.lines > Math.max(2, before.lines) ? 'lines' : got.bottom > clip.y + clip.height ? 'tall'
    : got.over || got.left < clip.x + 16 || got.right > clip.x + clip.width - 16 || got.right - got.left > 1440 ? 'wide' : null;
  report.push({ text, lines: got.lines, theirLines: before.lines, theirChars: before.text.replace(/\s+/g, ' ').trim().length, fits: !why, why });
}
await b.close();
// The three side by side, numbered, as the thread's picture.
execFileSync('python3', ['-P', '-c', `
import sys
from PIL import Image, ImageDraw, ImageFont
fs = sys.argv[2:]; ims = [Image.open(f).convert('RGB') for f in fs]
W, H = ims[0].size; gap = 40
sheet = Image.new('RGB', (W * 3 + gap * 4, H + gap * 2 + 90), (24, 24, 27))
try: lf = ImageFont.truetype(__import__('os').path.expanduser('~/.fonts/SF-Pro-Display-Regular.otf'), 56)
except OSError: lf = ImageFont.load_default()
d = ImageDraw.Draw(sheet)
for i, im in enumerate(ims):
    x = gap + i * (W + gap); sheet.paste(im, (x, gap)); d.text((x + W // 2 - 14, gap + H + 18), str(i + 1), font=lf, fill=(220, 220, 220))
sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS); sheet.save(sys.argv[1])
`, out, ...files]);
for (const f of files) fs.rmSync(f);
fs.writeFileSync(`${out}.json`, JSON.stringify({ theirs: before.text, clip, headlines: report }, null, 1));
console.log(JSON.stringify(report));
if (report.some((r) => !r.fits)) process.exit(3);
