// SIGN IN AND CREATE ACCOUNT ARE TABS, AND ONLY CREATE ACCOUNT AGREES.
//
// The owner, on the cloud's sign-in screen (w-2c627fdea8, 2026-10-23): it
// "doesn't look too good anymore", the terms line looked "funky", "it's
// usually only on the sign-up page that you're accepting the Terms", sign-up
// should carry "a third field, maybe a name", and of five drawn options, the
// tabs: "definitely do that". She also asked that the line be legally enough
// without a box to tick, so Google stays one press. US courts uphold such a
// line when it is readable, sits by the button, has links that stand out and
// names the act that agrees (Berman v. Freedom Financial, 9th Cir. 2022), so
// the line names both buttons and is not the faintest text on the card.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SignInPage } from '../renderer/src/team/SignInPage.tsx';
import { agreedHere, rememberAgreed } from '../renderer/src/team/cloud-agreed.ts';

const css = fs.readFileSync(new URL('../renderer/src/team/sign-in.css', import.meta.url), 'utf8');
const draw = (props) => renderToStaticMarkup(React.createElement(SignInPage, props));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const LINE = 'By creating an account or continuing with Google, you agree to the Terms and the Privacy policy';

describe('the cloud sign-in screen', () => {
  const signIn = draw({ purpose: 'cloud', onClose: () => {} });
  const signUp = draw({ purpose: 'cloud', startOn: 'sign-up', onClose: () => {} });

  it('has two tabs, Sign in and Create account, with the open one marked', () => {
    expect(signIn).toMatch(/role="tablist"/);
    expect(signIn).toMatch(/aria-selected="true"[^>]*>Sign in</);
    expect(signUp).toMatch(/aria-selected="true"[^>]*>Create account</);
  });
  it('and no "New here?" line, which the tabs replace', () => {
    expect(text(signIn)).not.toContain('New here?');
    expect(text(signUp)).not.toContain('Have an account?');
  });
  it('signing in says nothing about the terms', () => {
    expect(text(signIn)).not.toMatch(/agree|Terms|Privacy/);
  });
  it('creating an account names both buttons in its terms line, with both links', () => {
    expect(text(signUp)).toContain(LINE);
    expect(signUp).toContain('href="https://agentbox.ac/terms"');
    expect(signUp).toContain('href="https://agentbox.ac/privacy"');
  });
  it('and the line comes after the Create account button, not above it', () => {
    expect(signUp.indexOf('si-terms')).toBeGreaterThan(signUp.indexOf('>Create account</button>'));
  });
  it('creating an account asks a name, signing in does not', () => {
    expect(text(signUp)).toMatch(/Name Email Password/);
    expect(text(signIn)).not.toMatch(/\bName\b/);
  });
});

// AND THE HEADING STANDS ON ITS OWN (2026-10-26, w-aaedc8f711). "Then your
// agents run in the cloud." sat under Create your account: "it just feels a
// little cluttered with text". The heading says what the card is for, and
// both tabs keep the same height without it.
describe('the cloud card has no line under its heading', () => {
  const signIn = draw({ purpose: 'cloud', onClose: () => {} });
  const signUp = draw({ purpose: 'cloud', startOn: 'sign-up', onClose: () => {} });
  it('on either tab', () => {
    expect(signIn).not.toContain('si-lede');
    expect(signUp).not.toContain('si-lede');
    expect(text(signUp)).not.toContain('Then your agents run in the cloud');
  });
  it('so the heading carries the gap the line used to leave', () => {
    expect(css).toMatch(/\.si-card:not\(:has\(\.si-lede\)\) h1 \{[^}]*margin-bottom/);
  });
  it('and the team and phone sign-ins keep theirs, which say what they get you', () => {
    expect(draw({ purpose: 'team' })).toContain('si-lede');
    expect(draw({ purpose: 'phone', onClose: () => {} })).toContain('si-lede');
  });
});

describe('the line is set to be read', () => {
  const rule = (sel) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
  it('in the dimmer body colour, not the faintest', () => {
    expect(rule('.si-terms')).toContain('color: var(--text-dim)');
    expect(rule('.si-terms')).not.toContain('--text-faint');
  });
  it('at no less than 12.5px', () => {
    expect(Number(/font-size:\s*([\d.]+)px/.exec(rule('.si-terms'))[1])).toBeGreaterThanOrEqual(12.5);
  });
  it('with links in the full text colour, so they stand apart from it', () => {
    expect(css).toMatch(/\.si-terms a[^{]*\{[^}]*color: var\(--text\)/);
  });
});

describe('the team sign-in keeps its own words', () => {
  it('has the same tabs, and no terms line', () => {
    const html = draw({ purpose: 'team' });
    expect(html).toMatch(/role="tablist"/);
    expect(text(html)).not.toContain(LINE);
  });
});

describe('an email sign-up remembers it agreed, for the sign-in after its confirmation link', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  it('by address, whatever its case or spaces', () => {
    const s = store();
    rememberAgreed(' Sam@Example.com ', s);
    expect(agreedHere('sam@example.com', s)).toBe(true);
  });
  it('and not for any other address', () => {
    const s = store();
    rememberAgreed('sam@example.com', s);
    expect(agreedHere('someone@example.com', s)).toBe(false);
    expect(agreedHere('', s)).toBe(false);
  });
});
