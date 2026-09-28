// September 15: Focus duplicated the task and artifact headers; wide inline
// previews still inherited the narrow reading column. Keep controls in one header.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('moves only the document header while preserving its editor',()=>{
 expect(read('components/DocPane.tsx')).toContain('headerTarget ? createPortal(documentHeader, headerTarget) : documentHeader');
 expect(read('App.tsx')).toContain("artifactView === 'focus' ? artifactHeader : null");
});
it('offers reading, wide and edge widths without changing inbox rows',()=>{
 expect(read('App.tsx')).not.toContain('aria-label="Conversation width"');
 for(const width of ['wide','edge']) expect(read('workspace-navigation.css')).toContain(`[data-reading-width="${width}"]`);
 expect(read('workspace-navigation.css')).not.toContain("content:'Back'");
});

// A 980px middle column sits between the original 780px and wide 1200px.
it('offers a balanced width and aligns a compact arrow with the title line',()=>{
 expect(read('App.tsx')).toContain("const readingWidth = 'balanced'");
 const css=read('workspace-navigation.css');
 expect(css).toContain('[data-reading-width="balanced"] .focus { max-width:980px; }');
 expect(css).toContain('[data-reading-width="balanced"] .focus-dock-inner { max-width:916px; }');
 expect(css).toContain('left:0; top:0; margin:0; padding:4px;');
});
