// 2026-09-18: Frost and Slate previews looked like white paper beside tinted
// documents. Keep one shared tint and offer a truly clear text surface only.
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../renderer/src/components/direct-review.css',import.meta.url),'utf8');
it('gives both light picture themes a shared review material',()=>{
 expect(css).toContain('[data-skin="frost-haze"]');
 expect(css).toContain('[data-skin="slate-haze"]');
 expect(css.match(/background:var\(--review-material\)/g)?.length).toBeGreaterThanOrEqual(2);
});
it('limits the fully clear variation to text documents',()=>{
 expect(css).toContain('[data-text-review="clear"] .doc-pane.doc-md .doc-card');
 expect(css).not.toContain('[data-text-review="clear"] .doc-pane.doc-html');
});
