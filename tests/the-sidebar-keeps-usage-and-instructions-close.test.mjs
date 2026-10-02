// 2026-09-14: move usage and frequently used settings to the sidebar footer.
// Check expanded/collapsed access, one usage slot, and no placeholder actions.
//
// The foot was redrawn on 2026-10-01 and the promise held. approved 2026-10-01
// (w-e731ca9376, then w-8415594d19): the foot is Invite people when signed in
// to a team, then Instructions and Settings, then the usage slot, then the
// signed-in person beside the collapse toggle. The Done place that used to sit
// down here left the sidebar that day; it is the Done tab on the Inbox page now
// (StateTabs in renderer/src/threads/Pages.tsx).
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {WorkspaceNavigation} from '../renderer/src/components/WorkspaceNavigation';
it.each([false,true])('keeps utility actions accessible, collapsed=%s',collapsed=>{
 const html=renderToStaticMarkup(createElement(WorkspaceNavigation,{view:'inbox',collapsed,onToggle(){},onView(){},onSearch(){},onCompose(){},onSettings(){},onInstructions(){},usage:createElement('div',{'data-usage':'live'})}));
 const foot=html.slice(html.indexOf('workspace-bottom'));
 for(const label of ['Settings','Instructions']) expect(foot).toContain(`aria-label="${label}"`);
 // No Shortcuts row since 2026-09-26 (w-6c5534a58d).
 expect(html).not.toContain('aria-label="Keyboard shortcuts"');
 // No Done place in the sidebar since 2026-10-01; see the note at the top.
 expect(html).not.toContain('data-tab="done"');
 expect(html.match(/data-usage=/g)).toHaveLength(1);
 // Instructions and Settings, then usage, then the person and the toggle.
 expect(foot.indexOf('workspace-utilities')).toBeGreaterThan(-1);
 expect(foot.indexOf('workspace-utilities')).toBeLessThan(foot.indexOf('data-usage='));
 expect(foot.indexOf('data-usage=')).toBeLessThan(foot.indexOf('class="th-me"'));
});
it('does not offer unconnected utility actions',()=>{
 const html=renderToStaticMarkup(createElement(WorkspaceNavigation,{view:'inbox',collapsed:false,onToggle(){},onView(){},onSearch(){},onCompose(){}}));
 expect(html).not.toContain('aria-label="Instructions"');
 expect(html).not.toContain('aria-label="Settings"');
 expect(html).not.toContain('class="workspace-usage"');
});
