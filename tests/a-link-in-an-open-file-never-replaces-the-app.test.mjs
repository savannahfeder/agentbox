// A LINK IN AN OPEN FILE NEVER REPLACES THE APP.
//
// A web link inside a document opened full screen was a bare <a href>: nothing
// caught the click, and the app's own window has no will-navigate guard, so the
// whole window became that website. There was no bar, no Back and no Close,
// and you could not get back to your inbox. Measured by reading the code
// paths: ArtifactStage drew markdown links with no handler, and main/main.mts
// guarded only new windows (setWindowOpenHandler), not the window itself.
//
// Now a web link opens in a small browser over the file, with Back, the
// address, Open in your browser and Close, and Close puts you back on the file.
// Underneath that, the app's window refuses to be walked off its own page by
// any link at all.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { whereAFileLinkGoes } from '../renderer/src/file-links.ts';
import { leavesTheApp } from '../main/app-window-stays.mjs';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('where a link inside an open file goes', () => {
  it('a web address opens in the browser over the file', () => {
    expect(whereAFileLinkGoes('https://example.com/pricing')).toBe('browser');
    expect(whereAFileLinkGoes('http://localhost:3006/')).toBe('browser');
  });

  it('a path to another file opens outside, never in the window', () => {
    expect(whereAFileLinkGoes('docs/brief.md')).toBe('outside');
    expect(whereAFileLinkGoes('../designs/a.png')).toBe('outside');
  });

  it('a jump within the page, a script or any other scheme goes nowhere', () => {
    expect(whereAFileLinkGoes('#pricing')).toBe('nowhere');
    expect(whereAFileLinkGoes('javascript:alert(1)')).toBe('nowhere');
    expect(whereAFileLinkGoes('file:///etc/passwd')).toBe('nowhere');
    expect(whereAFileLinkGoes('')).toBe('nowhere');
  });
});

describe('the app window stays on the app', () => {
  const built = 'file:///Applications/Agentbox.app/Contents/Resources/app/renderer/dist/index.html';

  it('a website would leave it', () => {
    expect(leavesTheApp(built, 'https://example.com/')).toBe(true);
    expect(leavesTheApp('http://localhost:5173/', 'https://example.com/')).toBe(true);
  });

  it('another file on disk would leave it', () => {
    expect(leavesTheApp(built, 'file:///Applications/Agentbox.app/Contents/Resources/app/renderer/dist/attachments/x.png')).toBe(true);
  });

  it('the app reloading itself, with or without a query, stays', () => {
    expect(leavesTheApp(built, `${built}?fixtures=1`)).toBe(false);
    expect(leavesTheApp('http://localhost:5173/', 'http://localhost:5173/?fixtures=1')).toBe(false);
  });

  it('another page on the dev server would leave it', () => {
    expect(leavesTheApp('http://localhost:5173/', 'http://localhost:5174/')).toBe(true);
    expect(leavesTheApp('http://localhost:5173/', 'http://localhost:5173/other.html')).toBe(true);
  });

  it('an address that cannot be read leaves', () => {
    expect(leavesTheApp(built, 'not a url')).toBe(true);
  });
});

describe('both are wired in', () => {
  it('the app window stops a link that would leave and sends it to your browser', () => {
    const main = read('main/main.mts');
    expect(main).toMatch(/window\.webContents\.on\('will-navigate'[\s\S]{0,300}leavesTheApp\(/);
  });

  it('a markdown link in the full-screen file view is caught', () => {
    const stage = read('renderer/src/components/ArtifactStage.tsx');
    expect(stage).toMatch(/\ba: \(/);
    expect(stage).toMatch(/whereAFileLinkGoes\(/);
  });

  it('the file view draws the browser with a way back', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/<FileLinkBrowser/);
    const browser = read('renderer/src/components/FileLinkBrowser.tsx');
    expect(browser).toMatch(/<BrowserChrome/);
    expect(browser).toMatch(/<WebsitePane/);
  });
});
