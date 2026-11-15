// Native inbox and search notices lacked the website's close button.
// Dismissal must survive reopening without hiding a different warning.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { noticeDismissal } from '../mobile/src/lib/notice-dismissal';

it('shares dismissal, survives reopening, and leaves other warnings visible', () => {
  const saved = new Map();
  const storage = { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
  const notices = noticeDismissal(storage);
  let updates = 0;
  const unsubscribe = notices.subscribe(() => updates++);
  expect(notices.hidden('Offline')).toBe(false);
  notices.dismiss('Offline');
  expect(updates).toBe(1);
  expect(notices.hidden('Offline')).toBe(true);
  expect(notices.hidden('Cannot connect')).toBe(false);
  expect(noticeDismissal(storage).hidden('Offline')).toBe(true);
  unsubscribe();
  notices.dismiss('Cannot connect');
  expect(updates).toBe(1);
});

it('keeps dismissal for this visit if storage fails', () => {
  const notices = noticeDismissal({ getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); } });
  notices.dismiss('Offline');
  expect(notices.hidden('Offline')).toBe(true);
  expect(notices.hidden('Other warning')).toBe(false);
});

it('uses one dismissible native component in inbox and search', () => {
  for (const file of ['index', 'search']) {
    expect(readFileSync(new URL(`../mobile/src/app/${file}.tsx`, import.meta.url), 'utf8')).toContain('<StatusNotice message={c.status} next={c.statusNext} />');
  }
  const component = readFileSync(new URL('../mobile/src/ui/StatusNotice.tsx', import.meta.url), 'utf8');
  expect(component).toContain('accessibilityLabel="Dismiss notice"');
  expect(component).toContain('minWidth: 44');
  expect(component).toContain('minHeight: 44');
});
