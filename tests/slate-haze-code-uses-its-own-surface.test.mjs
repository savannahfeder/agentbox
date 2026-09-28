// Sept 16: Slate Haze alone inherited white code paper against a dim blue-grey
// workspace. Override only its code ground; other themes and documents keep theirs.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('uses Slate writing surface for code only',()=>{
 const css=read('styles.css');
 const slate=css.match(/:root\[data-skin="slate-haze"\] \{([^}]+)\}/)[1];
 expect(slate).toContain('--code-ground: var(--skin-solid)');
 expect(slate).not.toContain('--doc-page:');
 expect(css).toContain('--code-ground: var(--doc-page)');
});
it('ships Margin left without the alternative design selector',()=>{
 const app=read('App.tsx');
 expect(app).toContain("const previewTreatment = 'margin-left'");
 expect(app).not.toContain('aria-label="Preview treatment"');
 expect(app).toContain('api.isFixtures && new URLSearchParams(location.search).has(\'artifactTweaks\')');
});
