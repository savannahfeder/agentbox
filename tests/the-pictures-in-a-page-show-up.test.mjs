// THE PICTURES IN A PAGE SHOW UP.
//
// The pictures were broken because the frame was sandboxed WITHOUT
// allow-same-origin and pointed at file://, which gives it an opaque origin,
// and Chromium will not let an opaque origin load a local file. Measured in an
// Electron probe before anything was written: naturalWidth 0 with the console
// line "Not allowed to load local resource", and 2880 the moment the frame is
// allowed to be same-origin.
//
// Simply allowing it on file:// would have put an agent-written page in the
// SAME ORIGIN AS THE APP, because the app's own window is a file:// page
// (loadFile, main/main.mjs). So the page is served from a scheme of its own
// instead. What is pinned here is the part with no picture: which addresses
// that scheme understands, and what it will and will not hand out.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOC_SCHEME, DocGrants, docUrl, docPath } from '../main/doc-scheme.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const PAGE = '/Users/you/Zero/accounts/acct/astral/designs/w-74b0b5cd87/opens-itself/both-are-built.html';
const SHOT = '/Users/you/Zero/accounts/acct/astral/designs/w-74b0b5cd87/opens-itself/card-w-9fa482b8ea.png';
const DOCS = '/Users/you/Zero/accounts/acct/agentbox';

describe('the address a page is served from', () => {
  it('gives a file one address, under one host, so a page and its pictures match', () => {
    expect(docUrl(PAGE)).toBe(`${DOC_SCHEME}://file${PAGE}`);
    // Same origin for both, which is the whole point: a relative src in the
    // page resolves to the picture beside it without leaving the origin.
    expect(new URL(docUrl(PAGE)).origin).toBe(new URL(docUrl(SHOT)).origin);
  });

  it('survives a filename with a space, a hash or a question mark in it', () => {
    const odd = '/docs/round 3/what now? #2.html';
    const url = docUrl(odd);
    expect(url).not.toContain(' ');
    // The '#' and '?' must not be read as url syntax, or the page requested is
    // a different one than the file on disk.
    expect(new URL(url).pathname).not.toContain('#');
    expect(docPath(url)).toBe(odd);
  });

  it('reads its own addresses back and refuses anything else', () => {
    expect(docPath(docUrl(PAGE))).toBe(PAGE);
    expect(docPath(`file://${PAGE}`)).toBeNull();
    expect(docPath('https://example.com/x.png')).toBeNull();
    expect(docPath('not a url')).toBeNull();
  });

  it('flattens a climb written into the address, before anyone checks it', () => {
    // Without this the grant check below would be asked about a path that
    // still says ../../.. and would resolve it differently than the disk does.
    const climbed = `${DOC_SCHEME}://file/Users/you/Zero/accounts/acct/astral/designs/../../../../.ssh/id_rsa`;
    const landed = docPath(climbed);
    expect(landed).not.toContain('..');
    expect(landed).toBe('/Users/you/Zero/.ssh/id_rsa');
    // And the flattened path is what the grant check then refuses.
    const grants = new DocGrants();
    grants.grant(PAGE, [DOCS]);
    expect(grants.allows(landed)).toBe(false);
  });

  it('has no address for a relative path, because nothing has resolved it yet', () => {
    expect(docUrl('designs/thing.html')).toBeNull();
    expect(docUrl(null)).toBeNull();
  });
});

describe('what that scheme may hand out', () => {
  it('opens nothing at all until a document has been opened', () => {
    const grants = new DocGrants();
    expect(grants.allows(PAGE)).toBe(false);
    expect(grants.allows(SHOT)).toBe(false);
  });

  it('opens the picture beside the page she opened', () => {
    const grants = new DocGrants();
    grants.grant(PAGE, []);
    expect(grants.allows(SHOT)).toBe(true);
  });

  it('opens the product’s own folders too, because real pages climb out', () => {
    // Measured across this product on 2026-08-21: of the 200 html files in
    // designs/, seventeen references point at ../attachments, ../landing and
    // ../../landing/assets. Granting only the file's own folder breaks those.
    const grants = new DocGrants();
    grants.grant(PAGE, [DOCS, path.join(DOCS, 'designs'), path.join(DOCS, 'attachments')]);
    expect(grants.allows(`${DOCS}/attachments/launch-video/frame-1.png`)).toBe(true);
    expect(grants.allows(`${DOCS}/landing/assets/wordmark.svg`)).toBe(true);
  });

  it('hands out nothing outside them, however the page asks', () => {
    const grants = new DocGrants();
    grants.grant(PAGE, [DOCS]);
    expect(grants.allows('/Users/you/.ssh/id_rsa')).toBe(false);
    expect(grants.allows('/etc/passwd')).toBe(false);
    // The sibling-prefix trap: /a/bc is not inside /a/b.
    expect(grants.allows(`${DOCS}-private/secrets.md`)).toBe(false);
    // A relative path is not a path this thing can reason about at all.
    expect(grants.allows('../../../etc/passwd')).toBe(false);
  });

  it('forgets the oldest documents rather than growing without end', () => {
    const grants = new DocGrants(2);
    grants.grant('/one/a.html', []);
    grants.grant('/two/b.html', []);
    grants.grant('/three/c.html', []);
    expect(grants.allows('/one/a.html')).toBe(false);
    expect(grants.allows('/three/c.html')).toBe(true);
  });
});

// THE READING SIZE THAT USED TO BE PINNED HERE IS GONE ON PURPOSE.
//
// Two suites lived below this line, one for a continuous pinch size and one for
// the listener a served page carried so the app could hear a pinch inside a
// frame of another origin.
//
// The app zoom is still tested, in the two suites it has always had:
// tests/the-zoom-chords-reach-the-main-process.test.mjs and
// tests/the-zoom-percent-shows-and-goes.test.mjs. What is pinned below is that
// nothing puts a listener back into a page she reads.
describe('a page is served exactly as it was written', () => {
  it('has no listener to inject, at either end', async () => {
    const scheme = await import('../main/doc-scheme.mjs');
    expect(scheme.injectZoomBridge).toBeUndefined();
    expect(scheme.zoomBridge).toBeUndefined();
    expect(scheme.ZOOM_MESSAGE).toBeUndefined();
  });

  it('reads the file off disk and hands it over untouched', () => {
    const main = fs.readFileSync(path.join(here, '..', 'main', 'main.mjs'), 'utf8');
    // The handler's own code, with its comments taken out: the comments say
    // what used to be injected here, which is exactly the word being looked for.
    const serve = main
      .slice(main.indexOf('for (const scheme of DOC_SCHEMES) protocol.handle('))
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(serve).not.toMatch(/inject/i);
    expect(serve).not.toMatch(/<script/i);
    // What is left is one line: hand the file over as it is. `noStore` adds a
    // header and passes the body through untouched (w-3fc39983be).
    expect(serve).toContain('return noStore(await net.fetch(pathToFileURL(file).toString()));');
  });

  it('leaves the pane with no size of its own', async () => {
    const pane = await import('../renderer/src/doc-pane.ts');
    for (const gone of ['clampZoom', 'zoomFromGesture', 'zoomLabel', 'readZoom',
      'writeZoom', 'ZOOM_KEY', 'ZOOM_MESSAGE', 'DOC_ZOOM_MIN', 'DOC_ZOOM_MAX']) {
      expect(pane[gone], gone).toBeUndefined();
    }
    const src = fs.readFileSync(
      path.join(here, '..', 'renderer', 'src', 'components', 'DocPane.tsx'), 'utf8');
    expect(src).not.toContain('doc-zoom-tracker');
    expect(src).not.toContain('postMessage');
  });
});
