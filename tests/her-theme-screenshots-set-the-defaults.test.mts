// 2026-09-14: seven explicit screenshots, foreground/background/darkness.
// Unpictured Haze and Ice defaults and saved personal overrides must stay intact.
import {expect,it} from 'vitest';
import {TUNE_DEFAULT,resolveTune} from '../renderer/src/skins.ts';
it.each([['lake',8,5,.63],['pixel-ridge',4,6,.77],['pixel-orbit',0,5,.20],['woodblock-sea',4,12,.84],['riso-hills',2,3,.85],['gouache-valley',4,5,.75],['watercolour-mist',2,4,.85]])('%s follows her screenshot',(id,blur,backgroundBlur,dim)=>expect(TUNE_DEFAULT[id]).toEqual({blur,backgroundBlur,dim}));
it('leaves unpictured themes and saved overrides alone',()=>{
 expect(TUNE_DEFAULT.ice).toEqual({blur:2,dim:.85});
 expect(TUNE_DEFAULT['frost-haze']).toEqual({blur:2,dim:0});
 expect(resolveTune(JSON.stringify({lake:{blur:1,backgroundBlur:40,dim:.4}}),'lake')).toEqual({blur:1,backgroundBlur:40,dim:.4});
});
