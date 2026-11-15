// 2026-09-18: icon-only still had a glass button. Bare corners must share
// both enter/exit glyphs while keeping labeled and glass alternatives intact.
import {it,expect} from 'vitest';
import {focusControl} from '../renderer/src/focus-control';
it('uses the same reversible corners for the bare alternative',()=>{
 for(const focused of [false,true]) {
  expect(focusControl('corners-bare',focused)).toEqual(focusControl('corners',focused));
 }
 expect(focusControl('text',false).icon).toBe(null);
 expect(focusControl('layout',false).icon).toBe('layout-enter');
});
