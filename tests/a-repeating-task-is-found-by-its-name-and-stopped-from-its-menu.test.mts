// A REPEATING TASK IS FOUND BY ITS NAME, AND STOPPED FROM ITS THREAD'S MENU.
//
// On thread w-bb9005d535a1 the person was told to find a daily task and press
// Stop repeating. Typing its name into search listed its runs, every one under
// the same title, and never the task itself, so they opened a different one;
// and once the task was open nothing on screen offered to stop it. Measured on
// the built renderer with a made-up inbox: search for a task with three runs
// drew three identical rows, and the run's three-dot menu held Open terminal
// and Rename. Stop repeating was only behind the hidden summary's Repeats
// value and in ⌘K by its name.
//
// The cases: the task found by every word of its name in any case, with its
// runs folded into it; a run whose task did not match stays; a task in another
// product keeps that product's runs apart; nothing typed finds no task; and
// the three-dot menu offers Stop repeating only on a run of a live task.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { repeatsFound, withoutRunsOf } from '../renderer/src/repeat-search.ts';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';

const rule = (id: string, title: string, product = 'shop') => ({ id, title, product, every: 'day', at: '22:00', createdAt: 0, served: '', misses: 0, alerted: 0 });
const run = (id: string, ruleId: string | null, product = 'shop') => ({ id, product, labels: ruleId ? ['founder', `repeat:${ruleId}`] : ['founder'] });

describe('finding a repeating task by its name', () => {
  const rules = [rule('r-1', 'Nightly price check'), rule('r-2', 'Monday sales summary'), rule('r-3', 'Nightly price check', 'mobile')];

  it('finds the task by every word of its name, in any case and order', () => {
    expect(repeatsFound(rules, 'nightly PRICE').map((r) => r.id)).toEqual(['r-1', 'r-3']);
    expect(repeatsFound(rules, 'check nightly').map((r) => r.id)).toEqual(['r-1', 'r-3']);
    expect(repeatsFound(rules, 'sales').map((r) => r.id)).toEqual(['r-2']);
  });

  it('finds nothing for words the name does not hold, or for nothing typed', () => {
    expect(repeatsFound(rules, 'nightly backup')).toEqual([]);
    expect(repeatsFound(rules, '   ')).toEqual([]);
  });

  it('folds the runs of a found task into it and keeps every other thread', () => {
    const found = [rules[0]];
    const threads = [run('w-a', 'r-1'), run('w-b', 'r-1'), run('w-c', 'r-2'), run('w-d', null), run('w-e', 'r-1', 'mobile')];
    expect(withoutRunsOf(threads, found).map((t) => t.id)).toEqual(['w-c', 'w-d', 'w-e']);
  });

  it('is what the search box lists, ahead of the threads', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const finder = app.slice(app.indexOf('const findThreads = useCallback'), app.indexOf('const goToStop'));
    expect(finder).toMatch(/repeatsFound\(repeats, q\)/);
    expect(finder).toMatch(/withoutRunsOf\(/);
    expect(finder.indexOf('repeatsFound')).toBeLessThan(finder.indexOf('searchThreads'));
  });
});

describe('stopping it from its thread', () => {
  const base = { change: false, terminal: 'closed' as const, finish: false };

  it('offers Stop repeating on a run of a live repeating task', () => {
    const rows = threadMenuRows({ ...base, stopRepeat: true });
    expect(rows.map((r) => r.label)).toContain('Stop repeating');
  });

  it('offers nothing of the kind on any other thread', () => {
    expect(threadMenuRows(base).map((r) => r.id)).not.toContain('stop-repeat');
  });

  it('is handed the task\'s own stop on the thread page', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toMatch(/onStopRepeating=\{repeat \? repeat\.onEnd : null\}/);
  });
});
