// A NOTE OR PAGE A THREAD NAMES OPENS BESIDE THE CHAT (w-4ad34d6a27, 2026-11-02).
//
// What broke: the same file opened three different ways depending on how you
// reached it. A path on its own line opened beside the chat; a click on a note
// read in place, a link to it, or its tile opened the full-window viewer, which
// hides the chat; and on an agent's thread the note's click went full screen.
// People give feedback through the chat while reading, so anything that hid it
// was the wrong default, and the mix was confusing. Measured in the browser
// copy at 1920x1080: clicking a note in an answer covered the whole window.
//
// Now every way in opens a note or page beside the chat. Full screen stays
// behind its own corner mark; media keeps the large viewer.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { viewKind } from '../shared/artifact-marks.mjs';
import { opensInTheLargeViewer } from '../renderer/src/artifact-layout.ts';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const one = read('components/OneThingAtATime.tsx');
const preview = read('components/DocumentPreview.tsx');
const focus = read('components/Focus.tsx');
const kindOpensBig = (path) => opensInTheLargeViewer(viewKind(path));

it('a thread decides with that rule', () => {
  expect(focus).toMatch(/const opensBig = [^\n]*opensInTheLargeViewer\(viewKind\(path\)\)/);
});

it('a note, a page or a script does not open in the large viewer', () => {
  for (const f of ['answers.md', 'designs/w-1/options.html', 'cart.mjs']) expect(kindOpensBig(f), f).toBe(false);
});

it('a picture, a film, a pdf and a deck still do', () => {
  for (const f of ['a.png', 'a.mp4', 'a.pdf', 'a.pptx']) expect(kindOpensBig(f), f).toBe(true);
});

it('a click on a note read in place, or its button, opens it beside', () => {
  expect(focus).toContain("onOpen={() => onOpenArtifact?.(newestOfFamily(path, item.artifacts?.edits), 'beside')} onFullScreen={() => onOpenArtifact?.(newestOfFamily(path, item.artifacts?.edits), 'focus')}");
  expect(one).toMatch(/<DocumentPreview[^>]*onOpen=\{onOpen\}/);
  expect(preview).toContain('Open on the side');
  expect(preview).not.toContain('Open full size');
});

it('full screen is still there, only behind its own corner mark', () => {
  expect(one).toContain('onOpen={onFullScreen ?? onOpen}');
  expect(one).toContain('aria-label="Open full screen"');
  const opens = [...focus.matchAll(/onOpenArtifact\?\.\((?:path|newestOfFamily\(path, item\.artifacts\?\.edits\)), '(beside|focus)'\)/g)].map((m) => m[1]);
  expect(opens.filter((m) => m === 'focus')).toHaveLength(1);
});

it('does not count a missing path as media', () => {
  expect(viewKind(null)).toBeNull();
  expect(kindOpensBig(null)).toBe(false);
});
