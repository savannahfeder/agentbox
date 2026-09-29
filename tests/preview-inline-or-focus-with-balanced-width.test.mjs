// Sept 15: compare three attachment treatments without a split pane. Balanced
// is settled. Inline must stay inline on laptops, Focus exits to its entry mode.
import {it,expect} from 'vitest';
import fs from 'node:fs';
import {artifactPlacement} from '../renderer/src/artifact-layout';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('keeps Balanced fixed and uses the body for Beside/Focus',()=>{
 const app=read('App.tsx');
 expect(app).not.toContain('aria-label="Conversation width"');
 expect(app).toContain("const readingWidth = 'balanced'");
 expect(app).toContain('<ArtifactSurface target={artifactBody}>');
 expect(app).toContain('artifactReturnBeside');
});
