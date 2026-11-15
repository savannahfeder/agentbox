// Sept 16: Compact/Margin win. Beside must preserve readable panes, falling
// back to Focus below 1000px; Margin alternatives must remove framing.
import {it,expect} from 'vitest';
import fs from 'node:fs';
import {artifactPlacement} from '../renderer/src/artifact-layout';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('opens beside at the boundary and focuses below it',()=>{
 expect(artifactPlacement('beside',999)).toBe('focus');
 expect(artifactPlacement('beside',1000)).toBe('beside');
 expect(artifactPlacement('beside',1600)).toBe('beside');
 expect(artifactPlacement('focus',1600)).toBe('focus');
});
it('keeps the compact card in the conversation without inline expansion',()=>{
 const app=read('App.tsx');
 expect(app).toContain("const previewTreatment = 'margin-left'");
 expect(app).not.toContain('aria-label="Preview treatment"');
 expect(read('components/Focus.tsx')).toContain("onOpenArtifact?.(path, 'beside')");
 expect(read('components/Focus.tsx')).not.toContain('Expand inline');
});
