// A COMPUTER WITH NO GITHUB SIGN-IN SIGNS IN WITH GITHUB'S OWN LOGIN.
//
// What broke: a ship refused for want of a GitHub sign-in asked the person to
// make and paste a token, where in Terminal they would run `gh auth login`,
// enter a code in the browser and be done. Measured against a stand-in gh that
// prints what gh 2.23 printed on a machine with no screen ("! First copy your
// one-time code: D12A-7D90" and the device link): the app reads the code and
// the link, knows when the person approved it, and says so plainly when this
// computer has no gh at all.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NO_GH, setUpGit, startGhLogin } from '../main/github-browser-sign-in.mts';
import { NO_GITHUB_SIGN_IN } from '../shared/github-push-sign-in.mts';

const { GitHubSignInCard } = await import('../renderer/src/components/GitHubSignInCard.tsx');

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-login-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A gh that answers `auth login` as the real one does, then exits with `exit`.
function standInGh({ exit = 0, prints = true } = {}) {
  const gh = path.join(tmp, 'gh');
  const said = path.join(tmp, 'said');
  fs.writeFileSync(gh, [
    '#!/bin/sh',
    `echo "$@" >> ${JSON.stringify(said)}`,
    'if [ "$1 $2" = "auth setup-git" ]; then exit 0; fi',
    prints ? 'echo "! First copy your one-time code: D12A-7D90" >&2' : 'echo "error connecting to api.github.com" >&2',
    prints ? 'echo "Open this URL to continue in your web browser: https://github.com/login/device" >&2' : '',
    'sleep 0.3',
    `exit ${exit}`,
  ].join('\n'), { mode: 0o755 });
  return { gh, said: () => fs.readFileSync(said, 'utf8') };
}

describe('GitHub\'s own sign-in, started by the app', () => {
  it('reads the code and the link gh prints, and knows when it finished', async () => {
    const { gh, said } = standInGh();
    const login = await startGhLogin({ gh });
    expect(login).toMatchObject({ code: 'D12A-7D90', url: 'https://github.com/login/device' });
    expect(await login.done).toBe(true);
    expect(said()).toContain('auth login --web --hostname github.com --git-protocol https');
  });

  it('knows when the person never approved it', async () => {
    const login = await startGhLogin({ gh: standInGh({ exit: 1 }).gh });
    expect(await login.done).toBe(false);
  });

  it('says what gh said when it stops before giving a code', async () => {
    await expect(startGhLogin({ gh: standInGh({ prints: false, exit: 1 }).gh })).rejects.toThrow('error connecting to api.github.com');
  });

  it('says plainly when this computer has no gh', async () => {
    await expect(startGhLogin({ gh: path.join(tmp, 'no-such-gh') })).rejects.toThrow(NO_GH);
  });

  it('then lets git push with it', async () => {
    const { gh, said } = standInGh();
    expect(await setUpGit({ gh })).toBe(true);
    expect(said()).toContain('auth setup-git --hostname github.com');
    expect(await setUpGit({ gh: path.join(tmp, 'no-such-gh') })).toBe(false);
  });
});

describe('the card on a ship that could not push', () => {
  const draw = () => renderToStaticMarkup(h(GitHubSignInCard, { why: NO_GITHUB_SIGN_IN, signIn: async () => ({ code: 'X', url: 'u' }), save: async () => null, openLink: () => {}, copy: () => {} }));
  it('leads with GitHub\'s own sign-in, and keeps the token for a computer without gh', () => {
    const html = draw();
    expect(html).toContain('Sign in with GitHub');
    expect(html).toContain('Paste a token instead');
    expect(html).not.toContain('type="password"');
  });
});
