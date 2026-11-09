// THE SIGN-IN ON A SHARED PAGE SAYS IT IS FOR COMMENTING, AND KEEPS THE PAGE IN VIEW.
//
// A first-time recipient pressed "Create an account to comment" and got the
// app's own card, "Create your account", over a solid screen: the document was
// gone and nothing said what the account was for (power test, round 3,
// 2026-11-04). Measured on the card's markup and the page's stylesheet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SharedSignIn } from '../renderer/src/shared-file/SharedSignIn.tsx';

const client = { googleUrl: async () => '', signUp: async () => ({}), signInWithPassword: async () => {} };
const draw = (startOn) => renderToStaticMarkup(React.createElement(SharedSignIn, { client, startOn, onNew() {}, onClose() {}, onSignedIn() {} }));
const heading = (html) => /<h1>([^<]*)<\/h1>/.exec(html)?.[1];
const css = fs.readFileSync(new URL('../renderer/src/shared-file/shared-file.css', import.meta.url), 'utf8');

describe('the card on a shared page', () => {
  it('names commenting as the reason, on both tabs', () => {
    expect(heading(draw('sign-up'))).toBe('Create an account to comment');
    expect(heading(draw('sign-in'))).toBe('Sign in to comment');
  });
  it('lies over the page with the page still showing through', () => {
    // Above the app's own `:root[data-theme="dark"] .si-page` in specificity.
    const rule = /:root \.si-page\.sf-sign-in\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/background:\s*rgba\(/);
    expect(rule).not.toMatch(/var\(--bg\)/);
  });
});
