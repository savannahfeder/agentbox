// September 15: the selected interface is a preview card with Beside or Focus.
// Closing either viewer returns to the card, never a full inline document.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('has exactly two viewer modes with beside as the default',()=>{
 expect(read('artifact-layout.ts')).toContain("export type ArtifactMode = 'beside' | 'focus'");
 expect(read('App.tsx')).toContain("useState<ArtifactMode>('beside')");
 expect(read('App.tsx')).not.toContain('aria-label="Preview entry"');
 expect(read('App.tsx')).not.toContain("artifactView === 'inline'");
});
it('exits Focus and opens the compact card beside',()=>{
 expect(read('components/DocPane.tsx')).toContain("title={headerTarget ? 'Exit Focus' : 'Close this document (esc)'} onClick={onClose}");
 expect(read('components/Focus.tsx')).toContain("onOpenArtifact?.(path, 'beside')");
 expect(read('components/DocPane.tsx')).toContain("onMode('focus')");
 expect(read('components/Focus.tsx')).not.toContain('previewCard ?');
});
