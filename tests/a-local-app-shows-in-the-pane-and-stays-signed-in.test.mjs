// A LOCAL APP SHOWS IN THE PANE AND STAYS SIGNED IN.
//
// What broke: a worker's answer named http://localhost:3006, the pane opened
// beside it, and the pane stayed blank. The app there (Next.js) answers every
// page with `X-Frame-Options: DENY` and `Content-Security-Policy:
// frame-ancestors 'none'`, measured with curl on 2026-10-09. The pane draws a
// local app in a frame, so Chromium refused to draw it, while the check in
// local-preview.ts saw the app answering and lifted the cover off an empty
// frame. Behind that sat a second fault: the window is a file:// page, so the
// app in the frame is cross-site to it, and the SameSite=Lax cookie a sign-in
// sets was refused, so signing in went nowhere.
//
// Measured end to end on Electron 43 with scripts/scratch/local-frame-proof.mjs:
// without this, a framed app that refuses framing drew nothing and a Lax
// sign-in cookie never came back; with it, the page drew and the cookie came
// back on the next load.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { localAppHeaders, isLocalAddress } from '../main/local-app-frames.mjs';

const refusing = () => ({
  'X-Frame-Options': ['DENY'],
  'Content-Security-Policy': ["frame-ancestors 'none'; object-src 'none'; base-uri 'self'"],
  'Content-Type': ['text/html'],
});

describe('which addresses count as a local app', () => {
  it('is localhost and the loopback addresses, on any port', () => {
    for (const url of ['http://localhost:3006/', 'http://127.0.0.1:48765/x?y=1', 'http://[::1]:3000/', 'https://localhost:8443/']) {
      expect(isLocalAddress(url)).toBe(true);
    }
  });
  it('is not a site that only looks like one', () => {
    for (const url of ['https://example.com/', 'http://localhost.evil.com:3000/', 'http://127.0.0.2.nip.io/', 'file:///tmp/x.html', 'astral-doc://x/y.html', 'not a url']) {
      expect(isLocalAddress(url)).toBe(false);
    }
  });
});

describe('a local app drawn in the pane', () => {
  it('drops the two headers that refuse to be drawn in a frame', () => {
    const out = localAppHeaders({ url: 'http://localhost:3006/', resourceType: 'subFrame', responseHeaders: refusing() });
    expect(out['X-Frame-Options']).toBeUndefined();
    expect(out['Content-Security-Policy']).toEqual(["object-src 'none'; base-uri 'self'"]);
    expect(out['Content-Type']).toEqual(['text/html']);
  });

  it('reads the header names whatever their case, as servers send them', () => {
    const out = localAppHeaders({
      url: 'http://127.0.0.1:5000/', resourceType: 'subFrame',
      responseHeaders: { 'x-frame-options': ['SAMEORIGIN'], 'content-security-policy': ["default-src 'self'; FRAME-ANCESTORS 'self'"] },
    });
    expect(out['x-frame-options']).toBeUndefined();
    expect(out['content-security-policy']).toEqual(["default-src 'self'"]);
  });

  it('takes the whole policy away when framing was all it said', () => {
    const out = localAppHeaders({ url: 'http://localhost:3006/', resourceType: 'subFrame', responseHeaders: { 'Content-Security-Policy': ["frame-ancestors 'none'"] } });
    expect(out['Content-Security-Policy']).toBeUndefined();
  });

  it('keeps a sign-in cookie by letting it be sent inside the window', () => {
    const out = localAppHeaders({
      url: 'http://localhost:3006/api/auth/callback', resourceType: 'xhr',
      responseHeaders: { 'Set-Cookie': ['sid=abc; Path=/; HttpOnly; SameSite=Lax', 'theme=dark; Path=/', 'csrf=1; Secure; samesite=strict; Path=/'] },
    });
    expect(out['Set-Cookie']).toEqual([
      'sid=abc; Path=/; HttpOnly; SameSite=None; Secure',
      'theme=dark; Path=/; SameSite=None; Secure',
      'csrf=1; Secure; Path=/; SameSite=None',
    ]);
  });

  it('leaves a cookie that already says SameSite=None as it is', () => {
    const out = localAppHeaders({ url: 'http://localhost:3006/', resourceType: 'subFrame', responseHeaders: { 'set-cookie': ['a=1; SameSite=None; Secure'] } });
    expect(out).toBeNull();
  });
});

describe('what it leaves alone', () => {
  it('touches nothing that is not a local address', () => {
    expect(localAppHeaders({ url: 'https://example.com/', resourceType: 'subFrame', responseHeaders: refusing() })).toBeNull();
    expect(localAppHeaders({ url: 'http://localhost.evil.com:3000/', resourceType: 'subFrame', responseHeaders: refusing() })).toBeNull();
  });

  it('touches nothing the window itself loads, so a dev server under the app is untouched', () => {
    expect(localAppHeaders({ url: 'http://localhost:5173/', resourceType: 'mainFrame', responseHeaders: refusing() })).toBeNull();
  });

  it('keeps the framing headers on anything that is not a frame, where they mean nothing anyway', () => {
    const out = localAppHeaders({ url: 'http://localhost:3006/app.js', resourceType: 'script', responseHeaders: refusing() });
    expect(out).toBeNull();
  });

  it('is wired to the main window only, below the page, in main.mjs', () => {
    const main = fs.readFileSync(new URL('../main/main.mjs', import.meta.url), 'utf8');
    expect(main).toContain('letLocalAppsShowInThePane(window.webContents)');
  });
});

describe('the frame a local app is drawn in', () => {
  it('lets the app post a form, open a dialog and hand a link to the browser, as in a tab', () => {
    const pane = fs.readFileSync(new URL('../renderer/src/components/DocPane.tsx', import.meta.url), 'utf8');
    expect(pane).toContain("sandbox={app.local ? LOCAL_APP_SANDBOX : 'allow-scripts allow-same-origin'}");
    const preview = fs.readFileSync(new URL('../renderer/src/local-preview.ts', import.meta.url), 'utf8');
    expect(preview).toMatch(/LOCAL_APP_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads'/);
  });
});
