// 2026-09-18: clear prose should differ from matched glass only in its fill.
// A full-card hit target must never paint a dark hover layer over previews.
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../renderer/src/components/direct-review.css',import.meta.url),'utf8');
it('changes only the clear document background',()=>{
 const rule=css.match(/\[data-text-review="clear"\] \.doc-pane.doc-md \.doc-card \{([^}]+)\}/)[1];
 expect(rule.trim()).toBe('background:transparent;');
});
it('keeps the opening target transparent while hovered or pressed',()=>{
 expect(css).toContain('.direct-review .review-card-hit:is(:hover,:active) {background:none;box-shadow:none;}');
});
it('does not stack dark fills on preview cards or their code inset',()=>{
 expect(css).toContain(':root[data-code-review][data-review-style] .direct-review {background:transparent;}');
 expect(css).toContain(':root[data-code-review][data-review-style] .direct-review .review-inset {background:transparent;box-shadow:none;}');
});
