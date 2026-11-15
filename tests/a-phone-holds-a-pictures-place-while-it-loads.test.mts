// PICTURES LOOKED ODD WHILE THEY LOADED ON A PHONE (2026-10-12): "as images
// load in mobile they look rather weird. Best to have nice skeleton loaders".
// Through the relay a picture arrives a piece at a time from the computer, so
// it drew from the top down, pushed the words under it as it grew from nothing
// to its height, and a slow one showed the browser's broken-image mark first.
//
// Now every picture the phone draws is marked loading until it has loaded
// (renderer/src/phone-files.ts), and a loading picture in a message, the
// picture view or an attachment holds a soft, shimmering box of a picture's
// shape, then fades in whole.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchPicture } from '../renderer/src/phone-files';

/** An <img> as far as the watcher touches one. */
function fakeImg({ complete = false, naturalWidth = 0 } = {}) {
  const attrs = new Map();
  const on = new Map();
  return {
    complete, naturalWidth,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    addEventListener: (k, fn) => on.set(k, fn),
    fire: (k) => on.get(k)?.(),
    state: () => attrs.get('data-phone-img') ?? null,
  };
}

describe('a picture on a phone', () => {
  it('is marked loading until it has loaded, then ready', () => {
    const img = fakeImg();
    watchPicture(img);
    expect(img.state()).toBe('loading');
    img.naturalWidth = 800;
    img.fire('load');
    expect(img.state()).toBe('ready');
  });

  it('is marked failed when it does not load, so it never shimmers for ever', () => {
    const img = fakeImg();
    watchPicture(img);
    img.fire('error');
    expect(img.state()).toBe('failed');
  });

  it('that is already drawn (in memory) never flashes a placeholder', () => {
    const img = fakeImg({ complete: true, naturalWidth: 640 });
    watchPicture(img);
    expect(img.state()).toBe('ready');
  });

  it('starts over when its address changes, as a retry does', () => {
    const img = fakeImg({ complete: true, naturalWidth: 640 });
    watchPicture(img);
    img.complete = false;
    img.naturalWidth = 0;
    watchPicture(img);
    expect(img.state()).toBe('loading');
  });
});

describe('the placeholder', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  // In the main stylesheet since every window got it
  // (a-picture-on-its-way-holds-its-place-on-the-computer-too).
  const inside = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Every rule naming it, joined: the button around a loading picture names it too.
  const rule = (sel) => [...inside.matchAll(new RegExp(`([^{}]*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{}]*)\\{([^{}]*)\\}`, 'g'))]
    .map((m) => m[2]).join(';');

  it('is a box of a picture\'s shape that shimmers, in a message, the picture view and an attachment', () => {
    const loading = rule('.inline-image[data-phone-img="loading"]');
    // 4:3 until its first bytes give its own shape (a-picture-on-its-way-holds-the-columns-width-not-a-dot).
    expect(loading).toMatch(/aspect-ratio:\s*auto\s+4\s*\/\s*3/);
    expect(loading).toMatch(/animation:\s*phone-shimmer/);
    expect(inside).toMatch(/\.doc-picture\[data-phone-img="loading"\]/);
    expect(inside).toMatch(/\.attach-row img\[data-phone-img="loading"\]/);
    expect(inside).toMatch(/@keyframes phone-shimmer/);
  });

  it('hides the half-drawn picture and the broken mark while it loads, and fades the picture in', () => {
    expect(rule('.inline-image[data-phone-img="loading"]')).toMatch(/color:\s*transparent/);
    expect(rule('.inline-image[data-phone-img="ready"]')).toMatch(/animation:\s*phone-fade-in/);
  });
});
