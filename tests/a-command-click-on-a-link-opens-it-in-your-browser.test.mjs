// A ⌘-CLICK ON A LINK OPENS IT IN YOUR BROWSER; A PLAIN CLICK OPENS THE PANE.
//
// Reported twice, the second time with a screenshot: ⌘-clicking
// console.cloud.google.com/iam-admin/iam in an agent's message drew the Google
// sign-in in the side pane, where a new tab in the browser was expected. Read
// in the code: the link's click handler called `e.preventDefault()` and then
// the same opener whatever keys were held, and that opener has sent every web
// address to the pane since 2026-10-15. The first fix for this was made on a
// branch that never shipped, so this test is what keeps it.
//
// ⌘ is the Mac's "open in a new tab" and Ctrl is Linux's. Shift and Option mean
// other things in a browser and change nothing here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { whereALinkGoes, asksForANewTab } from '../renderer/src/link-click.ts';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const REPORTED = 'https://console.cloud.google.com/iam-admin/iam';
const PLAIN = {};
const CMD = { metaKey: true };
const CTRL = { ctrlKey: true };
const CMD_SHIFT = { metaKey: true, shiftKey: true };
const SHIFT = { shiftKey: true };
const OPTION = { altKey: true };

describe('the link in the screenshot', () => {
  it('opens in your browser on a ⌘-click', () => {
    expect(whereALinkGoes(REPORTED, CMD)).toBe('outside');
  });

  it('still opens in the pane on a plain click', () => {
    expect(whereALinkGoes(REPORTED, PLAIN)).toBe('pane');
    expect(whereALinkGoes(REPORTED)).toBe('pane');
  });
});

describe('which clicks ask for a new tab', () => {
  it('⌘, Ctrl, and ⌘ with Shift do', () => {
    expect(asksForANewTab(CMD)).toBe(true);
    expect(asksForANewTab(CTRL)).toBe(true);
    expect(asksForANewTab(CMD_SHIFT)).toBe(true);
  });

  it('a plain click, Shift and Option do not', () => {
    expect(asksForANewTab(PLAIN)).toBe(false);
    expect(asksForANewTab(SHIFT)).toBe(false);
    expect(asksForANewTab(OPTION)).toBe(false);
    expect(asksForANewTab({ metaKey: false, ctrlKey: false })).toBe(false);
  });
});

describe('everything the pane opens goes outside on a ⌘-click', () => {
  for (const [href, plain] of [
    ['https://en.wikipedia.org/wiki/Kestrel', 'pane'],
    ['http://localhost:3000', 'pane'],
    ['designs/w-1/options.html', 'pane'],
    ['STATE.md', 'pane'],
    ['runs/w-1.change', 'pane'],
    ['attachments/shot.png', 'picture'],
  ]) {
    it(href, () => {
      expect(whereALinkGoes(href, PLAIN)).toBe(plain);
      expect(whereALinkGoes(href, CMD)).toBe('outside');
      expect(whereALinkGoes(href, CTRL)).toBe('outside');
    });
  }

  it('Shift and Option leave a link where a plain click puts it', () => {
    expect(whereALinkGoes(REPORTED, SHIFT)).toBe('pane');
    expect(whereALinkGoes(REPORTED, OPTION)).toBe('pane');
    expect(whereALinkGoes('attachments/shot.png', SHIFT)).toBe('picture');
  });
});

describe('what a ⌘-click does not change', () => {
  it('a file the pane cannot draw already went outside, and still does', () => {
    expect(whereALinkGoes('reports/audit.pdf', PLAIN)).toBe('outside');
    expect(whereALinkGoes('reports/audit.pdf', CMD)).toBe('outside');
  });

  it('with no pane to open, a plain click goes outside as before', () => {
    expect(whereALinkGoes(REPORTED, PLAIN, { pane: false })).toBe('outside');
    expect(whereALinkGoes('attachments/shot.png', PLAIN, { pane: false })).toBe('picture');
  });
});

describe('the thread and the document pane both ask it', () => {
  const focus = read('renderer/src/components/Focus.tsx');

  it('a link in a message hands its click to the opener', () => {
    const link = focus.slice(focus.indexOf('function ArtifactLink'), focus.indexOf('function textOf'));
    expect(link).toMatch(/onClick=\{\(e\) => \{ e\.preventDefault\(\); onOpen\(e\); \}\}/);
    expect(focus).toMatch(/onOpen=\{\(click\) => openHref\(href, undefined, click\)\}/);
    expect(focus).toMatch(/onOpen=\{\(click\) => openHref\(source, undefined, click\)\}/);
    expect(focus).toMatch(/onOpen=\{\(click\) => openHref\(path, undefined, click\)\}/);
  });

  it('the opener decides with this rule, before the picture or the pane', () => {
    const open = focus.slice(focus.indexOf('const openHref'), focus.indexOf('const mdComponents'));
    expect(open).toContain('whereALinkGoes(href, click');
    expect(open).not.toMatch(/opensInPane\(/);
  });

  it('a link in a document open in the pane goes straight out on a ⌘-click, without the card', () => {
    const doc = read('renderer/src/components/DocText.tsx');
    expect(doc).toMatch(/if \(asksForANewTab\(e\)\) \{ setLinkPop\(null\); visitHref\(href\); return; \}/);
  });
});
