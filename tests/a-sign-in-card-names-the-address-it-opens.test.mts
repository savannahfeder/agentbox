// A SIGN-IN CARD NAMES THE ADDRESS IT OPENS.
//
// What was wrong (2026-11-14, daily security review): the card an agent puts
// up with sign_in drew the service's logo and "Open GitHub" for whatever
// service name the agent gave, and never showed the link. An agent steered by
// a page could put a lookalike address behind a GitHub-branded card with a box
// for the code. Measured by rendering the card with service "GitHub" and
// https://github-login.example.net: GitHub's logo and "Open GitHub", no address.
// The person approved design 1 (2026-11-15): the address is the title and the
// button, and the logo shows only for the service's own address.
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { linkHost, linkIsTheService } from '../shared/sign-in-ask.mts';

const { SignInCard } = await import('../renderer/src/components/SignInCard.tsx');
const draw = (service: string, url: string, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(SignInCard, { ask: { id: 's-abcdef12', service, url, ...extra }, cloud: false, open: () => {}, answer: async () => null, copy: () => {} }));

describe('whether a link is the service\'s own', () => {
  it.each([
    ['GitHub', 'https://github.com/login/device'],
    ['github', 'https://api.github.com/x'],
    ['Vercel', 'https://vercel.com/oauth/device?user_code=X'],
    ['Supabase', 'https://supabase.com/dashboard/cli/login'],
    ['AWS', 'https://signin.aws.amazon.com/oauth'],
    ['Linear', 'https://linear.app/oauth/authorize'],
  ])('%s at %s is', (service, url) => expect(linkIsTheService(service, url)).toBe(true));

  it.each([
    ['GitHub', 'https://github-login.example.net/device'],
    ['GitHub', 'https://github.com.example.net/login'],
    ['GitHub', 'https://evilgithub.com/login'],
    ['GitHub', 'https://github.com@example.net/login'],
    ['Vercel', 'https://github.com/login/device'],
    ['Some tool', 'https://sometool.com/login'],
  ])('%s at %s is not', (service, url) => expect(linkIsTheService(service, url)).toBe(false));

  it('reads the host a browser would open', () => {
    expect(linkHost('https://github.com@example.net/login')).toBe('example.net');
    expect(linkHost('not a link')).toBe('');
  });
});

describe('the card', () => {
  it('names the address as its title and on its button, with the service\'s logo', () => {
    const html = draw('GitHub', 'https://github.com/login/device', { code: 'ABCD-1234' });
    expect(html).toContain('Sign in at github.com');
    expect(html).toContain('Open github.com');
    expect(html).toContain('<img');
    expect(html).not.toContain('Sign in to GitHub');
  });

  it('draws no logo and never the service\'s name for a lookalike', () => {
    const html = draw('GitHub', 'https://github-login.example.net/device', { asksForCode: true });
    expect(html).toContain('Sign in at github-login.example.net');
    expect(html).toContain('Open github-login.example.net');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('GitHub');
  });
});
