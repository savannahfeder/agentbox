// A GOOGLE SIGN-IN THAT DID NOT LAND CAN BE TRIED AGAIN, AND SAYS WHERE IT WENT.
//
// 2026-10-04: the first teammate to install the team version clicked Continue
// with Google and, in her words, it "does nothing, even after many repeated
// clicks"; nothing in the terminal, a full restart gave the same. Booted as a
// new user in a throwaway home, the click did reach the browser hand-off
// (the Supabase authorize address was handed to the browser at once), so the
// page had gone somewhere she could not see. What the app did next is what
// made it a dead end, measured the same way:
//   - the button sat disabled on "Finish in your browser…" for five minutes,
//     with no link to open again, nothing to copy and no way to cancel;
//   - reloading and clicking again failed with
//     "listen EADDRINUSE: address already in use 127.0.0.1:54783", because the
//     first attempt still held the return address;
//   - not one line reached the terminal.
// So a new attempt replaces the old one, a cancel frees the address, the page
// is handed the link it opened, and every step says so in the log.
import { it, expect, describe, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mjs';
import { signInWithGoogle, cancelGoogleSignIn } from '../main/team/sign-in.mjs';
import { createTeamService } from '../main/team/index.mjs';

const freePort = () => new Promise((resolve) => {
  const s = http.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

const AUTHORIZE = 'https://cloud.test/auth/v1/authorize?provider=google';
function fakeClient({ exchangeError = null } = {}) {
  return {
    auth: {
      signInWithOAuth: async () => ({ data: { url: AUTHORIZE }, error: null }),
      exchangeCodeForSession: async () => ({ error: exchangeError }),
    },
  };
}

const comeBack = (returnUrl, query) => fetch(`${returnUrl}?${query}`).then((r) => r.status);

afterEach(() => { cancelGoogleSignIn(); });

describe('one Google sign-in', () => {
  it('hands the page the address it opened, then finishes when the browser comes back', async () => {
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const opened = [];
    const urls = [];
    const lines = [];
    const done = signInWithGoogle({ client: fakeClient(), openExternal: async (u) => { opened.push(u); }, returnUrl, onUrl: (u) => urls.push(u), log: (l) => lines.push(l) });
    await new Promise((r) => setTimeout(r, 50));
    expect(opened).toEqual([AUTHORIZE]);
    expect(urls).toEqual([AUTHORIZE]);
    expect(await comeBack(returnUrl, 'code=abc')).toBe(200);
    await expect(done).resolves.toBeUndefined();
    expect(lines.join('\n')).toMatch(/opening/i);
    expect(lines.join('\n')).toMatch(/came back/i);
  });

  it('says what the cloud said when the code is refused', async () => {
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const done = signInWithGoogle({ client: fakeClient({ exchangeError: new Error('code expired') }), openExternal: async () => {}, returnUrl });
    done.catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    expect(await comeBack(returnUrl, 'code=abc')).toBe(400);
    await expect(done).rejects.toThrow('code expired');
  });

  it('a tab left over from an earlier try is told so in words, not "invalid flow state"', async () => {
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const done = signInWithGoogle({ client: fakeClient({ exchangeError: new Error('invalid flow state, no valid flow state found') }), openExternal: async () => {}, returnUrl });
    done.catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    await comeBack(returnUrl, 'code=abc');
    await expect(done).rejects.toThrow(/earlier try/);
  });
});

describe('trying again', () => {
  it('a second click while the first still waits replaces it rather than failing on the address', async () => {
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const first = signInWithGoogle({ client: fakeClient(), openExternal: async () => {}, returnUrl });
    first.catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    const second = signInWithGoogle({ client: fakeClient(), openExternal: async () => {}, returnUrl });
    await expect(first).rejects.toMatchObject({ cancelled: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(await comeBack(returnUrl, 'code=abc')).toBe(200);
    await expect(second).resolves.toBeUndefined();
  });

  it('cancel stops the wait and frees the address at once', async () => {
    const port = await freePort();
    const returnUrl = `http://127.0.0.1:${port}/auth/callback`;
    const waiting = signInWithGoogle({ client: fakeClient(), openExternal: async () => {}, returnUrl });
    waiting.catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    expect(cancelGoogleSignIn()).toBe(true);
    await expect(waiting).rejects.toMatchObject({ cancelled: true });
    const probe = http.createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
    await new Promise((r) => probe.close(r));
  });

  it('cancel with nothing waiting does nothing, and does not undo a finished sign-in', async () => {
    expect(cancelGoogleSignIn()).toBe(false);
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const done = signInWithGoogle({ client: fakeClient(), openExternal: async () => {}, returnUrl });
    await new Promise((r) => setTimeout(r, 50));
    await comeBack(returnUrl, 'code=abc');
    await expect(done).resolves.toBeUndefined();
    expect(cancelGoogleSignIn()).toBe(false);
  });

  it('an address held by something else (another copy of the app) is said in words', async () => {
    const port = await freePort();
    const other = http.createServer();
    await new Promise((r) => other.listen(port, '127.0.0.1', r));
    try {
      await expect(signInWithGoogle({ client: fakeClient(), openExternal: async () => {}, returnUrl: `http://127.0.0.1:${port}/auth/callback` }))
        .rejects.toThrow(/another copy/i);
    } finally {
      await new Promise((r) => other.close(r));
    }
  });
});

describe('the page while a Google sign-in waits', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  it('offers the link again, a copy of it and a cancel, through doors both front ends have', () => {
    const page = read('renderer/src/team/SignInPage.tsx');
    expect(page).toContain('api.teamSignInReopen()');
    expect(page).toContain('api.teamSignInCancel()');
    expect(page).toContain('navigator.clipboard.writeText(waitingUrl)');
    expect(read('renderer/src/App.tsx')).toMatch(/<SignInPage[^>]*waitingUrl=\{snap\?\.team\?\.signingIn\?\.url/);
    expect(REQUEST_CHANNELS.teamSignInCancel).toBe('zero:team-sign-in-cancel');
    expect(REQUEST_CHANNELS.teamSignInReopen).toBe('zero:team-sign-in-reopen');
  });

  it('never shows a cancel the person asked for as an error', () => {
    expect(read('renderer/src/team/SignInPage.tsx')).toMatch(/!\/cancelled\/i\.test/);
  });
});

describe('the team service while a Google sign-in waits', () => {
  function service() {
    let release;
    const session = {
      configured: true,
      async restore() { return null; },
      async signIn({ onUrl } = {}) {
        onUrl?.(AUTHORIZE);
        await new Promise((resolve, reject) => { release = { resolve, reject }; });
        return null;
      },
    };
    const team = createTeamService({ session, store: {}, disk: {}, accountRoot: '/nowhere', stateFile: '/nowhere/team.json' });
    return { team, release: () => release };
  }

  it('shows the address it opened until the attempt ends, and clears it on a cancel', async () => {
    const { team, release } = service();
    const pending = team.signIn().catch((e) => e);
    await new Promise((r) => setTimeout(r, 10));
    expect(team.state().signingIn).toEqual({ url: AUTHORIZE });
    release().reject(Object.assign(new Error('Sign-in was cancelled.'), { cancelled: true }));
    const err = await pending;
    expect(err.cancelled).toBe(true);
    expect(team.state().signingIn).toBeNull();
  });

  it('is not signing in before anyone clicks', () => {
    const { team } = service();
    expect(team.state().signingIn ?? null).toBeNull();
  });
});
