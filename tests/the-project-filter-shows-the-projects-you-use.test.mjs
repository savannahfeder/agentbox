// FORTY PROJECTS IS A WALL OF CHIPS, SO THE FILTER SHOWS THE EIGHT IN USE.
//
// Measured on a store with about forty projects (2026-10-01): the Display menu
// drew 37 project chips in nine rows, taller than the rest of the menu put
// together, every one the same size as the project actually open.
//
// So: the projects with the most recent threads first, eight of them, and
// "Show all 40" underneath. And an explicit "All projects" choice that is lit
// when nothing is picked, because "nothing selected means everything" was
// otherwise something to discover by clicking a chip and watching the list grow.
//
// A PICKED PROJECT IS NEVER BEHIND "SHOW ALL". One can be picked, the menu
// closed, and opened an hour later; a chip that is on and out of sight is the
// same silent filter this work item exists to stop.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectChoices } from '../renderer/src/threads/page-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const pages = src('threads', 'Pages.tsx');

const NOW = Date.UTC(2026, 9, 1, 17);
const MIN = 60_000;
const product = (slug, extra = {}) => ({ slug, name: slug[0].toUpperCase() + slug.slice(1), dir: `/tmp/${slug}`, oneLiner: '', repoPath: null, team: null, ...extra });
// Forty, the way her store has them.
const forty = Array.from({ length: 40 }, (_, i) => product(`p${String(i).padStart(2, '0')}`));
const thread = (slug, ago) => ({ id: `w-${slug}-${ago}`, product: slug, updatedAt: NOW - ago * MIN, agent: false });
const slugs = (list) => list.map((p) => p.slug);

describe('which projects the menu shows', () => {
  it('shows eight, and says how many are left', () => {
    const items = forty.map((p, i) => thread(p.slug, i));
    const { shown, rest } = projectChoices(forty, items, {});
    expect(shown.length).toBe(8);
    expect(rest.length).toBe(32);
  });

  it('puts the ones she used most recently first', () => {
    const items = [thread('p30', 1), thread('p07', 5), thread('p00', 900)];
    const { shown } = projectChoices(forty, items, {});
    expect(slugs(shown).slice(0, 3)).toEqual(['p30', 'p07', 'p00']);
  });

  it('counts the newest thread in a project, not the oldest', () => {
    const items = [thread('p05', 4000), thread('p05', 2), thread('p09', 60)];
    const { shown } = projectChoices(forty, items, {});
    expect(slugs(shown).slice(0, 2)).toEqual(['p05', 'p09']);
  });

  it('sends a project with no threads at all to the end, by name', () => {
    const three = [product('zulu'), product('alpha'), product('mike')];
    const { shown } = projectChoices(three, [thread('mike', 3)], {});
    expect(slugs(shown)).toEqual(['mike', 'alpha', 'zulu']);
  });

  it('keeps a picked project in sight however old it is', () => {
    const items = forty.filter((p) => p.slug !== 'p39').map((p, i) => thread(p.slug, i));
    const { shown, rest } = projectChoices(forty, items, { picked: ['p39'] });
    expect(slugs(shown)[0]).toBe('p39');
    expect(slugs(rest)).not.toContain('p39');
  });

  it('shows more than eight rather than hide a ninth picked one', () => {
    const picked = slugs(forty.slice(0, 9));
    const { shown } = projectChoices(forty, [], { picked });
    expect(shown.length).toBe(9);
    for (const p of picked) expect(slugs(shown)).toContain(p);
  });

  it('leaves out a message record and the practice project, as the menu always has', () => {
    const list = [product('northwind'), product('dm', { team: { direct: true, projectId: 'c', teamId: 't', visibility: 'team', people: [] } }), product('demo', { practice: true })];
    expect(slugs(projectChoices(list, [], {}).shown)).toEqual(['northwind']);
  });

  it('ignores an agent\'s own row when ranking, the way every list does', () => {
    const { shown } = projectChoices([product('alpha'), product('bravo')], [
      { id: 'a1', product: 'bravo', updatedAt: NOW, agent: { id: 'a' } },
      thread('alpha', 90),
    ], {});
    expect(slugs(shown)).toEqual(['alpha', 'bravo']);
  });
});

describe('the menu it draws', () => {
  const block = pages.slice(pages.indexOf("{page === 'inbox' &&"), pages.indexOf("<div className=\"line\"><span className=\"lab\">Updated"));

  it('offers All projects, lit when nothing is picked', () => {
    expect(block).toContain('All projects');
    expect(block).toContain('display.projects.length === 0');
  });

  it('opens the rest behind one button that says how many there are', () => {
    expect(block).toMatch(/Show all \$\{/);
    expect(block).toContain('showAll');
  });

  it('keeps the approved look: square chips, no em dash', () => {
    expect(block).not.toContain('—');
    expect(block).not.toMatch(/border-radius|borderRadius/);
  });
});
