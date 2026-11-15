// 2026-09-18: Focus looked flat beside the approved textured expand control.
// Both controls must share the material so their gradient and edge cannot drift.
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
it('shares the expand-button material with the viewer Focus control',()=>{
 const css=readFileSync(new URL('../renderer/src/components/direct-review.css',import.meta.url),'utf8');
 expect(css).toContain('.direct-review .review-open,\n:root[data-code-review] .workspace-layout .doc-pane .artifact-expand {background:linear-gradient');
});
