// A SHARED FILE'S ADDRESS SHOWS ITS NAME IN A LINK PREVIEW, AND ITS PAGE IN AN ORIGIN OF ITS OWN.
//
// Asked for 2026-11-03 (w-d7e61eb261): a file shared from the app is a page on
// the web app at /f/<token>. The web app is static files on Cloudflare Pages,
// so a link pasted into a chat would preview as a bare "Agentbox", and a shared
// HTML page has to be served from somewhere that is not the page holding the
// viewer's sign-in. cloud/web/shared-file-worker.mjs does both, and only for
// /f/*. Measured here against a stand-in cloud and a stand-in ASSETS: the tags
// it writes (escaped), the headers on each answer, what an unknown, stopped or
// unreachable link gets, and what scripts/build-phone-site.mjs writes for Pages.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sharedFileWorker } from '../cloud/web/shared-file-worker.mjs';
import { buildPhoneSite } from '../scripts/build-phone-site.mjs';

const TOK = 'a'.repeat(40);
const SHELL = '<!doctype html><html><head><title>Agentbox</title><script type="module" src="./assets/main.js"></script><link rel="stylesheet" href="./assets/main.css"></head><body><div id="root"></div></body></html>';
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const files = {
  [TOK]: { name: 'plan "<b>&</b>".md', kind: 'markdown', type: 'text/markdown', body: '# Plan <script>x</script>', owner_name: 'Maya <Chen>' },
  ['p'.repeat(40)]: { name: 'pricing.html', kind: 'page', type: 'text/html', body: '<p>hi</p><script>alert(1)</script>', owner_name: 'Maya Chen' },
  ['i'.repeat(40)]: { name: 'dusk.png', kind: 'image', type: 'image/png', body: PNG.toString('base64'), owner_name: 'Maya Chen' },
  ['d'.repeat(40)]: { name: 'review.pdf', kind: 'pdf', type: 'application/pdf', body: Buffer.from('%PDF-1.4 x').toString('base64'), owner_name: 'Maya Chen' },
};

let asked;
let cloudDown;
const fetchImpl = async (url, init) => {
  asked.push({ url, init });
  if (cloudDown) throw new Error('fetch failed');
  const { tok } = JSON.parse(init.body);
  return new Response(JSON.stringify(files[tok] ? [files[tok]] : []), { status: 200 });
};
const HEADERS = { 'Content-Security-Policy': "default-src 'self'; frame-src 'self' blob:; frame-ancestors 'self'", 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN' };
const worker = sharedFileWorker({ cloud: 'https://db.example', anonKey: 'anon-key', headers: HEADERS }, { fetchImpl });
const pathOf = (u) => new URL(u instanceof Request ? u.url : String(u)).pathname;
const ASSETS = { fetch: async (u) => new Response(pathOf(u) === '/' ? SHELL : `asset ${pathOf(u)}`) };
const get = (p, method = 'GET') => worker.fetch(new Request(`https://app.example${p}`, { method }), { ASSETS });

beforeEach(() => { asked = []; cloudDown = false; });

describe('the page at /f/<token>', () => {
  it('names the file and who shared it in the preview tags, escaped, and asks the cloud as nobody with a deadline', async () => {
    const res = await get(`/f/${TOK}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<meta property="og:title" content="Plan &lt;script&gt;x&lt;/script&gt;">');
    expect(html).toContain('<meta property="og:description" content="Shared by Maya &lt;Chen&gt; on Agentbox">');
    expect(html).toContain(`<meta property="og:url" content="https://app.example/f/${TOK}">`);
    expect(html).toContain('<meta name="twitter:card" content="summary">');
    expect(html).toContain('<meta property="og:image" content="https://app.example/phone-icon.png">');
    expect(html).toContain('<title>Plan &lt;script&gt;x&lt;/script&gt; · Agentbox</title>');
    expect(html).not.toMatch(/<b>|<Chen>|<script>x/);
    expect(asked[0].url).toBe('https://db.example/rest/v1/rpc/file_link_view');
    expect(asked[0].init.headers).toMatchObject({ apikey: 'anon-key', authorization: 'Bearer anon-key' });
    expect(asked[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  // A 442-character name made a preview read "Shared by Anthropic IT Security…" (power test, round 3).
  it('keeps the sharer\'s name in the preview to sixty characters', async () => {
    files['n'.repeat(40)] = { ...files[TOK], owner_name: `IT Security ${'x'.repeat(400)}` };
    const html = await (await get(`/f/${'n'.repeat(40)}`)).text();
    const said = /og:description" content="Shared by ([^"]*) on Agentbox"/.exec(html)?.[1];
    expect(said).toHaveLength(60);
    expect(said.endsWith('…')).toBe(true);
  });

  it('loads the app from the site root, since the page is two folders down', async () => {
    const html = await (await get(`/f/${TOK}`)).text();
    expect(html).toContain('src="/assets/main.js"');
    expect(html).toContain('href="/assets/main.css"');
    expect(html).not.toContain('"./assets');
  });

  it('carries the site headers, may frame its own raw file, and is never cached', async () => {
    const res = await get(`/f/${TOK}`);
    expect(res.headers.get('content-security-policy')).toContain("frame-src 'self' blob:");
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  it('previews a picture as a large picture from its own address', async () => {
    const html = await (await get(`/f/${'i'.repeat(40)}`)).text();
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(`<meta property="og:image" content="https://app.example/f/${'i'.repeat(40)}/preview">`);
  });

  it('is still the page for an unknown or stopped link, and when the cloud cannot be reached, with plain tags', async () => {
    for (const setup of [() => {}, () => { cloudDown = true; }]) {
      setup();
      const res = await get(`/f/${'z'.repeat(40)}`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('<meta property="og:title" content="Agentbox">');
      expect(html).toContain('<meta property="og:description" content="A file shared on Agentbox">');
      expect(html).toContain('<div id="root">');
    }
  });
});

describe('the file itself at /f/<token>/raw', () => {
  it('serves a shared page sandboxed by its own header, so even opened on its own it has no origin of the site', async () => {
    const res = await get(`/f/${'p'.repeat(40)}/raw`);
    expect(await res.text()).toBe(files['p'.repeat(40)].body);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const csp = res.headers.get('content-security-policy');
    expect(csp).toMatch(/^sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms;/);
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("frame-ancestors 'self'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  // A shared page with a fake "sign in to view" box sent what was typed to
  // another server with fetch (power test, round 3, 2026-11-04).
  it('lets a shared page call no server and post no form anywhere', async () => {
    const csp = (await get(`/f/${'p'.repeat(40)}/raw`)).headers.get('content-security-policy');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it('serves a picture and a PDF as their bytes, and a document as plain text', async () => {
    const pic = await get(`/f/${'i'.repeat(40)}/raw`);
    expect(Buffer.from(await pic.arrayBuffer())).toEqual(PNG);
    expect(pic.headers.get('content-type')).toBe('image/png');
    expect(pic.headers.get('content-security-policy')).toMatch(/^sandbox;/);
    const pdf = await get(`/f/${'d'.repeat(40)}/raw`);
    expect(Buffer.from(await pdf.arrayBuffer()).toString()).toBe('%PDF-1.4 x');
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    const doc = await get(`/f/${TOK}/raw`);
    expect(doc.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await doc.text()).toBe('# Plan <script>x</script>');
  });

  it('is not found for an unknown or stopped link', async () => {
    const res = await get(`/f/${'z'.repeat(40)}/raw`);
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('says it did not load when the cloud cannot be reached', async () => {
    cloudDown = true;
    expect((await get(`/f/${TOK}/raw`)).status).toBe(502);
  });
});

describe('a shared page opened on its own (power test, 2026-11-04)', () => {
  const P = 'p'.repeat(40);
  const open = (p, dest) => worker.fetch(new Request(`https://app.example${p}`, { headers: dest ? { 'sec-fetch-dest': dest } : {} }), { ASSETS });
  it('goes to the page that says who shared it, so nobody\'s HTML stands alone under our address', async () => {
    const res = await open(`/f/${P}/raw`, 'document');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`https://app.example/f/${P}`);
  });
  it('is still served inside its frame, and to a fetch with no destination', async () => {
    expect((await open(`/f/${P}/raw`, 'iframe')).status).toBe(200);
    expect((await open(`/f/${P}/raw`)).status).toBe(200);
  });
  it('leaves a PDF or a picture opened on its own alone, so Download works', async () => {
    expect((await open(`/f/${'d'.repeat(40)}/raw`, 'document')).status).toBe(200);
    expect((await open(`/f/${'i'.repeat(40)}/raw`, 'document')).status).toBe(200);
  });
});

describe('a link pasted at the end of a sentence', () => {
  it('goes to the clean address, whatever the sentence left on it', async () => {
    for (const end of ['.', ',', ')', '%20', '%29', '].']) {
      const res = await get(`/f/${TOK}${end}`);
      expect(res.status, end).toBe(301);
      expect(res.headers.get('location'), end).toBe(`https://app.example/f/${TOK}`);
    }
  });
  it('is not stretched to anything with more after it', async () => {
    expect((await get(`/f/${TOK}.html`)).status).not.toBe(301);
  });
  // A link typed with /F/ drew a blank page (power test, round 3, 2026-11-04).
  it('goes from /F/ to /f/', async () => {
    const res = await get(`/F/${TOK}`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`https://app.example/f/${TOK}`);
  });
});

describe('the preview picture at /f/<token>/preview', () => {
  it('is the picture, cached a little, and nothing for any other kind', async () => {
    const res = await get(`/f/${'i'.repeat(40)}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect((await get(`/f/${'p'.repeat(40)}/preview`)).status).toBe(404);
    expect((await get(`/f/${TOK}/preview`)).status).toBe(404);
  });
});

describe('what the worker leaves alone', () => {
  // A bare /f/ drew a white page: the app's files were asked for under /f/ (power test, round 4, 2026-11-04).
  it('answers every other address under /f/ with the page loading its files from the root, and asks the cloud nothing', async () => {
    for (const p of ['/f/short', `/f/${TOK}/other`, `/f/${'a'.repeat(65)}`, '/f/']) {
      const html = await (await get(p)).text();
      expect(html, p).toContain('src="/assets/main.js"');
      expect(html, p).toContain('<meta property="og:title" content="Agentbox">');
    }
    expect(asked).toEqual([]);
  });
  it('takes only reads', async () => {
    expect((await get(`/f/${TOK}`, 'POST')).status).toBe(405);
  });
});

describe('the site as built for Pages', () => {
  let dir, out;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-file-site-'));
    fs.mkdirSync(path.join(dir, 'dist'));
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), SHELL);
    fs.writeFileSync(path.join(dir, 'icon.png'), 'png');
    out = path.join(dir, 'out');
  });
  const build = (url, extra = {}) => {
    fs.writeFileSync(path.join(dir, 'team.config.json'), JSON.stringify({ url, anonKey: 'eyJhbGciOi.public-key_1234567890' }));
    return buildPhoneSite({ dist: path.join(dir, 'dist'), out, configFile: path.join(dir, 'team.config.json'), icon: path.join(dir, 'icon.png'), log: () => {}, ...extra });
  };

  it('sends only /f/* through the worker, which has the cloud and the site headers in it', async () => {
    build('https://abc.supabase.co');
    expect(JSON.parse(fs.readFileSync(path.join(out, '_routes.json'), 'utf8'))).toEqual({ version: 1, include: ['/f/*', '/F/*'], exclude: [] });
    const source = fs.readFileSync(path.join(out, '_worker.js'), 'utf8');
    expect(source).not.toContain('const BAKED = null;');
    expect(source).toContain('"cloud":"https://abc.supabase.co"');
    // The rest of the site keeps framing blob: only.
    expect(fs.readFileSync(path.join(out, '_headers'), 'utf8')).toMatch(/frame-src blob:;/);
    const { default: built } = await import(`${pathToFileURL(path.join(out, '_worker.js')).href}?t=${Date.now()}`);
    const res = await built.fetch(new Request(`https://app.example/about`), { ASSETS });
    expect(await res.text()).toBe('asset /about');
  });

  it('takes a cloud on this computer only when asked to, for the stage', () => {
    expect(() => build('http://127.0.0.1:54329')).toThrow(/https/);
    expect(() => build('http://example.com', { localCloud: true })).toThrow(/https/);
    build('http://127.0.0.1:54329', { localCloud: true });
    expect(fs.readFileSync(path.join(out, '_headers'), 'utf8')).toContain('connect-src \'self\' http://127.0.0.1:54329');
  });
});
