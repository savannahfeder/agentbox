// A TABLE OPENS BESIDE THE CHAT, AND ANY FILE CAN MOVE TO THE SIDE (w-3b91fe341c).
//
// What broke: a .csv named in an answer opened in the full-window viewer, which
// hides the chat, while a note or a page named the same way opened beside it.
// The side pane already draws tables; the rule just left them out. And a
// picture, PDF or film opened full screen with no way to put it beside the
// chat. Measured: opensInTheLargeViewer(viewKind('home-routes.csv')) was true,
// and the big viewer's header had no control that leads to the side pane.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { whereAFileOpens } from '../renderer/src/artifact-layout.ts';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const kindOpensBig = (path) => whereAFileOpens(path) === 'full';

it('a csv or tsv opens beside the chat, like a note', () => {
  for (const f of ['home-routes.csv', 'designs/w-1/leads.csv', 'export.TSV']) expect(kindOpensBig(f), f).toBe(false);
});

// w-375c72d32e (2026-11-09): a design page opens big first too, as the person asked.
it('a picture, a film, a pdf, a design page and a deck still open big first', () => {
  for (const f of ['a.png', 'a.mp4', 'a.pdf', 'a.pptx', 'designs/w-1/options.html', 'routes.csv.png']) expect(kindOpensBig(f), f).toBe(true);
});

it('the big viewer offers to open the file on the side when the thread can', () => {
  const view = read('components/ArtifactView.tsx');
  expect(view).toMatch(/onBeside && family[^\n]*onClick=\{\(\) => onBeside\(/);
  const wrap = read('components/ThreadArtifacts.tsx');
  expect(wrap).toMatch(/onBeside=\{onBeside\}/);
  const focus = read('components/Focus.tsx');
  const beside = focus.slice(focus.indexOf('onBeside={onOpenArtifact ? (path) => {'), focus.indexOf('} : undefined} />', focus.indexOf('onBeside={onOpenArtifact')));
  expect(beside).toContain('setArtifact(null);');
  expect(beside).toContain("onOpenArtifact(path, 'beside');");
});
