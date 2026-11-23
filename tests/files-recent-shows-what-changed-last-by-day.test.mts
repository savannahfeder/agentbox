// FILES' RECENT SHOWS WHAT CHANGED LAST, A DAY AT A TIME.
//
// A document made with New outside a folder went under "Not in a folder" at the
// bottom of its project's page, and its maker "just made a new doc and now can't
// find it. 'recents' should be something i should see easily". A project's page,
// and All files, now open with a Recent column on the left: the ten files that
// changed last, under Today, Yesterday or their day. Approved picture:
// r9-2-recent-left-by-day (round 9, Nov 23). Dragging a tile fades it, and the
// folder under it stays lit while the pointer crosses the tiles inside it.
//
// What must NOT happen: a file listed twice, an agent's check picture or another
// project's file in a project's Recent, an older file above a newer one, or a
// day heading split in two.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { homeOf, recentByDay, recentOf, RECENT_MOST, SHOWN_AT_FIRST } from '../renderer/src/files/files-home';

const HOUR = 3_600_000;
const now = new Date(2026, 10, 23, 15, 0).getTime();
const file = (name, over = {}) => ({ key: name, project: 'Agentbox', name, kind: 'markdown', versions: 1, at: now - HOUR, by: null, open: 0, approvedBy: [], sentIn: [], opened: null, folder: null, ...over });
const folder = (id, name, over = {}) => ({ id, project: 'Agentbox', name, parent: null, at: 1, ...over });
const folders = [folder('cus', 'Customers'), folder('calls', 'Calls', { parent: 'cus' }), folder('pin', 'Pinned'), folder('lan', 'Launch', { project: 'Lantern' })];
const files = [
  file('untitled.md', { at: now - 0.1 * HOUR }),
  file('northwind.md', { folder: 'calls', at: now - 2 * HOUR }),
  file('positioning.md', { folder: 'pin', at: now - 3 * HOUR }),
  file('pricing.md', { folder: 'pin', at: now - 26 * HOUR }),
  file('old-plan.md', { at: now - 80 * HOUR }),
  file('page-2026-11-23T10-00-00-000Z.png', { kind: 'image', agent: 'Claude Code', at: now }),
  file('lantern-plan.md', { project: 'Lantern', folder: 'lan', at: now - 0.5 * HOUR }),
];
const names = (rows) => rows.map((r) => r.file.name);

describe('what Recent holds', () => {
  const agentbox = homeOf(files, folders, 'Agentbox');
  it('is the project\'s files newest first, each once, kept or not', () => {
    expect(names(recentOf([agentbox]))).toEqual(['untitled.md', 'northwind.md', 'positioning.md', 'pricing.md', 'old-plan.md']);
  });
  it('knows the folder each file sits in, a subfolder\'s file by its top folder', () => {
    const rows = recentOf([agentbox]);
    expect(rows.map((r) => r.folder?.name ?? null)).toEqual([null, 'Customers', 'Pinned', 'Pinned', null]);
  });
  it('leaves out an agent\'s check picture and another project\'s file', () => {
    const shown = names(recentOf([agentbox]));
    expect(shown).not.toContain('page-2026-11-23T10-00-00-000Z.png');
    expect(shown).not.toContain('lantern-plan.md');
  });
  it('takes every project on All files', () => {
    expect(names(recentOf([agentbox, homeOf(files, folders, 'Lantern')])).slice(0, 2)).toEqual(['untitled.md', 'lantern-plan.md']);
  });
  it('stops at ten', () => {
    const many = Array.from({ length: 14 }, (_, i) => file(`f${i}.md`, { at: now - i * HOUR }));
    expect(recentOf([homeOf(many, [], 'Agentbox')])).toHaveLength(RECENT_MOST);
    expect(RECENT_MOST).toBe(10);
  });
});

describe('its days', () => {
  it('puts each file under Today, Yesterday or its date, in one run each', () => {
    const days = recentByDay(recentOf([homeOf(files, folders, 'Agentbox')]), now);
    expect(days.map((d) => d.day)).toEqual(['Today', 'Yesterday', 'Nov 20']);
    expect(days.map((d) => names(d.rows))).toEqual([['untitled.md', 'northwind.md', 'positioning.md'], ['pricing.md'], ['old-plan.md']]);
  });
  it('is nothing for a project with no files', () => {
    expect(recentByDay([], now)).toEqual([]);
  });
});

describe('the page', () => {
  const tsx = fs.readFileSync(new URL('../renderer/src/files/FilesHome.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/files/files-home.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const place = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
  const rule = (sel) => css.split('}').find((r) => r.trim().startsWith(sel)) ?? '';
  it('draws Recent as a column on the left with a heading and its days', () => {
    expect(tsx).toMatch(/<aside className="fh-rail"/);
    expect(tsx).toMatch(/className="fh-rday"/);
    expect(rule('.fh-split')).toMatch(/grid-template-columns: 232px minmax\(0, 1fr\)/);
  });
  it('sets folders three across beside it, two rows before See all', () => {
    expect(rule('.fh-split .fh-grid')).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
    expect(SHOWN_AT_FIRST).toBe(6);
  });
  it('hands Recent the files of the page it is on, every project on All files', () => {
    expect(place).toMatch(/recentOf\(project \? \[home!?\] : /);
  });
  it('fades a tile while it is carried, and keeps a folder lit as the pointer crosses its tiles', () => {
    expect(rule('.fh-tile.is-dragging .fh-open')).toMatch(/opacity/);
    expect(place).toMatch(/e\.currentTarget\.contains\(e\.relatedTarget\)/);
  });
});
