// 2026-09-14: two blur planes, with old saved themes unchanged at zero
// background blur. Clamp unsafe values and keep other themes' settings.
import {expect,it} from 'vitest';
import {resolveTune,storeTune,applyTune} from '../renderer/src/skins.ts';
it('round trips the two blur values independently',()=>{
 const saved=storeTune(null,'lake',{blur:3,backgroundBlur:28,dim:.5});
 expect(resolveTune(saved,'lake')).toEqual({blur:3,backgroundBlur:28,dim:.5});
 expect(resolveTune(saved,'frost-haze').backgroundBlur ?? 0).toBe(0);
});
it.each([[-5,0],[200,80],[null,0],['bad',0]])('bounds background blur %s', (value,wanted)=>{
 expect(resolveTune(JSON.stringify({lake:{backgroundBlur:value}}),'lake').backgroundBlur ?? 0).toBe(wanted);
});
it('paints and resets both layers independently',()=>{
 const props={}; const root={style:{setProperty:(k,v)=>props[k]=v}};
 applyTune({blur:4,backgroundBlur:24,dim:0},root);
 expect(props['--skin-background-blur']).toBe('24px');
 expect(props['--skin-blur']).toBe('4px');
 applyTune({blur:2,dim:0},root);
 expect(props['--skin-background-blur']).toBe('0px');
});
