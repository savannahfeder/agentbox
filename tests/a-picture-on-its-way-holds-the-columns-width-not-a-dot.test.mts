// A PICTURE ON ITS WAY HOLDS THE COLUMN'S WIDTH, NOT A DOT (2026-10-14).
//
// "I can't seem to properly scroll up on the web or mobile, and even on mobile
// it's pretty jittery ... It starts with a dot and then loads, which means that
// if I ever try to scroll up or look at anything, it's always moving around."
//
// Measured in WebKit at 390px wide with the app's own three stylesheets and one
// phone screenshot held back for 1.5 s (scripts/scratch/picture-dot.mjs): the
// loading picture was 2 x 2 px, and when it arrived it was 358 x 776, so the
// paragraph under it moved from 690px to 1471px down the page. A picture in a
// message sits inside its open button, and a button shrinks to fit what is in
// it; a picture with no bytes yet has no width, so the 4:3 shimmering box
// (phone.css) was 4:3 of nothing. The shape remembered from last time
// (tests/a-thread-on-a-phone-holds-still-while-something-above-it-changes)
// was the same nothing, which is why yesterday's fix changed nothing on a real
// phone. The same was true of the phone link opened in a computer's browser
// ("the web"), which is wider than the phone layout and so had no box at all.
//
// Now the button around a picture still on its way is as wide as the column,
// at any width; the box takes the picture's real shape the moment its first
// bytes say what it is; and a shape learned is kept across reloads.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// In the main stylesheet since every window got it
// (a-picture-on-its-way-holds-its-place-on-the-computer-too).
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector names `sel`, joined. */
function declarations(text, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...text.matchAll(new RegExp(`([^{}]*${esc}[^{}]*)\\{([^{}]*)\\}`, 'g'))].map((m) => m[2]).join(';');
}

/** The css outside every @media block: what applies at any width. */
function outsideMedia(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf('@media', i);
    if (at < 0) { out += text.slice(i); break; }
    out += text.slice(i, at);
    let depth = 0;
    let j = text.indexOf('{', at);
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}' && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

describe('a picture in a message, while it is on its way', () => {
  const anyWidth = outsideMedia(css);

  it('has a button as wide as the column around it, so its box is not a dot', () => {
    const button = declarations(anyWidth, '.inline-image-open:has(> .inline-image[data-phone-img="loading"])');
    expect(button).toMatch(/(^|;)\s*width:\s*100%/);
  });

  it('is drawn as the shimmering box at any width, so the phone link in a computer\'s browser gets it too', () => {
    const box = declarations(anyWidth, '.inline-image[data-phone-img="loading"]');
    expect(box).toMatch(/(^|;)\s*width:\s*100%/);
    expect(box).toMatch(/animation:\s*phone-shimmer/);
    expect(anyWidth).toMatch(/@keyframes phone-shimmer/);
  });

  it('takes the picture\'s own shape as soon as its first bytes say it, and 4:3 only until then', () => {
    expect(declarations(anyWidth, '.inline-image[data-phone-img="loading"]')).toMatch(/aspect-ratio:\s*auto\s+4\s*\/\s*3/);
  });

  it('lets go of the width once it has arrived, so a small picture is drawn at its own size', () => {
    // Only a picture still loading widens its button; nothing widens every one.
    expect(declarations(css, '.inline-image-open {')).not.toMatch(/(?<![-\w])width:\s*100%/);
    expect(css).not.toMatch(/\.inline-image-open\s*\{[^}]*(?<![-\w])width:\s*100%/);
    expect(declarations(css, '.inline-image[data-phone-img="ready"]')).not.toMatch(/(^|;)\s*width:/);
  });
});

/** An <img> as watchPicture sees it. */
function picture(src) {
  const attrs = new Map([['src', src]]);
  const on = new Map();
  return {
    complete: false, naturalWidth: 0, naturalHeight: 0, style: {},
    getAttribute: (k) => attrs.get(k) ?? null,
    setAttribute: (k, v) => attrs.set(k, v),
    addEventListener: (k, fn) => on.set(k, fn),
    loads(w, h) { this.complete = true; this.naturalWidth = w; this.naturalHeight = h; on.get('load')?.(); },
  };
}

/** A fresh page: the module as a reload would find it, over the same storage. */
const reload = async () => { vi.resetModules(); return import('../renderer/src/phone-files.ts'); };

describe('the shape a picture had', () => {
  let saved;
  beforeEach(() => {
    saved = new Map();
    globalThis.localStorage = {
      getItem: (k) => (saved.has(k) ? saved.get(k) : null),
      setItem: (k, v) => saved.set(k, String(v)),
      removeItem: (k) => saved.delete(k),
    };
  });
  afterEach(() => { delete globalThis.localStorage; });

  it('is still known after a reload, so a thread opened again does not jump', async () => {
    const first = await reload();
    const img = picture('/f/key-one/img/Users/x/designs/shot.png');
    first.watchPicture(img);
    img.loads(1206, 2622);

    const again = await reload();
    const next = picture('/f/key-one/img/Users/x/designs/shot.png');
    again.watchPicture(next);
    expect(next.style.aspectRatio).toBe('1206 / 2622');
  });

  it('is known by the file, not the key, so resetting the phone key keeps it', async () => {
    const first = await reload();
    const img = picture('/f/key-one/img/Users/x/designs/shot.png');
    first.watchPicture(img);
    img.loads(1206, 2622);

    const again = await reload();
    const next = picture('/f/key-two/img/Users/x/designs/shot.png');
    again.watchPicture(next);
    expect(next.style.aspectRatio).toBe('1206 / 2622');
  });

  it('of one picture is never lent to another', async () => {
    const first = await reload();
    const img = picture('/f/key-one/img/Users/x/designs/shot.png');
    first.watchPicture(img);
    img.loads(1206, 2622);

    const again = await reload();
    const other = picture('/f/key-one/img/Users/x/designs/shot-2.png');
    again.watchPicture(other);
    expect(other.style.aspectRatio ?? '').toBe('');
  });

  it('is not learned from a picture that failed', async () => {
    const first = await reload();
    const img = picture('/f/key-one/img/Users/x/broken.png');
    first.watchPicture(img);
    img.loads(0, 0);
    expect(saved.size === 0 || !String([...saved.values()]).includes('broken.png')).toBe(true);
  });

  it('keeps working when storage refuses, as a private tab does', async () => {
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const mod = await reload();
    const img = picture('/f/k/img/a.png');
    expect(() => { mod.watchPicture(img); img.loads(100, 200); }).not.toThrow();
    const next = picture('/f/k/img/a.png');
    mod.watchPicture(next);
    expect(next.style.aspectRatio).toBe('100 / 200');
  });

  it('keeps no more than a few hundred, the newest', async () => {
    const mod = await reload();
    for (let i = 0; i < 700; i++) {
      const img = picture(`/f/k/img/p${i}.png`);
      mod.watchPicture(img);
      img.loads(10, 20);
    }
    const kept = JSON.parse([...saved.values()][0]);
    expect(Object.keys(kept).length).toBeLessThanOrEqual(500);
    expect(kept['img/p699.png']).toBe('10 / 20');
    expect(kept['img/p0.png']).toBeUndefined();
  });
});
