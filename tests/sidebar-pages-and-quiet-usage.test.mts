// 2026-09-14: two subscriptions must not create two attention-grabbing bars;
// utility pages share the workspace card and selected-state navigation.
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {UsagePill} from '../renderer/src/components/UsagePill';
import {WorkspaceNavigation} from '../renderer/src/components/WorkspaceNavigation';
const reading = {engine:'claude',at:0,limits:[{span:'session',name:'This session',percent:38}]};
it('uses quiet text rather than a permanent meter in the sidebar',()=>{
 const html=renderToStaticMarkup(createElement(UsagePill,{usage:reading,now:0,sidebar:true,engineWord:'Claude Code'}));
 expect(html).toContain('38%'); expect(html).not.toContain('usage-meter');
});
it('keeps the legacy meter outside the sidebar and hides missing readings',()=>{
 expect(renderToStaticMarkup(createElement(UsagePill,{usage:reading,now:0}))).toContain('usage-meter');
 expect(renderToStaticMarkup(createElement(UsagePill,{usage:null,now:0,sidebar:true}))).toBe('');
});
it('selects Instructions instead of Inbox when on its page',()=>{
 const html=renderToStaticMarkup(createElement(WorkspaceNavigation,{view:'inbox',page:'instructions',collapsed:false,onToggle(){},onView(){},onSearch(){},onCompose(){},onInstructions(){}}));
 expect(html.match(/aria-current="page"/g)).toHaveLength(1);
 expect(html).toMatch(/aria-label="Instructions"[^>]*aria-current="page"/);
});
