// 2026-09-18: two expand arrows suggested the same action. Each proposed
// Focus entrance must have an explicit return label and an inverse glyph.
import {it,expect} from 'vitest';
import {focusControl} from '../renderer/src/focus-control';
it.each(['text','corners','layout'])('pairs the %s entrance with an exit',style=>{
 expect(focusControl(style,false).label).toBe('Focus');
 expect(focusControl(style,true).label).toBe('Exit Focus');
 expect(focusControl(style,true).hint).toContain('Esc');
});
it('offers a genuinely text-only option and distinct inverse icons',()=>{
 expect(focusControl('text',false).icon).toBe(null);
 expect(focusControl('text',true).icon).toBe(null);
 for(const style of ['corners','layout']) expect(focusControl(style,false).icon).not.toBe(focusControl(style,true).icon);
});
