// A PROJECT MADE FROM THE NEW THREAD CARD IS THE ONE IT SENDS TO (w-abed8ae491).
//
// A tester opened the card's project menu, chose "+ New project", picked a
// folder, and the toast said the project was made — but the chip on the card
// still read the project they had come from, so the task they were about to
// type would have gone to the wrong repository. They had to open the menu again
// and find the new project at the bottom of the list.
//
// The wire was dropped in the rewrite. The old card took the slug as a prop and
// selected it (`selectProject`, components/Compose.tsx). App.tsx still holds the
// slug — `setPickProject(slug)` runs the moment the project is made — and after
// the card was redrawn as an email nothing read that state back. Measured by
// grep on main, 2026-10-25: one writer, no readers.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');

describe('the slug of a project just made reaches the open card', () => {
  const app = src('App.tsx');
  const card = src('threads', 'ThreadComposer.tsx');

  it('is handed to the card as a prop', () => {
    expect(app).toMatch(/<ThreadComposer[\s\S]{0,4000}?selectProject=\{pickProject\}/);
  });

  it('is what App.tsx sets when the project is made from the card', () => {
    expect(app).toMatch(/setPickProject\(slug\)/);
  });

  it('is let go of when the card closes, so an old pick cannot come back', () => {
    expect(app).toMatch(/setModal\(null\); setComposeInitial\(null\); setPickProject\(null\)/);
  });

  it('is picked by the card, not merely received', () => {
    expect(card).toMatch(/selectProject\?: string \| null/);
    expect(card).toMatch(/if \(selectProject\) pickProject\(selectProject\)/);
  });
});
