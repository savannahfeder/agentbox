// Sept 15: Excerpt won; compare quieter captions and preview-only controls.
// Hover-only actions must also appear for keyboard focus and touch devices.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('reveals preview-only actions for pointer, keyboard, and touch',()=>{
 const css=read('workspace-navigation.css');
 expect(css).toContain('.artifact-entry-card:hover .artifact-entry-actions');
 expect(css).toContain('.artifact-entry-card:focus-within .artifact-entry-actions');
 expect(css).toContain('@media (hover:none)');
 expect(css).toContain('data-preview-treatment="preview-only"');
});
