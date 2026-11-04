// A SHARED FILE'S ADDRESS DRAWS THE FILE'S PAGE, AND EVERY OTHER ADDRESS DRAWS THE APP.
//
// Asked for 2026-11-03 (w-d7e61eb261): /f/<token> on the web app is a page for
// people with no app and no account. The web app's boot installs the phone's
// cloud bridge, which reads its rows as whoever is signed in and spends a
// Google sign-in code it finds in the address, so the shared page must be
// chosen before that runs, and only on the web app (the page carries
// `<meta name="agentbox-cloud">`). Measured on the route itself, on how
// main.tsx and api.ts use it, and on the page's parts drawn to markup: what a
// stranger sees of each kind of file and of the comments, signed out and in.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sharedFileToken, titleOf, readSharedFile } from '../renderer/src/shared-file/shared-file.ts';
import { onASharedFilePage, NO_SUCH_LINK } from '../renderer/src/shared-file/route.ts';
import { FileBody, Comments, WHAT_AGENTBOX_IS } from '../renderer/src/shared-file/SharedFilePage.tsx';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const TOK = '0123456789abcdef0123456789abcdef01234567';

describe('the address', () => {
  it('is a shared file for /f/ and a token of 16 to 64 letters, digits, - and _', () => {
    expect(sharedFileToken(`/f/${TOK}`, true)).toBe(TOK);
    expect(sharedFileToken(`/f/${TOK}/`, true)).toBe(TOK);
    expect(sharedFileToken('/f/abcdefghijklmnop', true)).toBe('abcdefghijklmnop');
    expect(sharedFileToken(`/f/${'A_-9'.repeat(16)}`, true)).toBe('A_-9'.repeat(16));
  });
  it('is not for a token too short, too long or with anything else in it, nor for any other path', () => {
    for (const p of ['/f/abcdefghijklmno', `/f/${'a'.repeat(65)}`, '/f/abcdefghijklmnop$', '/f/abcdefghijklmnop.x', '/f/abc.defghijklmnopq', `/f/${TOK}/raw`, `/x/f/${TOK}`, '/', '/f/', `/files/${TOK}`]) {
      expect(sharedFileToken(p, true), p).toBeNull();
    }
  });
  it('takes the full stop, comma or bracket a sentence leaves after a pasted link', () => {
    for (const end of ['.', ',', ')', '].', '%20', '%29', '!', ' ']) expect(sharedFileToken(`/f/${TOK}${end}`, true), end).toBe(TOK);
  });
  it('is never a shared file outside the web app', () => {
    expect(sharedFileToken(`/f/${TOK}`, false)).toBeNull();
  });
});

describe('reading it off the page', () => {
  const had = { location: globalThis.location, document: globalThis.document };
  afterEach(() => { globalThis.location = had.location; globalThis.document = had.document; });
  const page = (pathname, meta) => {
    globalThis.location = { pathname };
    globalThis.document = { querySelector: (q) => (meta && q === 'meta[name="agentbox-cloud"]' ? { getAttribute: () => meta } : null) };
  };
  it('needs the cloud address the web app is built with', () => {
    page(`/f/${TOK}`, JSON.stringify({ url: 'https://db.example', anonKey: 'k' }));
    expect(onASharedFilePage()).toBe(TOK);
    page(`/f/${TOK}`, null);
    expect(onASharedFilePage()).toBeNull();
    page('/', JSON.stringify({ url: 'https://db.example', anonKey: 'k' }));
    expect(onASharedFilePage()).toBeNull();
  });
  // A made-up /f/ link drew a blank white page (power test, round 2, 2026-11-04).
  it('takes any other address under /f/ as a link that does not work, never the app', async () => {
    for (const p of ['/f/abc', '/f/', '/f/not a link']) {
      page(p, JSON.stringify({ url: 'https://db.example', anonKey: 'k' }));
      expect(onASharedFilePage(), p).toBe(NO_SUCH_LINK);
    }
    let asked = false;
    expect(await readSharedFile(async () => { asked = true; return []; }, NO_SUCH_LINK)).toEqual({ state: 'unknown' });
    expect(asked).toBe(false);
    page('/f/abc', null);
    expect(onASharedFilePage()).toBeNull();
  });
  // A link typed with /F/ drew a blank page (power test, round 3, 2026-11-04).
  it('reads /F/ as /f/', () => {
    page(`/F/${TOK}`, JSON.stringify({ url: 'https://db.example', anonKey: 'k' }));
    expect(onASharedFilePage()).toBe(TOK);
    page('/F/nope', JSON.stringify({ url: 'https://db.example', anonKey: 'k' }));
    expect(onASharedFilePage()).toBe(NO_SUCH_LINK);
  });
});

describe('the boot', () => {
  it('draws the shared page in place of the app, and the app everywhere else', () => {
    const main = read('renderer/src/main.tsx');
    expect(main).toMatch(/const sharedFile = onASharedFilePage\(\);/);
    expect(main).toMatch(/if \(sharedFile && cloud\) bootSharedFile\(sharedFile, cloud\);\nelse if \(!theDoorNeedsItsKey\(\)\) boot\(\);/);
    // A stranger's browser opens it dark, not in the look the app saves for its own people.
    expect(main).toMatch(/if \(!sharedFile\) normalizeSavedLook\(localStorage, machineTheme\(\)\);/);
  });
  it('installs neither of the app\'s bridges on the shared page', () => {
    expect(read('renderer/src/api.ts')).toMatch(/if \(!onASharedFilePage\(\) && !installBrowserBridge\(\)\) installCloudBridge\(\);/);
  });
});

const file = (kind, body, extra = {}) => ({ name: 'plan.md', kind, type: 'text/markdown', body, version: 3, updatedAt: 0, ownerName: 'Maya Chen', ownerAvatar: null, mine: false, ...extra });

describe('each kind of file', () => {
  it('draws a document with the app\'s document look, and its HTML as words, never as HTML', () => {
    const html = renderToStaticMarkup(h(FileBody, { token: TOK, file: file('markdown', '## Plan\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[run](javascript:alert(1)) and [site](https://example.com)') }));
    expect(html).toContain('class="markdown doc-prose"');
    expect(html).toContain('<h2>Plan</h2>');
    expect(html).not.toMatch(/<script|<img|href="javascript/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"');
  });
  // A picture link holding words, not base64, blanked the whole page (power test, round 3, 2026-11-04).
  it('says a picture or a PDF did not load when its bytes cannot be read, rather than failing the page', () => {
    for (const kind of ['image', 'pdf']) {
      const html = renderToStaticMarkup(h(FileBody, { token: TOK, file: file(kind, 'not base64 at all!', { name: 'x.png', type: 'image/png' }) }));
      expect(html, kind).toContain('This file did not load.');
    }
  });
  it('frames a page from its own address, sandboxed without the page\'s origin', () => {
    const html = renderToStaticMarkup(h(FileBody, { token: TOK, file: file('page', '<p>hi</p>', { name: 'p.html', type: 'text/html' }) }));
    expect(html).toContain(`src="/f/${TOK}/raw?at=0"`);
    expect(html).toContain('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"');
    expect(html).not.toContain('allow-same-origin');
    expect(html).not.toContain('srcdoc');
  });
});

describe('the comments', () => {
  const said = [
    { id: '1', byName: 'Theo Park', byAvatar: null, body: 'Looks <b>good</b>', createdAt: Date.now() - 120_000, mine: true, byOwner: false },
    { id: '2', byName: 'Maya Chen', byAvatar: null, body: 'Thanks', createdAt: Date.now(), mine: false, byOwner: true },
  ];
  const draw = (props) => renderToStaticMarkup(h(Comments, { file: file('markdown', ''), comments: said, signedIn: false, onAsk() {}, post: async () => {}, remove: async () => {}, ...props }));

  it('shows everyone each comment by name, its words as words, and marks the owner\'s', () => {
    const html = draw();
    expect(html).toContain('<b>Theo Park</b>');
    expect(html).toContain('Looks &lt;b&gt;good&lt;/b&gt;');
    expect(html.match(/sf-owner/g)).toHaveLength(1);
    expect(html.indexOf('sf-owner')).toBeGreaterThan(html.indexOf('Maya Chen'));
  });
  it('signed out, offers an account in place of the box, and no Remove', () => {
    const html = draw();
    expect(html).toContain('Create an account to comment');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('Remove');
  });
  it('signed in, gives a box and a Comment button, and Remove on their own comment only', () => {
    const html = draw({ signedIn: true });
    expect(html).toContain('<textarea');
    expect(html).toContain('>Comment</button>');
    expect(html).not.toContain('Create an account to comment');
    expect(html.match(/sf-remove/g)).toHaveLength(1);
  });
  // "Agentbox runs your own agents. Runs agents? On what?" (power test, round 3, 2026-11-04).
  it('after a new account\'s first comment, says what Agentbox is in words a stranger can place', () => {
    expect(WHAT_AGENTBOX_IS).toBe('Agentbox is an inbox for your Claude Code and Codex agents.');
  });
  it('lets the owner remove any comment', () => {
    expect(draw({ signedIn: true, file: file('markdown', '', { mine: true }) }).match(/sf-remove/g)).toHaveLength(2);
  });
});

// A contractor did not know what "competitor-research.md" was (power test, 2026-11-04).
describe('the words over the file', () => {
  it('are a document\'s own first heading, taken out of the body under them', () => {
    expect(titleOf({ name: 'competitor-research.md', kind: 'markdown', body: '# Competitor pricing, Q1\n\nFive tools.' }))
      .toEqual({ title: 'Competitor pricing, Q1', body: '\nFive tools.' });
  });
  it('are its name without .md when it has no heading at the top, and the name of any other file', () => {
    expect(titleOf({ name: 'notes.md', kind: 'markdown', body: 'Just words\n# Later' }).title).toBe('notes');
    expect(titleOf({ name: 'deck.pdf', kind: 'pdf', body: 'x' }).title).toBe('deck.pdf');
    expect(titleOf({ name: 'a.md', kind: 'markdown', body: '## Second level' }).title).toBe('a');
  });
  // A designer was sent "index.html" for a page titled "Pricing" (power test, round 3, 2026-11-04).
  it('are a page\'s own title, with its entities read, and its name when the title is empty or missing', () => {
    const page = (body) => titleOf({ name: 'index.html', kind: 'page', body }).title;
    expect(page('<!doctype html><html><head><title>\n  Pricing &amp; plans </title></head>')).toBe('Pricing & plans');
    expect(page('<TITLE>Clinicly: scheduling</TITLE>')).toBe('Clinicly: scheduling');
    expect(page('<title>  </title>')).toBe('index.html');
    expect(page('<h1>No title here</h1>')).toBe('index.html');
    expect(page('<svg><title>An icon</title></svg>')).toBe('index.html');
    expect(page(`<title>${'x'.repeat(300)}</title>`)).toHaveLength(120);
  });
});

describe('the words in a link preview', () => {
  it('head a page by the same title the page itself shows', async () => {
    const { sharedFileWorker } = await import('../cloud/web/shared-file-worker.mjs');
    const row = { name: 'index.html', kind: 'page', type: 'text/html', body: '<html><head><title>Pricing &amp; plans</title></head></html>', owner_name: 'Maya' };
    const w = sharedFileWorker({ cloud: 'https://db.example', anonKey: 'k' }, { fetchImpl: async () => new Response(JSON.stringify([row])) });
    const env = { ASSETS: { fetch: async () => new Response('<html><head><title>Agentbox</title></head><body></body></html>') } };
    const html = await (await w.fetch(new Request('https://app.example/f/pR3nY0q7Lw2Xc9Vb5Tz1'), env)).text();
    expect(html).toContain('<meta property="og:title" content="Pricing &amp; plans">');
    expect(html).toContain('<title>Pricing &amp; plans · Agentbox</title>');
  });
});
