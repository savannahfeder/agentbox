// September 16: compare three unobtrusive design toolbars. The preview must
// keep its full height, and keyboard/touch users must still reach the controls.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('offers the three hover treatments and the current header for comparison',()=>{
 const app=read('App.tsx');
 for(const label of ['Floating bar','Corner controls','Top edge','Always visible']) expect(app).toContain(label);
 expect(app).toContain('data-design-toolbar=');
});
it('overlays only beside HTML controls and reveals them for keyboard and touch',()=>{
 const css=read('workspace-navigation.css');
 expect(css).toContain('[data-design-toolbar="floating"][data-artifact-layout="beside"] .doc-html .doc-head');
 expect(css).toContain('.doc-card:focus-within > .doc-head');
 expect(css).toContain('@media (hover:none)');
 expect(css).toContain('design-hover-toolbar');
});
it('uses the approved corner controls outside the fixture exploration too',()=>{
 const app=read('App.tsx');
 expect(app).toContain("useState('corner')");
 expect(app).toContain("data-design-toolbar={toolbarExploration ? designToolbar : 'corner'}");
});
