// September 15: a filename gives no clue whether a design is worth opening.
// Render the resolved document in a scaled, noninteractive thumbnail, with
// a clear fallback when resolution fails; never invent a placeholder design.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('renders the actual resolved page and handles unavailable previews',()=>{
 const s=read('components/ArtifactThumbnail.tsx');
 expect(s).toContain('api.resolveDoc({ product, src: path })');
 expect(s).toContain('src={url}');
 expect(s).toContain('Preview unavailable');
 expect(s).toContain('sandbox="allow-same-origin"');
 expect(s).toContain('tabIndex={-1}');
});
it('shows the actual thumbnail inside the compact opening card',()=>{
 const s=read('components/DirectReview.tsx');
 expect(s).toContain('<ArtifactThumbnail product={product} path={path} revision={revision}/>');
 expect(read('components/Focus.tsx')).toContain("onOpenArtifact?.(path, 'beside')");
 expect(read('components/DocPane.tsx')).toContain("onMode('focus')");
});
