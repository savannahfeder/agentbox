// 2026-09-18: Focus was larger/heavier than external-open and X.
// All three lab controls share a 20-unit canvas, 16px size and 1.4 stroke;
// labeled alternatives retain their glass button treatment.
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('shares glyph geometry between Focus and its neighboring actions',()=>{
 expect(read('components/FocusControl.tsx')).toContain('<ArtifactControlGlyph>');
 expect(read('components/DocPane.tsx')).toContain('<ArtifactControlGlyph kind="open"/>');
 expect(read('components/DocPane.tsx')).toContain('<ArtifactControlGlyph kind="close"/>');
});
