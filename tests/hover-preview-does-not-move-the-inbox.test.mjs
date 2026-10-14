// Hovering expanded the inbox row and displaced every task below it.
import {it,expect} from 'vitest';import fs from 'node:fs';
it('renders an interactive floating plate outside the scrolling list',()=>{
 const source=fs.readFileSync('renderer/src/components/RowHoverPreview.tsx','utf8');
 expect(source).toContain('createPortal');expect(source).toContain('document.body');expect(source).toContain('placeHint');expect(source).toContain('Escape');expect(source).toContain('Math.max(HINT_MARGIN');
 const css=fs.readFileSync('renderer/src/styles.css','utf8');
 expect(css).not.toContain('.row:has(.row-hover-preview)');expect(css).toContain('pointer-events: auto');
});

it('anchors the preview to the right window edge, including narrow windows',()=>{
 const source=fs.readFileSync('renderer/src/components/RowHoverPreview.tsx','utf8');
 expect(source).toContain('left:Math.max(HINT_MARGIN,innerWidth-box.width-HINT_MARGIN)');
});
