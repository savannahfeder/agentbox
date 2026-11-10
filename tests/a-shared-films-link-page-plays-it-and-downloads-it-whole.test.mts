// A SHARED FILM'S LINK PAGE PLAYS IT, AND ITS DOWNLOAD IS THE WHOLE FILM.
//
// A video's link holds the list of its pieces, not the film
// (a-video-open-in-the-app-can-be-shared-by-its-link). Before this, the page
// knew no 'video' kind and said the link did not work. Measured here: the page
// reads a film's link as a film, reads its pieces in order and gives up on a
// missing one, draws the frame while they arrive, and the worker's raw address
// streams every piece in order under the film's name.
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { filmOf, readFilm, readSharedFile } from '../renderer/src/shared-file/shared-file.ts';
import { FilePage } from '../renderer/src/shared-file/SharedFilePage.tsx';
import { sharedFileWorker } from '../cloud/web/shared-file-worker.mjs';

const TOK = '0123456789abcdef0123456789abcdef01234567';
const HASH = 'c'.repeat(40);
const LIST = JSON.stringify({ pieces: 3, size: 9, hash: HASH });
const row = { name: 'agent-docs-cut3.mp4', kind: 'video', type: 'video/mp4', body: LIST, version: 10, created_at: '2026-11-09T10:00:00Z', updated_at: '2026-11-09T10:00:00Z', owner_name: 'Maya Chen' };

describe('the link page', () => {
  it('reads a film\'s link as a film, not as a link that does not work', async () => {
    const shown = await readSharedFile(async (name) => (name === 'file_link_view' ? [row] : false), TOK);
    expect(shown).toMatchObject({ state: 'file', file: { kind: 'video', name: 'agent-docs-cut3.mp4', type: 'video/mp4' } });
  });

  it('takes only a well-formed list of pieces', () => {
    expect(filmOf({ kind: 'video', body: LIST })).toEqual({ pieces: 3, size: 9, hash: HASH });
    for (const body of ['', 'AAAA', JSON.stringify({ pieces: 0, size: 1, hash: HASH }), JSON.stringify({ pieces: 1, size: 1, hash: '../x' })]) {
      expect(filmOf({ kind: 'video', body }), body).toBeNull();
    }
    expect(filmOf({ kind: 'markdown', body: LIST })).toBeNull();
  });

  it('reads every piece in order, and gives up on a missing one', async () => {
    const asked: string[] = [];
    const seen: number[] = [];
    const parts = await readFilm(async (name) => { asked.push(name); return new Uint8Array([asked.length]); }, TOK, { pieces: 3, hash: HASH }, (d) => seen.push(d));
    expect(asked).toEqual([0, 1, 2].map((n) => `${TOK}/${HASH}/${n}`));
    expect(parts!.map((p) => p[0])).toEqual([1, 2, 3]);
    expect(seen).toEqual([1 / 3, 2 / 3, 1]);
    expect(await readFilm(async (name) => (name.endsWith('/1') ? null : new Uint8Array(1)), TOK, { pieces: 3, hash: HASH })).toBeNull();
  });

  it('draws the film\'s frame while it loads, with its name and a download', () => {
    const file = { name: 'agent-docs-cut3.mp4', kind: 'video', type: 'video/mp4', body: LIST, version: 10, createdAt: 0, updatedAt: 0, ownerName: 'Maya Chen', ownerAvatar: null, mine: false } as const;
    const html = renderToStaticMarkup(h(FilePage, { token: TOK, file, piece: async () => null }));
    expect(html).toContain('<h1>agent-docs-cut3.mp4</h1>');
    expect(html).toMatch(/class="sf-video is-loading"/);
    expect(html).toContain('Download');
  });
});

describe('the worker\'s raw address', () => {
  const env = { ASSETS: { fetch: async () => new Response('<html><head><title>x</title></head><body></body></html>') } };
  const piecesAsked: string[] = [];
  const worker = sharedFileWorker({ cloud: 'https://db.test', anonKey: 'anon' }, {
    fetchImpl: async (url: string) => {
      if (url.endsWith('/rpc/file_link_view')) return new Response(JSON.stringify([row]), { status: 200 });
      piecesAsked.push(url);
      const n = Number(url.split('/').pop());
      return new Response(new Uint8Array([n * 3, n * 3 + 1, n * 3 + 2]), { status: 200 });
    },
  });

  it('streams the pieces in order as one download under the film\'s name', async () => {
    const res = await worker.fetch(new Request(`https://app.test/f/${TOK}/raw`), env);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('content-length')).toBe('9');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="agent-docs-cut3.mp4"');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(piecesAsked).toEqual([0, 1, 2].map((n) => `https://db.test/storage/v1/object/link-files/${TOK}/${HASH}/${n}`));
  });

  it('heads the link preview with the film\'s name', async () => {
    const res = await worker.fetch(new Request(`https://app.test/f/${TOK}`), env);
    expect(await res.text()).toContain('<title>agent-docs-cut3.mp4 · Agentbox</title>');
  });
});
