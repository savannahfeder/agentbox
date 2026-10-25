// A WEBSITE IN THE PANE CANNOT REACH THE APP.
//
// The pane now draws a page off the open web (see
// a-web-link-opens-in-the-pane-beside-the-thread.test.mjs), which is the first
// time anything in this window has drawn code nobody here wrote. The window
// itself has `webviewTag: true`, and until this a webview could be attached
// with any preferences the tag asked for: the app's own preload, node turned
// on, context isolation off, web security off. None of that was ever set, but
// nothing stopped it being set, and the one that matters is the preload: it is
// the bridge the app's own page talks to the store through, and a page from
// the web holding it holds everything the person holds.
//
// So every webview this window attaches is pinned here, below the tag, rather
// than trusted to the attributes on it. The idea is the contributor's, from
// the pull request this work came out of (savannahfeder/agentbox#31); the code
// is ours.
//
// The cases: a tag that asks for everything dangerous, a tag that asks for
// nothing, the autoplay rule that was already in this seam and must survive,
// and the one thing that must NOT be flattened, the partition, which is how
// the website pane's sign-ins are kept out of the agent browser's store.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hardenAttachedWebview } from '../main/webview-guard.mjs';
import { WEBSITE_PARTITION } from '../shared/websites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// THE DANGEROUS PREFERENCES BELOW ARE THE TEST. Every one of them is what a
// tag might ask for and the guard refuses, so the file has to be able to say
// them; the assertions underneath are that none survives. The public check
// reads a push for exactly these words and is right to, hence the markers.
describe('a tag that asks for the keys to the app', () => {
  const asked = () => ({
    preload: '/Applications/Agentbox.app/preload.cjs',
    preloadURL: 'file:///Applications/Agentbox.app/preload.cjs',
    nodeIntegration: true, // public-check: allow
    nodeIntegrationInSubFrames: true, // public-check: allow
    contextIsolation: false, // public-check: allow
    sandbox: false, // public-check: allow
    webSecurity: false, // public-check: allow
    allowRunningInsecureContent: true, // public-check: allow
    experimentalFeatures: true,
  });

  it('gets none of them', () => {
    const prefs = asked();
    hardenAttachedWebview(prefs, {});
    expect(prefs.preload).toBeUndefined();
    expect(prefs.preloadURL).toBeUndefined();
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.nodeIntegrationInSubFrames).toBe(false);
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.webSecurity).toBe(true);
    expect(prefs.allowRunningInsecureContent).toBe(false);
    expect(prefs.experimentalFeatures).toBe(false);
  });

  it('cannot open a window of its own either', () => {
    const params = { allowpopups: true, nodeintegration: true };
    hardenAttachedWebview({}, params);
    expect(params.allowpopups).toBe(false);
    expect(params.nodeintegration).toBe(false);
  });
});

describe('a tag that asks for nothing', () => {
  it('is pinned to the same floor, because the default is not the rule', () => {
    const prefs = {};
    hardenAttachedWebview(prefs, {});
    expect(prefs.preload).toBeUndefined();
    expect(prefs.sandbox).toBe(true);
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.webSecurity).toBe(true);
  });

  it('survives being handed no params at all', () => {
    expect(() => hardenAttachedWebview({})).not.toThrow();
  });
});

describe('what the guard must not touch', () => {
  it('leaves the partition alone, which is what keeps the stores apart', () => {
    const prefs = { partition: WEBSITE_PARTITION };
    const params = { partition: WEBSITE_PARTITION };
    hardenAttachedWebview(prefs, params);
    expect(prefs.partition).toBe(WEBSITE_PARTITION);
    expect(params.partition).toBe(WEBSITE_PARTITION);
    // The agent browser's store is a different one, and stays different.
    expect(WEBSITE_PARTITION).not.toBe('persist:junk');
  });

  it('keeps the rule that no embedded page starts sound before you click in it', () => {
    const prefs = {};
    hardenAttachedWebview(prefs, {});
    expect(prefs.autoplayPolicy).toBe('document-user-activation-required');
  });
});

describe('the guard is actually wired to the window', () => {
  it('runs on every webview the window attaches', () => {
    const main = read('main/main.mjs');
    expect(main).toContain("will-attach-webview");
    expect(main).toContain('hardenAttachedWebview');
  });

  it('sends a link that wants a new window out to your own browser', () => {
    const main = read('main/main.mjs');
    expect(main).toContain('setWindowOpenHandler');
    // On the guest's own contents, not only on the app's page.
    expect(main).toMatch(/contents\.setWindowOpenHandler/);
  });

  it('still never lets an agent drive the browser you are signed into', () => {
    // The standing rule (tests/no-worker-drives-her-own-browser.test.mjs).
    // This pane is read by a person; nothing here spawns against it.
    const main = read('main/main.mjs');
    expect(main).not.toMatch(/['"`]--chrome['"`]/);
    expect(read('CLAUDE.md')).toContain('NO WORKER EVER DRIVES THE USER');
  });
});
