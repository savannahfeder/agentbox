// The screenshot selected background 2: keep its stable key and saved tuning
// while renaming it, retiring background 1, and publishing her chosen defaults.
import {it,expect} from 'vitest';
import {SKINS,LOOKS,TUNE_DEFAULT,normalizeSavedLook,resolveTune} from '../renderer/src/skins.ts';
it('keeps only the winning image, named Peach Haze, in the middle',()=>{
 expect(SKINS.filter(s=>s.name.startsWith('Peach'))).toEqual([{id:'peach-haze-2',name:'Peach Haze',note:'A diagonal peach glow across a sage and mauve wash.',light:true}]);
 // One further down since Ember Grid moved to the front (w-2ff620f13b).
 expect(LOOKS[7].id).toBe('peach-haze-2');
});
it('ships the four settings shown in her screenshot',()=>{
 expect(TUNE_DEFAULT['peach-haze-2']).toEqual({blur:0,backgroundBlur:0,dim:.35,panelOpacity:.2});
});
it('preserves the winning selection and its saved adjustments',()=>{
 const m=new Map([['zero.theme','light'],['zero.skin','peach-haze-2'],['zero.skin.tune','{"peach-haze-2":{"blur":0,"backgroundBlur":0,"dim":0.35,"panelOpacity":0.2}}']]);
 normalizeSavedLook({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)});
 expect(m.get('zero.skin')).toBe('peach-haze-2');
 expect(resolveTune(m.get('zero.skin.tune'),'peach-haze-2')).toEqual(TUNE_DEFAULT['peach-haze-2']);
});
it('moves the removed background to the winner without changing other choices',()=>{
 for(const [before,after] of [['peach-haze','peach-haze-2'],['lake','lake'],['none','none']]){
 const m=new Map([['zero.theme','light'],['zero.skin',before]]);
 normalizeSavedLook({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)});
 expect(m.get('zero.skin')).toBe(after);
 }
});
