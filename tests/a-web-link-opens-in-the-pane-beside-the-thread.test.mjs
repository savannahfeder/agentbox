// A WEB LINK OPENS IN THE PANE BESIDE THE THREAD.
//
// What was missing: the pane on the right drew a file of ours and nothing
// else. An ordinary https link in a worker's message went straight out to the
// browser (`zero:open-artifact` calls shell.openExternal for anything http),
// so reading what an agent linked meant leaving the app, and coming back meant
// finding the thread again. Counted over the designs this came from
// (designs/w-3f27e92b80/9-website-preview.png, approved 2026-10-15): the pane
// draws the page where the file would have been, and one mark hands it to the
// browser you actually use.
//
// The cases here are the rule that decides which address that is, the kind the
// pane then draws, the crumb the header prints for it, and the one case that
// must NOT match: a local address, which already has its own path through the
// pane (an iframe plus the liveness check in renderer/src/local-preview.ts) and
// must not be stolen by this.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isWebsiteAddress, canFrameAWebsite, WEBSITE_PARTITION } from '../shared/websites.mjs';
import { addressParts } from '../renderer/src/components/BrowserChrome.tsx';
import { docKind, opensInPane } from '../renderer/src/doc-pane.ts';
import { whereALinkGoes } from '../renderer/src/link-click.ts';
import { WebsitePane } from '../renderer/src/components/WebsitePane.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('which address the pane treats as a website', () => {
  it('is an ordinary http or https address out on the web', () => {
    for (const url of [
      'https://en.wikipedia.org/wiki/Kestrel',
      'http://example.com',
      'https://github.com/savannahfeder/agentbox/pull/31',
      'https://example.com:8443/a?b=1#c',
    ]) expect(isWebsiteAddress(url), url).toBe(true);
  });

  it('is never a local app, which the pane already draws its own way', () => {
    for (const url of [
      'http://localhost:3006/',
      'http://127.0.0.1:48765/x?y=1',
      'http://[::1]:3000/',
      'https://localhost:8443/',
    ]) expect(isWebsiteAddress(url), url).toBe(false);
  });

  it('is never a file, a scheme of ours, or a path a worker typed', () => {
    for (const src of [
      'file:///tmp/x.html',
      'astral-doc://abc/designs/round19.html',
      'agentbox-agent:reviewer',
      'mailto:someone@example.com',
      'designs/w-3f27e92b80/9-website-preview.png',
      'STATE.md',
      'javascript:alert(1)',
      'not a url',
      '',
      null,
      undefined,
    ]) expect(isWebsiteAddress(src), String(src)).toBe(false);
  });
});

describe('what the pane does with one', () => {
  it('calls it a website, so the pane opens it instead of the browser', () => {
    expect(docKind('https://en.wikipedia.org/wiki/Kestrel')).toBe('website');
    expect(opensInPane('https://en.wikipedia.org/wiki/Kestrel')).toBe(true);
  });

  it('reads the address before the extension, so a page on the web is not looked for on disk', () => {
    // Both of these end in an extension the pane knows. They are still
    // websites: resolving them against the product's folders finds nothing.
    expect(docKind('https://example.com/report.html')).toBe('website');
    expect(docKind('https://example.com/shot.png')).toBe('website');
    expect(docKind('https://example.com/readme.md')).toBe('website');
  });

  it('leaves every file the pane already drew exactly as it was', () => {
    expect(docKind('designs/round19.html')).toBe('html');
    expect(docKind('STATE.md')).toBe('markdown');
    expect(docKind('attachments/shot.png')).toBe('image');
    expect(docKind('runs/w-1.change')).toBe('code');
    expect(docKind('reports/audit.pdf')).toBeNull();
    // A local app keeps no kind of its own: DocPane falls back to a frame.
    expect(docKind('http://localhost:3006/')).toBeNull();
  });
});

describe('what the bar above the page says', () => {
  it('is the address, split so the site reads louder than the rest', () => {
    expect(addressParts('https://en.wikipedia.org/wiki/Kestrel')).toEqual({ host: 'en.wikipedia.org', rest: '/wiki/Kestrel' });
    expect(addressParts('https://example.com')).toEqual({ host: 'example.com', rest: '' });
    expect(addressParts('https://example.com/')).toEqual({ host: 'example.com', rest: '' });
  });

  it('drops www and keeps a port, the way a browser writes one', () => {
    expect(addressParts('https://www.example.com/a?b=1')).toEqual({ host: 'example.com', rest: '/a?b=1' });
    expect(addressParts('http://localhost:3006/orders')).toEqual({ host: 'localhost:3006', rest: '/orders' });
  });

  it('says the address back verbatim when it cannot be read as one', () => {
    expect(addressParts('not a url')).toEqual({ host: 'not a url', rest: '' });
  });
});

describe('the browser the pane draws it in', () => {
  const fakeDoc = (made) => ({ createElement: () => made });

  it('is Electron\'s own on the desktop, where the tag is registered', () => {
    expect(canFrameAWebsite(fakeDoc({ partition: '' }))).toBe(true);
  });

  it('is an ordinary frame in a tab or on a phone, where it is not', () => {
    expect(canFrameAWebsite(fakeDoc({}))).toBe(false);
    expect(canFrameAWebsite(null)).toBe(false);
    expect(canFrameAWebsite({ createElement() { throw new Error('no'); } })).toBe(false);
  });

  it('keeps its sign-ins in a store of its own, never the agent browser\'s', () => {
    const markup = renderToStaticMarkup(h(WebsitePane, { url: 'https://example.com/', webview: true, onNavigate: () => {} }));
    expect(markup).toContain(`partition="${WEBSITE_PARTITION}"`);
    expect(WEBSITE_PARTITION).not.toBe('persist:junk');
    // A webview carries nothing of ours into the page: no preload, and no
    // leave to open windows of its own.
    expect(markup).not.toContain('preload');
    expect(markup).not.toContain('allowpopups');
    expect(markup).not.toContain('nodeintegration');
  });

  it('falls back to a plain frame that can reach nothing of the app\'s', () => {
    const markup = renderToStaticMarkup(h(WebsitePane, { url: 'https://example.com/', webview: false, onNavigate: () => {} }));
    expect(markup).toContain('<iframe');
    expect(markup).not.toContain('<webview');
    expect(markup).toMatch(/sandbox="[^"]*allow-scripts/);
    expect(markup).not.toMatch(/sandbox="[^"]*allow-same-origin/);
  });
});

describe('the thread hands a web link to the pane', () => {
  it('no longer refuses an http address at the door', () => {
    const rule = read('renderer/src/link-click.ts');
    // The old test was `!/^https?:/.test(href) && opensInPane(href)`: every
    // web address was excluded before the kind was ever asked for.
    expect(rule).not.toMatch(/!\/\^https\?:\/\.test\(href\) && opensInPane/);
    expect(rule).toMatch(/opensInPane\(href\) \|\| isLocalPreview\(href\)/);
    expect(whereALinkGoes('https://en.wikipedia.org/wiki/Kestrel')).toBe('pane');
    expect(read('renderer/src/components/Focus.tsx')).toContain('whereALinkGoes(href, click');
  });

  it('still hands a pdf and a source file to the app that owns them', () => {
    expect(opensInPane('reports/audit.pdf')).toBe(false);
    expect(opensInPane('main/ipc.mjs')).toBe(false);
  });
});

describe('the mark that takes the page out to your own browser', () => {
  it('is in the browser bar, named for where it goes', () => {
    const bar = read('renderer/src/components/BrowserChrome.tsx');
    expect(bar).toContain("title=\"Open in your browser\"");
    expect(bar).toContain('aria-label="Open in your browser"');
  });

  it('opens the page you have walked to, not the one the thread named', () => {
    // A webview navigates inside itself, so the address the mark hands over
    // is the one the pane is showing, kept in `here`.
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toMatch(/browsingKind \? here\.url/);
  });

  it('can actually be pressed, because the bar is never floated over the page', () => {
    // MEASURED IN THE REAL APP, 2026-10-15. The pane first wore the document
    // pane's own header, and on a doc-html card that header is a toolbar that
    // fades in under the pointer. A `<webview>` is a separate compositing
    // layer that paints over everything the card draws, so the crumb and both
    // marks sat at 1278,146 118x42 in the DOM with not one pixel of them on
    // screen: the way out to your own browser could never be pressed.
    //
    // The browser bar is a different element, so none of those rules reach
    // it. This fails if one ever does.
    const toolbar = read('renderer/src/workspace-navigation.css');
    for (const line of toolbar.split('\n')) {
      if (/position:absolute/.test(line) || /opacity:0/.test(line)) {
        expect(line, line.trim()).not.toContain('web-bar');
      }
    }
    const styles = read('renderer/src/styles.css');
    expect(styles).not.toMatch(/\.web-bar\s*\{[^}]*position:\s*absolute/);
  });

  it('is in the bar a LOCAL APP gets too, which is the same bar', () => {
    // Their words: "this would be an overhaul of all of our browser tabs,
    // including what it shows when you're on localhost". A local app is a
    // page being browsed, so it wears the browser bar rather than a
    // breadcrumb built for a file on disk.
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toMatch(/kind === 'website' \? 'website' : app\.local \? 'local' : null/);
    expect(pane).toMatch(/browsingKind \? \(\s*<BrowserChrome/);
  });
});

describe('the layout that was picked', () => {
  it('is the only one left, with nothing switching between layouts', () => {
    // Three were built in the real app and photographed on 2026-10-15: this
    // toolbar, a tab carrying the page's name, and a 26px line with no
    // stepping controls. The toolbar was picked, so the other two and the
    // `data-web-chrome` attribute that chose between them are gone. A flag
    // left behind is two designs to keep working and one nobody looks at.
    const styles = read('renderer/src/styles.css');
    expect(styles).not.toContain('data-web-chrome');
    expect(styles).toMatch(/^\.web-bar \{/m);
    // The page's own name was only ever the tab's, so its plumbing went too.
    expect(read('renderer/src/components/BrowserChrome.tsx')).not.toContain('web-bar-title');
    expect(read('renderer/src/components/WebsitePane.tsx')).not.toContain('page-title-updated');
  });

  it('gives the page the card back, which is the space that was lost', () => {
    const styles = read('renderer/src/styles.css');
    const flush = styles.slice(styles.indexOf('.doc-pane.doc-browsing .doc-card'));
    expect(flush).toMatch(/margin: 0; border: 0; border-radius: 0;/);
  });

  it('can step the page, which is what makes it a browser and not a frame', () => {
    const bar = read('renderer/src/components/BrowserChrome.tsx');
    for (const name of ['Back', 'Forward', 'Reload']) expect(bar).toContain(`aria-label="${name}"`);
    // Driven through the guest's own history, reached by ref so a press lands
    // on the webview that is mounted now rather than one a render closed over.
    const guest = read('renderer/src/components/WebsitePane.tsx');
    expect(guest).toMatch(/back: \(\) => node\.goBack\?\.\(\)/);
    expect(guest).toMatch(/forward: \(\) => node\.goForward\?\.\(\)/);
    expect(guest).toMatch(/reload: \(\) => node\.reload\?\.\(\)/);
  });

  it('asks nothing of the site it is drawing, not even its icon', () => {
    // A webview hands over the favicon URL on page-favicon-updated. Drawing it
    // would make the APP's own page fetch a file from that domain, on the
    // app's session rather than the browsing one, and the privacy page says
    // nothing leaves the machine. The mark is drawn by us.
    // The prose is not the code: the comment beside this says the word
    // favicon several times, which is the point of it.
    const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const bar = code('renderer/src/components/BrowserChrome.tsx');
    expect(bar).not.toContain('favicon');
    expect(bar).not.toMatch(/<img/);
    expect(code('renderer/src/components/WebsitePane.tsx')).not.toContain('page-favicon-updated');
  });
});
