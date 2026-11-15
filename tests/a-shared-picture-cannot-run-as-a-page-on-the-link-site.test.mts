// A SHARED PICTURE CANNOT RUN AS A PAGE ON THE LINK SITE.
//
// The link page draws a picture, a film or a download from a blob: address it
// makes itself, typed with whatever type the link's owner sent. A blob opens on
// the site's own origin, where the reader's Agentbox sign-in is kept. So a
// "picture" shared as text/html (or an SVG with a script in it) ran the owner's
// script the moment a reader chose "Open image in new tab", and read the
// session (security review 2026-11-13: reproduced in Chromium 156 with
// Playwright and a dummy session, with and without the site's own CSP, which a
// top-level blob document does not inherit).
//
// A blob made on the page now only ever carries a raster picture's or a film's
// own type, or application/octet-stream; an SVG draws from a data: address,
// whose origin is opaque.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blobType, pictureAddress } from '../renderer/src/shared-file/shared-file.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('the type a blob on the link page carries', () => {
  it('a picture keeps its own type when it is a raster picture', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'IMAGE/PNG']) {
      expect(blobType('image', t), t).toBe(t.toLowerCase());
    }
  });

  it('anything that could run as a document becomes plain bytes', () => {
    for (const t of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml', 'image/png; x=1', 'image/png\ntext/html', '', 'image/']) {
      expect(blobType('image', t), JSON.stringify(t)).toBe('application/octet-stream');
    }
  });

  it('a film keeps a film type, and anything else plays as mp4', () => {
    expect(blobType('video', 'video/webm')).toBe('video/webm');
    expect(blobType('video', 'video/quicktime')).toBe('video/quicktime');
    expect(blobType('video', 'text/html')).toBe('video/mp4');
    expect(blobType('video', 'image/svg+xml')).toBe('video/mp4');
  });

  it('a download is plain bytes whatever it is', () => {
    for (const [kind, t] of [['markdown', 'text/html'], ['markdown', 'text/csv'], ['pdf', 'application/pdf'], ['pdf', 'text/html']]) {
      expect(blobType(kind, t), `${kind} ${t}`).toBe('application/octet-stream');
    }
  });
});

describe('where a picture is drawn from', () => {
  const png = Buffer.from('iVBORw0KGgo=', 'base64').toString('base64');
  it('an SVG from a data: address, which has no origin to read', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    const at = pictureAddress({ body: svg, type: 'image/svg+xml' });
    expect(at).toBe(`data:image/svg+xml;base64,${svg}`);
  });

  it('a raster picture from a blob of its own type, and anything else from plain bytes', async () => {
    const shown = pictureAddress({ body: png, type: 'image/png' });
    expect(shown).toMatch(/^blob:/);
    const blob = await fetch(shown).then((r) => r.blob());
    expect(blob.type).toBe('image/png');
    const odd = pictureAddress({ body: png, type: 'text/html' });
    expect((await fetch(odd).then((r) => r.blob())).type).toBe('application/octet-stream');
  });
});

describe('the link page uses them', () => {
  it('makes no blob typed straight from the link', () => {
    const page = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'shared-file', 'SharedFilePage.tsx'), 'utf8');
    expect(page).not.toMatch(/new Blob\([^)]*type:\s*file\.type/);
    expect(page.match(/new Blob\(/g)?.length ?? 0).toBe(page.match(/new Blob\([^)]*blobType\(/g)?.length ?? 0);
  });
});
