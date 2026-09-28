// 2026-09-14: move usage and frequently used settings to the sidebar footer.
// Check expanded/collapsed access, one usage slot, and no placeholder actions.
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {WorkspaceNavigation} from '../renderer/src/components/WorkspaceNavigation';
it.each([false,true])('keeps utility actions accessible, collapsed=%s',collapsed=>{
 const html=renderToStaticMarkup(createElement(WorkspaceNavigation,{view:'inbox',collapsed,onToggle(){},onView(){},onSearch(){},onCompose(){},onSettings(){},onInstructions(){},usage:createElement('div',{'data-usage':'live'})}));
 for(const label of ['Settings','Instructions','Closed']) expect(html).toContain(`aria-label="${label}"`);
 // No Shortcuts row since 2026-09-26 (w-6c5534a58d).
 expect(html).not.toContain('aria-label="Keyboard shortcuts"');
 expect(html.match(/data-usage=/g)).toHaveLength(1);
 expect(html.indexOf('workspace-utilities')).toBeLessThan(html.indexOf('workspace-footer'));
});
it('does not offer unconnected utility actions',()=>{
 const html=renderToStaticMarkup(createElement(WorkspaceNavigation,{view:'inbox',collapsed:false,onToggle(){},onView(){},onSearch(){},onCompose(){}}));
 expect(html).not.toContain('aria-label="Instructions"');
});
