// September 15: compare a small artifact entry card with explicit viewing
// choices, retaining the inline alternative rather than replacing it globally.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('opens the compact card beside the task and leaves Focus to the viewer',()=>{
 const s=read('components/Focus.tsx');
 expect(s).toContain("onOpenArtifact?.(path, 'beside')");
 expect(s).toContain('<DirectReview');
 expect(read('components/DocPane.tsx')).toContain("onMode('focus')");
});
it('retains a selectable inline entry and wires both viewing modes',()=>{
 const app=read('App.tsx');
 expect(app).not.toContain('aria-label="Preview entry"');
 expect(app).toContain('setArtifactMode(mode); setOpenDoc({product: focused.product, src});');
});
