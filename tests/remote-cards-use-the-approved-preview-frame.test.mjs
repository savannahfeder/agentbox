// The remote preview must match the merged artifact card: no solid CTA, no
// oversized badge, and a bounded transparent frame. All three layouts retain
// explicit buttons; clicking the frame itself must never enable remote access.
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync('designs/remote-continuation/RemoteContinuationPreview.css','utf8');
const component=readFileSync('designs/remote-continuation/RemoteContinuationPreview.tsx','utf8');
it('uses the compact approved frame and glass actions',()=>{
 expect(css).toContain('max-width:680px');
 expect(css).toContain('border-radius:3px');
 expect(css).toContain('linear-gradient(180deg');
 expect(css).not.toContain('background:var(--text)');
});
it('keeps layout variants and remote actions explicit',()=>{
 for(const variant of ['.rc-A','.rc-B','.rc-C'])expect(css).toContain(variant);
 expect(component).toContain('Preview only · no remote access enabled');
 expect(component).not.toContain('review-card-hit');
 expect(component).not.toContain('api.');
});
