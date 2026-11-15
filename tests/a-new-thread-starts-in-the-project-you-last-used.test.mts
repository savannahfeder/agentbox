// A new thread opened on "Company" every time, though the person had last sent
// to "Lumen app" (Settings > Projects: 01 Company, 02 Launch, 03 Lumen app,
// 04 My Workspace).
//
// The card read the remembered project once, when it was first drawn, and kept
// whatever that found. The box on the page is drawn at boot, before the team's
// projects have arrived, so it found nothing, and from then on the card fell
// back to the first project with the remembered one left out
// (`startingProject(offered, { defaultProduct, remembered: null })` in
// threads/ThreadComposer.tsx). Measured by running that fallback on her four
// projects with `zero.lastProduct` = lumen-app: it answers company.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardProject, projectOnScreen } from '../renderer/src/threads/composer-rules.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const card = fs.readFileSync(path.join(root, 'renderer/src/threads/ThreadComposer.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

const HERS = [
  { slug: 'company' }, { slug: 'launch' }, { slug: 'lumen-app' }, { slug: 'my-workspace' },
];
const on = (offered, o) => cardProject(offered, { picked: null, defaultProduct: null, remembered: null, ...o })?.slug ?? null;

describe('a new thread starts in the project you last used', () => {
  it('opens on the project last sent to, even when the projects arrived after the card was drawn', () => {
    expect(on(HERS, { remembered: 'lumen-app' })).toBe('lumen-app');
  });

  it('keeps a project picked on this card over the remembered one', () => {
    expect(on(HERS, { picked: 'launch', remembered: 'lumen-app' })).toBe('launch');
  });

  it('keeps the project on screen over the remembered one', () => {
    expect(on(HERS, { defaultProduct: 'launch', remembered: 'lumen-app' })).toBe('launch');
  });

  it('falls back to the first project when the remembered one is gone', () => {
    expect(on(HERS, { remembered: 'deleted-project' })).toBe('company');
    expect(on(HERS, {})).toBe('company');
  });

  it('a picked project that is gone gives way to the remembered one, not the first', () => {
    expect(on(HERS, { picked: 'deleted-project', remembered: 'lumen-app' })).toBe('lumen-app');
  });

  // QA batch 011, F-172: N pressed from inside a Leap Year JS thread opened the
  // card on Clamp Num JS, the project last sent to. The open thread is on screen.
  it('opens on the project of the thread you have open, under a filter', () => {
    expect(projectOnScreen({ filter: null, open: { product: 'launch' } })).toBe('launch');
    expect(projectOnScreen({ filter: 'company', open: { product: 'launch' } })).toBe('company');
    expect(projectOnScreen({ filter: null, open: null })).toBe(null);
    expect(on(HERS, { defaultProduct: projectOnScreen({ filter: null, open: { product: 'launch' } }), remembered: 'lumen-app' })).toBe('launch');
    expect(app).toContain('projectOnScreen({ filter: productFilter, open: focused })');
  });

  it('the card reads the remembered project on every draw, not only the first', () => {
    expect(card).toMatch(/cardProject\(offered, \{[^}]*remembered: rememberedProject\(\)/);
    expect(card).not.toMatch(/remembered: null/);
  });
});
