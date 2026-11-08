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
import { viewKind } from '../shared/artifact-marks.mjs';
import { opensInTheLargeViewer } from '../renderer/src/artifact-layout.ts';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const kindOpensBig = (path) => opensInTheLargeViewer(viewKind(path));

it('a csv or tsv opens beside the chat, like a note or a page', () => {
  for (const f of ['home-routes.csv', 'designs/w-1/leads.csv', 'export.TSV']) expect(kindOpensBig(f), f).toBe(false);
});

it('a picture, a film, a pdf and a deck still open big first', () => {
  for (const f of ['a.png', 'a.mp4', 'a.pdf', 'a.pptx', 'routes.csv.png']) expect(kindOpensBig(f), f).toBe(true);
});

it('the big viewer offers to open the file on the side when the thread can', () => {
  const view = read('components/ArtifactView.tsx');
  expect(view).toMatch(/onBeside && version[^\n]*onBeside\(version\.path\)[^\n]*Open on the side/);
  const wrap = read('components/ThreadArtifacts.tsx');
  expect(wrap).toMatch(/onBeside=\{onBeside\}/);
  const focus = read('components/Focus.tsx');
  expect(focus).toMatch(/<ThreadArtifacts[^>]*onBeside=\{onOpenDoc \? \(src\) => \{ setArtifact\(null\); onOpenDoc\(src\); \} : undefined\}/);
});
