// September 16: design frames were white between resolving the file and iframe
// load. Cover thumbnails, the full viewer, and non-HTML loading placeholders.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('keeps both frame sizes hidden until their own load event',()=>{
 for(const file of ['DocPane','ArtifactThumbnail']) {
  const s=read(`components/${file}.tsx`);
  expect(s).toContain('onLoad={revealFrame}');
  expect(s).toContain('opacity:frameReady ?');
  // The pane keys its reveal on the frame, not the bare address, so a local
  // app that comes back up starts hidden again (local-preview.ts).
  expect(s).toMatch(/usePreviewReveal\((url|frameKey)\)/);
 }
});
it('shows a quiet status while resolving and never uses empty loading placeholders',()=>{
 const s=read('components/DocPane.tsx');
 expect(s).toContain('<PreviewLoading />');
 expect(s).not.toContain('<div className="doc-missing" />');
 expect(read('components/PreviewLoading.tsx')).toContain('role="status"');
});
// There are no attachment chips left to de-duplicate against a preview: that
// row is deleted (w-38d7d32c88, 2026-09-23). The frame is what is under the
// message now, and it is the only thing there.
it('draws the preview frame with no chip beside it',()=>{
 const s=read('components/Focus.tsx');
 expect(s).toContain('className="artifact-entry-list"');
 expect(s).not.toContain('<Attached');
});
it('uses a theme-matched skeleton at both sizes without visible loading copy',()=>{
 const s=read('components/PreviewLoading.tsx');
 expect(s).toContain('aria-label="Loading preview"');
 expect(s).toContain('preview-skeleton');
 expect(s).not.toContain('Loading preview…');
 const css=read('workspace-navigation.css');
 expect(css).toContain('.artifact-thumbnail .preview-skeleton');
 expect(css).toContain('.preview-skeleton-line');
 expect(css).toContain('prefers-reduced-motion:reduce');
});
