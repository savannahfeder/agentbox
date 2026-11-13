// 2026-09-14: restore the quiet divider above New task after removing usage.
// The separator belongs to the footer, so it survives expanded and icon layouts.
import {expect,it} from 'vitest';
import fs from 'node:fs';
it('separates utilities from New task with the shared subtle line',()=>{
 const css=fs.readFileSync(new URL('../renderer/src/workspace-navigation.css',import.meta.url),'utf8');
 const footer=css.match(/\.workspace-bottom \.workspace-footer \{([^}]+)\}/)[1];
 expect(footer).toContain('border-top: 1px solid var(--line)');
 expect(footer).toContain('padding-top: 12px');
});
