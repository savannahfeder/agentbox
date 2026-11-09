// 2026-09-18: entering Focus moved the toggle and removed X. Keep toggle,
// external-open, and X in that order; icon-only retains accessible labels.
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {focusControl} from '../renderer/src/focus-control';
it('keeps labeled corners as baseline and adds the same glyph without text',()=>{
 for(const focused of [false,true]) {
  expect(focusControl('corners-icon',focused).icon).toBe(focusControl('corners',focused).icon);
  expect(focusControl('corners-icon',focused).label).toBe(focused?'Exit Focus':'Focus');
 }
});
it('renders X independently of the Focus control',()=>{
 const source=readFileSync(new URL('../renderer/src/components/DocPane.tsx',import.meta.url),'utf8');
 expect(source).not.toContain('{headerTarget && focusControlStyle ? <FocusControl');
 expect(source).toContain('focused={!!headerTarget}');
});
