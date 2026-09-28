// September 15: X in Focus must return the component inline, not dismiss it.
// Inline previews should sit on the conversation without a dark toolbar slab.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
const source=read('components/DocPane.tsx');
it('uses the top-right close control to exit Focus but preserves ordinary closing',()=>{
 expect(source).toContain('onClick={onClose}');
 expect(source).toContain("headerTarget ? 'Exit Focus' : 'Close this document (esc)'");
 expect(source).not.toContain('Back to task');
 expect(source).toContain('aria-label="Expand preview"');
});
it('clears unrelated Focus actions and blends the inline toolbar with the conversation',()=>{
 const css=read('workspace-navigation.css');
 expect(css).toContain('> .topbar > .topbar-right { display:none; }');
 expect(css).toContain('.workspace-layout .inline-artifact .doc-html .doc-head { background:transparent;');
 expect(css).toContain('.workspace-layout .inline-artifact .doc-html .doc-card { background:transparent;');
});
