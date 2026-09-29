// 2026-09-14: Slate Haze's muted text disappeared into its blue-gray ground.
// Check secondary text on the unglazed sidebar and metadata on the glass.
import {expect,it} from 'vitest';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../renderer/src/styles.css',import.meta.url),'utf8');
const block=css.match(/:root\[data-skin="slate-haze"\] \{([^}]+)\}/)[1];
const token=name=>block.match(new RegExp(`--${name}: (#[0-9a-f]+);`))[1];
const lum=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
it('keeps muted sidebar text readable on the blue-gray ground',()=>expect(contrast(token('text-faint'),token('bg'))).toBeGreaterThanOrEqual(4.5));
it('keeps metadata readable on the foreground glass',()=>expect(contrast(token('agent-ink'),token('skin-solid'))).toBeGreaterThanOrEqual(4.5));
it('keeps supporting text readable at a darker edge of the backdrop',()=>expect(contrast(token('text-dim'),'#8794a2')).toBeGreaterThanOrEqual(4.5));
