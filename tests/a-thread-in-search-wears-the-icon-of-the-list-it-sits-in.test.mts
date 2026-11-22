// A THREAD IN ⌘K WEARS THE ICON OF THE LIST IT SITS IN, IN THE SAME INK AS THE REST.
//
// ⌘K drew finished threads at half opacity. Searching "landing" gave five
// finished threads, every one grey, the highlighted one too, and the person
// found the grey confusing. Measured on the built renderer: a finished row's
// icon, words and hint each had opacity 0.5, an open row's 1. Of the designs
// shown next, they picked a tick on finished threads, and said the speech
// bubble every other thread wore was not obvious. The "Go to" rows' tray,
// circled play and clock came next and were turned down as large and round
// beside the tick's few thin lines. Of the line-only sets after that, they
// asked for three kinds only: done, active (Needs you or In progress alike)
// and Later. The mark sat too high, hugging the title of a two-line row, so it
// now sits in the middle of the row. Of the active marks they found the app's
// nine dots the least bad, but too strong, and Later had no mark. So an active
// thread wears nine dots drawn tiny, Later a small "zᶻ".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadResult } from '../renderer/src/palette-rows';
import { ICONS, iconFor } from '../renderer/src/palette-glyphs';

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

const LISTS = ['waiting', 'running', 'scheduled', 'done'] as const;
// Every arc's radius in a drawing: a ring or a clock face has a big one, a dot a small one.
const arcs = (paths: readonly string[]) => paths.flatMap((d) => [...d.matchAll(/a([\d.]+)[ ,]([\d.]+)/g)].map((m) => Number(m[1])));

describe('a thread found by search wears its list’s mark', () => {
  it('Done wears Go to Done’s tick', () => expect(rowIcon('done')).toBe(goTo('view-done')));

  it('Needs you and In progress share the one live mark, which is not the tick', () => {
    expect(rowIcon('waiting')).toBe(rowIcon('running'));
    expect(rowIcon('running')).not.toBe(rowIcon('done'));
    expect(ICONS[rowIcon('running')].length).toBeGreaterThan(0);
  });

  it('Later has a mark of its own, not the active one or the tick', () => {
    expect(ICONS[rowIcon('scheduled')].length).toBeGreaterThan(0);
    expect(rowIcon('scheduled')).not.toBe(rowIcon('running'));
    expect(rowIcon('scheduled')).not.toBe(rowIcon('done'));
  });

  it('the active mark is the nine dots, each no bigger than a pinprick', () => {
    const paths = ICONS[rowIcon('running')];
    expect(paths).toHaveLength(9);
    for (const r of arcs(paths)) expect(r).toBeLessThanOrEqual(0.5);
  });

  it('none is the speech bubble', () => expect(LISTS.map(rowIcon)).not.toContain('thread'));

  it('the other lists are not the Go to rows’ tray, circled play or clock', () => {
    expect(rowIcon('waiting')).not.toBe(goTo('view-inbox'));
    expect(rowIcon('running')).not.toBe(goTo('view-progress'));
    expect(rowIcon('scheduled')).not.toBe(goTo('view-later'));
  });

  it('every mark is open lines or dots, with no ring, box or face', () => {
    for (const state of LISTS) {
      const paths = ICONS[rowIcon(state)];
      expect(paths.some((d) => /z/i.test(d)), state).toBe(false);
      for (const r of arcs(paths)) expect(r, state).toBeLessThanOrEqual(1.2);
    }
  });

  it('the check itself catches the round ones it replaced', () => {
    expect(Math.max(...arcs(ICONS[goTo('view-progress')]))).toBeGreaterThan(1.2);
    expect(Math.max(...arcs(ICONS[goTo('view-later')]))).toBeGreaterThan(1.2);
    expect(ICONS[goTo('view-inbox')].some((d) => /z/i.test(d))).toBe(true);
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

  it('sits the mark of a two-line row in the middle of the row, not up by its title', () => {
    expect(css).toMatch(/\.palette-k :is\(\.palette-found, \.palette-two\) \.palette-glyph \{[^}]*align-self: center/);
  });

  it('hands your threads the tabs’ state, and a teammate’s its card’s', () => {
    expect(app).toMatch(/threadResult\(item, \{[^}]*state: stateOfMine\(item\)/);
    expect(app).toMatch(/hint: `\$\{firstName\([^`]*`,\s*state: card\.state/);
  });
});
