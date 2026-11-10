// A SHARED FILE'S PAGE IS THE FILE ALONE, WITH COMMENTS BEHIND ONE BUTTON.
//
// The owner on the first version (2026-11-04): "in general shared artifacts
// look pretty bad, messy, and hard to focus on bc too much clutter", with a pin
// on the comments column: "not a fan of the ui here on this side". It had a
// tagline in the bar, Sign in in the bar, the file in a bordered card, and a
// standing comments column with an outlined button. Measured on the page's
// parts as they render, and on its stylesheet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TopBar, FilePage } from '../renderer/src/shared-file/SharedFilePage.tsx';

const TOK = '0123456789abcdef0123456789abcdef01234567';
const file = (extra = {}) => ({ name: 'plan.md', kind: 'markdown', type: 'text/markdown', body: '# Q1 plan\n\nWords.', version: 1, createdAt: 0, updatedAt: 0, ownerName: 'Maya Chen', ownerAvatar: null, mine: false, ...extra });
const css = fs.readFileSync(new URL('../renderer/src/shared-file/shared-file.css', import.meta.url), 'utf8');
const rule = (sel) => new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? '';
const bar = (props) => renderToStaticMarkup(h(TopBar, { count: 0, open: false, onComments() {}, ...props }));

describe('the bar', () => {
  it('holds the mark, one Comments button and Get Agentbox, and nothing else', () => {
    const html = bar();
    expect(html).toContain('agentbox');
    expect(html).toContain('Get Agentbox');
    expect(html).not.toMatch(/Give your agents an inbox|Sign in|Sign out|@/);
    expect(html.match(/<button/g)).toHaveLength(1);
  });
  it('says Comment with none, and how many there are once there are some', () => {
    expect(bar()).toContain('>Comment<');
    expect(bar({ count: 1 })).toContain('>1 comment<');
    expect(bar({ count: 2 })).toContain('>2 comments<');
  });
  it('marks the button pressed while the comments are open', () => {
    expect(bar({ open: true })).toContain('aria-pressed="true"');
    expect(bar()).toContain('aria-pressed="false"');
  });
});

describe('the file', () => {
  const page = (props) => renderToStaticMarkup(h(FilePage, { token: TOK, file: file(), ...props }));
  it('is a reading column headed by its own title and who shared it, with no comments beside it', () => {
    const html = page();
    expect(html).toContain('<h1>Q1 plan</h1>');
    expect(html).toContain('Shared by Maya Chen');
    expect(html).not.toMatch(/Comments|Create an account/);
  });
  it('is drawn on the page itself, not in a bordered card', () => {
    expect(rule('.sf-file')).not.toMatch(/border|background/);
    expect(rule('.sf-split')).toBe('');
  });
  it('keeps a document to a reading width', () => {
    expect(rule('.sf-main.is-markdown')).toMatch(/max-width:\s*7\d\dpx/);
  });
});

describe('the comments', () => {
  it('open in a panel over the page, and are not drawn while closed', () => {
    expect(rule('.sf-panel')).toMatch(/position:\s*fixed/);
    const src = fs.readFileSync(new URL('../renderer/src/shared-file/SharedFilePage.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/\{commentsOpen && \(\s*<aside className="sf-panel"/);
  });
});
