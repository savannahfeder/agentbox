// THE SIGN-IN PAGE WEARS THE AGENTBOX LOGO (2026-10-04). The sign-in card
// opened on an orange square with a letter A in it, a stand-in drawn before the
// app had an icon, and it was reported as "use the AgentBox logo ... not this
// placeholder". Measured by drawing the page: the top of every card carried
// `<span class="si-mark">A</span>` and no image. The sidebar already wears the
// icon (AppMark), so the page now uses the same one.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SignInPage } from '../renderer/src/team/SignInPage';
import { Name } from '../shared/product-name.mjs';

const draw = (props = {}) => renderToStaticMarkup(createElement(SignInPage, props));
const top = (html) => html.slice(0, html.indexOf('<h1'));

describe('the sign-in page wears the Agentbox logo', () => {
  it.each([
    ['signing in', {}],
    ['after signing out', { signedOut: true }],
    ['waiting on the browser', { waitingUrl: 'https://example.test/auth' }],
  ])('shows the app icon above the heading when %s', (_, props) => {
    const head = top(draw(props));
    expect(head).toMatch(/<img[^>]*class="product-mark app-mark"/);
    expect(head).toContain('agentbox-icon');
  });

  it('never draws the letter placeholder', () => {
    for (const props of [{}, { signedOut: true }, { waitingUrl: 'https://example.test/auth' }]) {
      const head = top(draw(props));
      expect(head).not.toContain(`>${Name.slice(0, 1).toUpperCase()}</span>`);
      expect(head).not.toMatch(/<span[^>]*si-mark[^>]*>[^<]/);
    }
  });

  it('keeps the logo out of what a screen reader says, since the heading names the app', () => {
    expect(top(draw())).toMatch(/<img[^>]*aria-hidden="true"/);
  });
});
