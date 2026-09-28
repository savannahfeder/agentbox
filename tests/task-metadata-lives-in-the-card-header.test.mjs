// 2026-09-14: the task title/byline duplicated the page header, and inline
// sandboxed HTML could swallow R. Reuse the existing live byline via a portal;
// inline embeds are display-only, with their existing open-document controls.
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
const read=f=>readFileSync(new URL('../renderer/src/'+f,import.meta.url),'utf8');
it('moves the existing band instead of copying its metadata',()=>{
 expect(read('components/Focus.tsx')).toContain('headerTarget ? createPortal(<>{backButton}{bandLine}</>, headerTarget) : bandLine');
 expect(read('App.tsx')).toContain('headerTarget={workspaceNavigation ? taskHeader : null}');
});
it('keeps inline previews out of keyboard focus, leaving document controls available',()=>{
 expect(read('components/Focus.tsx')).toContain('tabIndex={-1}');
 expect(read('workspace-navigation.css')).toContain('.focus-pane iframe { pointer-events: none; }');
 expect(read('components/Focus.tsx')).toContain('onOpenDoc');
});
