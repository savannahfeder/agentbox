// 2026-09-18: Frost and Slate previews looked like white paper beside tinted
// documents. Keep one shared tint and offer a truly clear text surface only.
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../renderer/src/components/direct-review.css',import.meta.url),'utf8');
// The Frost and Slate case went with those two pictures (w-9e434e8671).
it('limits the fully clear variation to text documents',()=>{
 expect(css).toContain('[data-text-review="clear"] .doc-pane.doc-md .doc-card');
 expect(css).not.toContain('[data-text-review="clear"] .doc-pane.doc-html');
});
