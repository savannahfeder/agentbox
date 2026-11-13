// A CLOUD GITHUB ASK SIGNS IN WITH GITHUB'S OWN LOGIN.
//
// What broke: a cloud run asked for `sign-in github`, and the thread's card
// offered only "Paste the token" and a link to GitHub's token page. The
// person asked whether they could use OAuth, were told yes, then found a token
// box. The ship card already signs in with gh's device login; the cloud card
// never did. Measured by drawing the card with and without the app's GitHub
// sign-in, and by reading the token back from a stand-in gh.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NEED, needsIn } from '../shared/cloud-needs.mts';
import { ghToken } from '../main/github-browser-sign-in.mts';

const { NeedCard, NeedPlace } = await import('../renderer/src/components/NeedCard.tsx');

const needs = needsIn([
  `${NEED} sign-in github | to read the failure log`,
  `${NEED} sign-in sentry | to read the errors`,
].join('\n'));
const base = { itemId: 'w-1', saved: [], given: [], live: true, needs, saveKeys: async () => null, sendFile: async () => null, sendCode: async () => null, onComputer: () => {}, openLink: () => {} };
const signIn = { start: async () => ({ code: 'D12A-7D90', url: 'https://github.com/login/device' }), token: async () => ({ token: 'gho_x' }), open: () => {} };
const draw = (n, o = {}) => renderToStaticMarkup(h(NeedPlace.Provider, { value: { ...base, ...o } }, h(NeedCard, { source: JSON.stringify(needs[n]), fallback: null })));

describe('the card a cloud run draws for a GitHub sign-in', () => {
  it('leads with GitHub\'s own sign-in, with a token kept for a computer without gh', () => {
    const html = draw(0, { gitHubSignIn: signIn });
    expect(html).toContain('Sign in with GitHub');
    expect(html).toContain('Paste a token instead');
    expect(html).not.toContain('type="password"');
  });

  it('still takes a token where the app has no GitHub sign-in to start', () => {
    const html = draw(0);
    expect(html).not.toContain('Sign in with GitHub');
    expect(html).toContain('type="password"');
  });

  it('leaves every other service as it was', () => {
    const html = draw(1, { gitHubSignIn: signIn });
    expect(html).not.toContain('Sign in with');
    expect(html).toContain('type="password"');
  });

  it('says connected once the token is saved', () => {
    expect(draw(0, { gitHubSignIn: signIn, saved: ['GH_TOKEN'] })).toContain('GitHub connected');
  });
});

describe('the token gh made', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-token-')); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const gh = (body) => { const f = path.join(tmp, 'gh'); fs.writeFileSync(f, `#!/bin/sh\n${body}\n`, { mode: 0o755 }); return f; };

  it('is read from gh once it is signed in', async () => {
    expect(await ghToken({ gh: gh('[ "$1 $2" = "auth token" ] && echo gho_abc123 && exit 0; exit 2') })).toBe('gho_abc123');
  });

  it('is nothing when gh is not signed in, or not there', async () => {
    expect(await ghToken({ gh: gh('echo "no oauth token" >&2; exit 1') })).toBe(null);
    expect(await ghToken({ gh: path.join(tmp, 'no-such-gh') })).toBe(null);
  });
});
