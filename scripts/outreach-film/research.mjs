// Reads one company's site with no model: the homepage as the film's opening
// shot, its square logo, and the words on its key pages, so the one model
// step (writing the film) works only from what the company says itself.
//
// usage: node research.mjs <domain> <out dir> [--name "Company"]
// writes <out>/site.png (2880x1620, the top of the homepage), <out>/logo.png,
// <out>/site.json (every page's title, headings and text, and what was checked).
import fs from 'node:fs';
import { chromium, chromePath, DESKTOP_UA } from './lib/browser.mjs';

const [domain, out] = process.argv.slice(2);
const logoAt = process.argv.indexOf('--logo-url');
const LOGO_URL = logoAt > 0 ? process.argv[logoAt + 1] : null;
const nameAt = process.argv.indexOf('--name');
const NAME = nameAt > 0 ? process.argv[nameAt + 1] : null;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2, userAgent: DESKTOP_UA, locale: 'en-US', colorScheme: 'light' });
const page = await ctx.newPage();
const problems = [];
const deadline = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what} took over ${ms / 1000}s`)), ms))]);

async function open(url) {
  await deadline(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }), 35_000, url);
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

// Cookie banners and chat bubbles are not part of their landing page.
async function clearOverlays() {
  for (const re of [/^(accept|accept all|allow all|agree|i agree|got it|ok|okay)$/i, /accept/i]) {
    const b = page.getByRole('button', { name: re }).first();
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(600); break; }
  }
  return page.evaluate(() => {
    let removed = 0;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const t = (el.innerText || '').toLowerCase();
      const id = `${el.id} ${el.className}`.toLowerCase();
      const r = el.getBoundingClientRect();
      const chat = /intercom|crisp|drift|hubspot|chat-widget|launcher|tidio|zendesk/.test(id) || (el.tagName === 'IFRAME' && r.width < 500 && r.bottom > innerHeight - 200);
      const consent = /cookie|consent|privacy preferences|we use cookies/.test(t) && t.length < 1500;
      if (chat || consent) { el.remove(); removed += 1; }
    }
    return removed;
  });
}

const textOf = () => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const all = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const meta = (n) => document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.content ?? null;
  return {
    url: location.href, title: document.title, description: meta('description') ?? meta('og:description'), ogTitle: meta('og:title'),
    h1: all('h1').slice(0, 3), h2: all('h2').slice(0, 14), h3: all('h3').slice(0, 20),
    nav: [...new Set(all('header a, nav a'))].slice(0, 30),
    buttons: [...new Set(all('a[class*="button" i], button, a[class*="btn" i]'))].slice(0, 20),
    text: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 9000),
    links: [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => h.startsWith(location.origin)))].slice(0, 200),
  };
});

const site = { domain, name: NAME, readAt: new Date().toISOString(), pages: [], checks: {} };
try {
  await open(`https://${domain}`);
} catch (e) {
  try { await open(`https://www.${domain}`); } catch (e2) { problems.push(`homepage did not open: ${e2.message}`); }
}
const removed = await clearOverlays().catch(() => 0);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);
const home = await textOf();
site.pages.push({ kind: 'home', ...home });
site.checks.overlaysRemoved = removed;

// The opening shot: the top of their homepage as a visitor sees it.
await page.screenshot({ path: `${out}/site.png` });
const shot = await page.evaluate(() => {
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
  const r = h?.getBoundingClientRect();
  return { h1Visible: !!r && r.top >= 0 && r.bottom <= innerHeight && r.width > 0, h1Text: h?.innerText.trim() ?? null };
});
site.checks.heroVisible = shot.h1Visible;
if (!shot.h1Visible) problems.push('the homepage headline is not inside the first screen');

// Where the hero headline sits, so the headlines picture can replace it.
site.hero = await page.evaluate(() => {
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
  const h = heroEl(); if (!h) return null;
  const r = h.getBoundingClientRect(); const cs = getComputedStyle(h);
  return { text: h.innerText.trim(), box: [r.left, r.top, r.width, r.height], font: cs.fontFamily, size: parseFloat(cs.fontSize), weight: cs.fontWeight, color: cs.color, align: cs.textAlign, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing };
});

// The square logo: their app icon first, since the film draws it small and square.
const icons = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="apple-touch-icon-precomposed"],link[rel="mask-icon"]')]
  .map((l) => ({ href: l.href, rel: l.rel, sizes: l.sizes?.value ?? '', type: l.type })));
const rank = (i) => (i.rel.includes('apple-touch') ? 1000 : 0) + (i.type === 'image/svg+xml' || i.href.endsWith('.svg') ? 600 : 0) + (parseInt(i.sizes) || 0);
icons.sort((a, b) => rank(b) - rank(a));
for (const cand of [...icons.map((i) => i.href), ...(LOGO_URL ? [LOGO_URL] : []), `https://${domain}/apple-touch-icon.png`, `https://${domain}/favicon.svg`, `https://${domain}/favicon.ico`]) {
  try {
    const r = await deadline(ctx.request.get(cand, { timeout: 10_000 }), 12_000, cand);
    if (!r.ok()) continue;
    const buf = await r.body();
    const type = r.headers()['content-type'] ?? '';
    if (buf.length < 200 || /html/.test(type)) continue;
    const ext = /svg/.test(type) || cand.endsWith('.svg') ? 'svg' : /icon|ico/.test(type) || cand.endsWith('.ico') ? 'ico' : 'png';
    fs.writeFileSync(`${out}/logo-source.${ext}`, buf);
    site.logo = { from: cand, type, bytes: buf.length, file: `logo-source.${ext}` };
    break;
  } catch { /* next candidate */ }
}
// Drawn through the browser, so svg, ico and png all come out as one png.
if (site.logo) {
  const src = `data:${site.logo.type || 'image/png'};base64,${fs.readFileSync(`${out}/${site.logo.file}`).toString('base64')}`;
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: 256, height: 256 });
  await p2.setContent(`<html><body style="margin:0;background:transparent"><img id=i src="${src}" style="width:256px;height:256px;object-fit:contain"></body></html>`);
  await p2.waitForTimeout(400);
  const ok = await p2.evaluate(() => { const i = document.getElementById('i'); return i.complete && i.naturalWidth > 0 ? [i.naturalWidth, i.naturalHeight] : null; });
  if (ok) { await p2.locator('#i').screenshot({ path: `${out}/logo.png`, omitBackground: true }); site.logo.natural = ok; }
  else problems.push('the logo did not draw');
  await p2.close();
} else problems.push('no logo found');

// A few more pages in their own words: what the product does, for whom, what changed lately.
const want = [/\/(product|products|platform|features)(\/|$)/, /\/(docs|documentation)(\/|$)/, /\/(changelog|updates|releases|whats-new)(\/|$)/, /\/(about|company)(\/|$)/, /\/(pricing)(\/|$)/, /\/(customers|case-studies)(\/|$)/, /\/(careers|jobs)(\/|$)/];
const seen = new Set([home.url]);
for (const re of want) {
  const link = home.links.find((h) => re.test(new URL(h).pathname) && !seen.has(h));
  if (!link) continue;
  seen.add(link);
  try { await open(link); await clearOverlays(); const t = await textOf(); delete t.links; t.text = t.text.slice(0, 5000); site.pages.push({ kind: re.source.match(/\(([a-z]+)/)[1], ...t }); }
  catch (e) { problems.push(`could not read ${link}: ${e.message}`); }
}
delete site.pages[0].links;

// Is this the company we think it is?
if (NAME) {
  const hay = site.pages.map((p) => `${p.title} ${p.description} ${p.text}`).join(' ').toLowerCase();
  site.checks.nameOnSite = hay.includes(NAME.toLowerCase());
  if (!site.checks.nameOnSite) problems.push(`"${NAME}" does not appear on ${domain}`);
}
site.problems = problems;
fs.writeFileSync(`${out}/site.json`, JSON.stringify(site, null, 1));
console.log(`${domain}: ${site.pages.length} pages, logo ${site.logo ? 'yes' : 'no'}, hero ${shot.h1Visible ? 'visible' : 'NOT visible'}${problems.length ? `, problems: ${problems.join('; ')}` : ''}`);
await browser.close();
