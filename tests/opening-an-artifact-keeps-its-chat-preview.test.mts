// September 16: opening a larger artifact removed its preview from the chat,
// shifting the conversation. All attachments stay put; only the matching
// artifact and actual display mode receive a quiet selected state.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('renders every preview even while one is open',()=>{
 const source=read('components/Focus.tsx');
 expect(source).toContain('previewPaths.map(path =>');
 expect(source).not.toContain('previewPaths.filter(path => path !== openDoc)');
});
it('marks only the matching card as expanded',()=>{
 const source=read('components/Focus.tsx');
 expect(source).toContain('open={openDoc === path}');
 expect(read('components/DirectReview.tsx')).toContain('aria-expanded={open}');
 expect(read('App.tsx')).toContain('artifactView={openDoc ? artifactView : undefined}');
});
