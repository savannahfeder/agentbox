// Orbital's approved background blur is 24px; custom values must still survive switching themes.
import {describe,it,expect} from 'vitest';
import {SKINS,lookMeans,resolveTune,storeTune,TUNE_DEFAULT} from '../renderer/src/skins';
describe('the glass shot themes keep their tuning',()=>{
 it.each(['orbital-glass'])('offers %s as a dark theme',id=>{
 expect(SKINS.some(s=>s.id===id)).toBe(true);
 expect(lookMeans(id)).toEqual({theme:'dark',skin:id});
 expect(TUNE_DEFAULT[id].backgroundBlur).toBe(24);
 });
 it('uses the default background blur for older saved controls without that field',()=>{
 expect(resolveTune(JSON.stringify({'orbital-glass':{blur:30,dim:.3}}),'orbital-glass').backgroundBlur).toBe(24);
 });
 it.each([[-1,0],[30,30],[100,80]])('bounds foreground blur %s to %s',(input,want)=>{expect(resolveTune(storeTune(null,'orbital-glass',{blur:input,dim:.3,panelOpacity:.16}),'orbital-glass').blur).toBe(want)});
 it('keeps both sets of adjustments when switching backgrounds',()=>{
 const a={blur:30,backgroundBlur:0,dim:.3,panelOpacity:.16};
 const b={blur:12,backgroundBlur:0,dim:.04,panelOpacity:.22};
 const stored=storeTune(storeTune(null,'orbital-glass',a),'peach-haze-2',b);
 expect(resolveTune(stored,'orbital-glass')).toEqual(a);
 expect(resolveTune(stored,'peach-haze-2')).toEqual(b);
 expect(SKINS.some(s=>s.id==='blue-hour')).toBe(false);
 });
});
