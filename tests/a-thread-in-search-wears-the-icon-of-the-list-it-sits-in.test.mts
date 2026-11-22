// A THREAD IN ⌘K WEARS THE ICON OF THE LIST IT SITS IN, IN THE SAME INK AS THE REST.
//
// ⌘K drew finished threads at half opacity. Searching "landing" gave five
// finished threads, every one grey, the highlighted one too, and the person
// found the grey confusing. Measured on the built renderer: a finished row's
// icon, words and hint each had opacity 0.5, an open row's 1. Of the designs
// shown next, they picked a tick on finished threads, and said the speech
// bubble every other thread wore was not obvious. So each found thread now
// wears the icon ⌘K's own "Go to" row draws for its list: Inbox, In progress,
// Later or Done, the tick being Done's.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadResult } from '../renderer/src/palette-rows';
import { iconFor } from '../renderer/src/palette-glyphs';

const NOW = new Date(2026, 10, 22, 12, 0).getTime();
const min = 60_000;
const thread = (more: Record<string, unknown> = {}) => ({
  id: 'w-1', product: 'web', title: 'Landing page UI fixes', status: 'open', labels: [],
  createdAt: NOW - 30 * min, updatedAt: NOW - 5 * min, ...more,
});
const found = (more: Record<string, unknown> = {}, state: 'waiting' | 'running' | 'scheduled' | 'done' | null = null) =>
  threadResult(thread(more), { summary: '', project: 'Agentbox Team', now: NOW, state });
const goTo = (id: string) => iconFor({ id, label: '' });
const rowIcon = (state: 'waiting' | 'running' | 'scheduled' | 'done') => iconFor({ id: 'thread-web-w-1', label: 'Landing page UI fixes', state });

describe('a thread found by search wears its list’s icon', () => {
  it('Done wears Go to Done’s tick', () => expect(rowIcon('done')).toBe(goTo('view-done')));
  it('Needs you wears Go to Inbox’s', () => expect(rowIcon('waiting')).toBe(goTo('view-inbox')));
  it('In progress wears Go to In progress’s', () => expect(rowIcon('running')).toBe(goTo('view-progress')));
  it('Later wears Go to Later’s', () => expect(rowIcon('scheduled')).toBe(goTo('view-later')));

  it('no two lists share an icon, and none is the speech bubble', () => {
    const icons = (['waiting', 'running', 'scheduled', 'done'] as const).map(rowIcon);
    expect(new Set(icons).size).toBe(4);
    expect(icons).not.toContain('thread');
  });

  it('a row with no list, such as a repeating task, keeps its own icon', () => {
    expect(iconFor({ id: 'thread-repeat-web-r-1', label: 'Weekly report' })).toBe('thread');
  });
});

describe('which list a found thread is in', () => {
  it('is the one the tabs put it in', () => {
    expect(found({}, 'running').state).toBe('running');
    expect(found({ status: 'done' }, 'done').state).toBe('done');
  });

  it('is worked out from the thread when no tab holds it', () => {
    expect(found({ status: 'done' }).state).toBe('done');
    expect(found({ status: 'open', result: 'Five headlines are ready.' }).state).toBe('waiting');
    expect(found({ status: 'open', runAt: NOW + 60 * min }).state).toBe('scheduled');
  });

  it('is said by the icon alone, not by a word in the hint', () => {
    expect(found({ status: 'done' }, 'done').hint).toBe('Agentbox Team · 5 min');
  });
});

describe('⌘K draws every row in the same ink', () => {
  const palette = fs.readFileSync(new URL('../renderer/src/components/Palette.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
  const phone = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

  it('gives a finished row no class or rule of its own', () => {
    expect(palette.includes('palette-done')).toBe(false);
    for (const sheet of [css, phone]) expect(sheet.includes('palette-done')).toBe(false);
  });

  it('hands your threads the tabs’ state, and a teammate’s its card’s', () => {
    expect(app).toMatch(/threadResult\(item, \{[^}]*state: stateOfMine\(item\)/);
    expect(app).toMatch(/hint: `\$\{firstName\([^`]*`,\s*state: card\.state/);
  });
});
