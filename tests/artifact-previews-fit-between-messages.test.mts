// Sept 15: the 360px design plus footer dominated chat; code/notes had no
// preview at all. All three types must use the same compact entry footprint.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('previews code and notes using their actual content, not an iframe',()=>{
 const s=read('components/ArtifactThumbnail.tsx');
 expect(s).toContain("kind === 'code'"); expect(s).toContain('api.codeChange');
 expect(s).toContain("kind === 'markdown'"); expect(s).toContain('api.readDoc');
 expect(s).toContain('slice(0, 5)');
});
it('keeps previews compact and samples in the conversation until opened',()=>{
 expect(read('workspace-navigation.css')).toContain('grid-template-columns: 180px minmax(0, 1fr)');
 expect(read('App.tsx')).toContain('setArtifactPreviewSample(e.target.value)');
 expect(read('components/Focus.tsx')).toContain('previewSample');
});
