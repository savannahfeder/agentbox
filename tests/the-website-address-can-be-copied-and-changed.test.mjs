// THE WEBSITE ADDRESS CAN BE COPIED AND CHANGED.
//
// Reported: "On the website component i can't edit the website address like
// copy it or anything or switch where it's pointing to". The bar above a page
// in the pane drew its address as two plain spans, and the window's body is
// `user-select: none`, so the address could not be selected, copied or typed
// over. Measured by rendering the bar: there was no input in it at all.
//
// Now the address is a text field. These cases hold what you can type into it
// and where that goes, the field itself, and the page being told to go there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addressYouTyped } from '../shared/websites.mjs';
import { BrowserChrome } from '../renderer/src/components/BrowserChrome.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('what you can type into the address field', () => {
  it('keeps a full web address as it is', () => {
    expect(addressYouTyped('https://en.wikipedia.org/wiki/Kestrel')).toBe('https://en.wikipedia.org/wiki/Kestrel');
    expect(addressYouTyped('http://example.com/a?b=1#c')).toBe('http://example.com/a?b=1#c');
    expect(addressYouTyped('  https://example.com  ')).toBe('https://example.com/');
  });

  it('adds https to a bare site name, the way a browser does', () => {
    expect(addressYouTyped('example.com')).toBe('https://example.com/');
    expect(addressYouTyped('github.com/savannahfeder/agentbox')).toBe('https://github.com/savannahfeder/agentbox');
    expect(addressYouTyped('www.example.co.uk/x?y=1')).toBe('https://www.example.co.uk/x?y=1');
  });

  it('adds http to a local app, which has no certificate', () => {
    expect(addressYouTyped('localhost:3000')).toBe('http://localhost:3000/');
    expect(addressYouTyped('localhost')).toBe('http://localhost/');
    expect(addressYouTyped('127.0.0.1:8080/x')).toBe('http://127.0.0.1:8080/x');
    expect(addressYouTyped('http://localhost:5173/')).toBe('http://localhost:5173/');
  });

  it('refuses anything that is not a page on the web or a local app', () => {
    for (const typed of [
      '',
      '   ',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'file:///etc/passwd',
      'mailto:someone@example.com',
      'data:text/html,<b>x</b>',
      'astral-doc://abc/designs/x.html',
      'ftp://example.com/',
      'not a url',
      'kestrel',
      'user:pass@example.com',
      'https://user:pass@example.com/',
    ]) expect(addressYouTyped(typed), typed).toBe(null);
    expect(addressYouTyped(undefined)).toBe(null);
  });
});

describe('the address in the bar', () => {
  const bar = (over = {}) => renderToStaticMarkup(h(BrowserChrome, {
    kind: 'website', url: 'https://example.com/a?b=1', onOpenOutside: () => {}, onGo: () => true, ...over,
  }));

  it('is a text field holding the whole address, so it can be selected and copied', () => {
    const markup = bar();
    expect(markup).toMatch(/<input[^>]*aria-label="Address"/);
    expect(markup).toMatch(/<input[^>]*value="https:\/\/example.com\/a\?b=1"/);
  });

  it('still reads as the host and the rest until you click into it', () => {
    const markup = bar();
    expect(markup).toContain('class="web-bar-host">example.com<');
    expect(markup).toContain('class="web-bar-rest">/a?b=1<');
  });

  it('says so when what you typed is not an address, rather than doing nothing', () => {
    expect(read('renderer/src/components/BrowserChrome.tsx')).toMatch(/refused && <span[^>]*>Not a web address</);
    expect(bar()).not.toContain('Not a web address');
  });

  it('is a field for a local app too', () => {
    expect(bar({ kind: 'local', url: 'http://localhost:3000/' })).toMatch(/<input[^>]*value="http:\/\/localhost:3000\/"/);
  });

  it('can be selected although the window body cannot', () => {
    const css = read('renderer/src/styles.css');
    const rule = css.match(/\.web-bar-input\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/user-select:\s*text/);
  });
});

describe('where Return takes the page', () => {
  it('a website steps inside its own browser, so Back comes home', () => {
    const pane = read('renderer/src/components/WebsitePane.tsx');
    expect(pane).toMatch(/go:\s*\(to\)\s*=>\s*node\.loadURL\?\.\(to\)/);
  });

  it('anything else reopens the pane on the address you typed', () => {
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toContain('addressYouTyped(');
    expect(pane).toMatch(/onGo=\{/);
  });
});
