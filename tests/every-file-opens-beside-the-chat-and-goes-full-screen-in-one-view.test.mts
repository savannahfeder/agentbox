// EVERY FILE OPENS BESIDE THE CHAT, AND FULL SCREEN IS ONE VIEW (w-375c72d32e, 2026-11-08).
//
// What broke: there were two full-screen views. A note, a page or a script
// opened beside the chat, and that pane's corner-arrows button hid the chat
// with a plain full-screen pane: no versions, no notes column, no Approve. A
// picture, a table, a PDF or a film skipped the side pane and opened straight
// into the other full-screen view (ArtifactView), which had all three. Measured
// in the browser copy at 1440x900: a markdown file's full screen had no
// "v1 of 2" and no Approve; a picture never showed beside the chat at all.
//
// Now the side pane's full-screen button opens the one view with versions,
// notes and Approve, and that view's top-right button puts the file back beside
// the chat. Which way a file opens first is the person's split (2026-11-09):
// something to look at (a picture, a film, a PDF, a design page, a deck) opens
// full screen, and something to read and talk over (a document, a table, a
// script) opens beside the chat. A website, a local app and a code change are
// not files that view reads, so they keep the pane's own full screen.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fullScreenTakes, whereAFileOpens } from '../renderer/src/artifact-layout.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('where a file pressed in a thread opens', () => {
  it('full screen for a picture, a film, a PDF, a design page and a deck', () => {
    for (const f of ['shot.png', 'designs/w-1/onboarding-v3.jpg', 'icon.svg', 'demo.mp4', 'clip.webm', 'brief.pdf', 'designs/w-1/options.html', 'page.htm', 'pitch.pptx']) {
      expect(whereAFileOpens(f), f).toBe('full');
    }
  });
  it('beside the chat for a document, a table and a script', () => {
    for (const f of ['notes.md', 'plan.markdown', 'leads/fintech-leads.csv', 'leads.tsv', 'cart.mjs', 'notes.txt']) {
      expect(whereAFileOpens(f), f).toBe('beside');
    }
  });
  it('the old way for what is not a file the full-screen view reads', () => {
    for (const f of ['https://example.com/report.html', 'https://example.com/shot.png', 'http://localhost:3000', 'run.change', 'model.xlsx', null, '']) {
      expect(whereAFileOpens(f), String(f)).toBeNull();
    }
  });
});

describe('what the full-screen button opens', () => {
  it('the one file view for every file it reads', () => {
    for (const f of ['shot.png', 'demo.mp4', 'brief.pdf', 'leads.csv', 'notes.md', 'page.html', 'cart.mjs', 'pitch.pptx']) expect(fullScreenTakes(f), f).toBe(true);
  });
  it('the pane\'s own full screen for a website, a local app and a code change', () => {
    for (const f of ['https://example.com/page.html', 'http://127.0.0.1:5173/', 'run.change']) expect(fullScreenTakes(f), f).toBe(false);
  });
});

describe('the wiring', () => {
  const focus = read('renderer/src/components/Focus.tsx');
  const app = read('renderer/src/App.tsx');
  const threadView = read('renderer/src/components/ThreadArtifacts.tsx');
  const teammate = read('renderer/src/threads/TeammateThread.tsx');

  it('a thread opens a file with the rule, both ways', () => {
    expect(focus).toMatch(/const opensBig = [^\n]*whereAFileOpens\(path\) === 'full'/);
    expect(focus).toMatch(/whereAFileOpens\(/);
    const openHref = focus.slice(focus.indexOf('const openHref'), focus.indexOf("if (goes === 'picture')"));
    expect(openHref).toMatch(/opensBeside\(href\)/);
  });
  it('the side pane\'s full-screen button opens the file view on your thread and on a teammate\'s', () => {
    const onMode = app.slice(app.indexOf('onMode={mode => {'), app.indexOf('split={artifactFraction('));
    expect(onMode).toMatch(/fullScreenTakes\(/);
    expect(onMode).toMatch(/setFullAt\(/);
    expect(onMode).toMatch(/setCardOpenAt\(/);
  });
  // Three power testers read the film's own corner-arrows button, beside the
  // pane's identical one, as a second full screen that skipped the notes.
  it('a film beside the chat has one full-screen button, the pane\'s', () => {
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toMatch(/<FilmPlayer [^\n]*wide=\{!onMode\}/);
  });
  // A power tester picked launch-plan.md under Files in the command bar, five
  // times, and it opened full screen every time. A comment still opens there,
  // and so does a file that opens full screen from the thread.
  it('a file picked in the command bar or search opens the way it does from its thread', () => {
    const inside = app.slice(app.indexOf('const openInside = useCallback'), app.indexOf('const insideForPalette'));
    expect(inside).toMatch(/!o\.note && whereAFileOpens\(o\.file\) === 'beside'/);
    expect(inside).toMatch(/pendingDoc\.current = \{ id: o\.item\.id, doc \}/);
    expect(inside).toMatch(/setFoundOpenAt\(big && !beside/);
  });
  // A power tester played a film to 0:03 beside the chat, went full screen, and
  // found it stopped at 0:00.
  it('a film goes full screen at the moment it had reached beside the chat', () => {
    const onMode = app.slice(app.indexOf('onMode={mode => {'), app.indexOf('split={artifactFraction('));
    expect(onMode).toMatch(/time: filmBeside\(\)/);
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/open\.time[^\n]*setGo\(\{ place: \{ kind: 'time', s: open\.time \}/);
  });
  // A power tester stepped to v1 in full screen, went back beside, and read v1
  // as the current file: the side pane has no version controls to say otherwise.
  it('beside the chat is the newest version, whichever one full screen was on', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/onBeside\(family\.versions\[family\.versions\.length - 1\]\.path\)/);
    expect(view).not.toMatch(/onBeside\(version\.path\)/);
  });
  it('the file view\'s own button puts the file back beside the chat, on both', () => {
    expect(threadView).toMatch(/onBeside/);
    expect(focus).toMatch(/onBeside=\{/);
    expect(teammate).toMatch(/onBeside=\{/);
  });
});
