// 2026-09-14: usage distracted from tasks even as text. Put all subscription
// windows at the top of Settings; cover zero, one, and both providers. That
// half still holds and is the first test here. The file's name is the half that
// did not: the sidebar foot was given a slot of its own on 2026-10-01, which is
// the second test.
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import fs from 'node:fs';
import {UsageOverview} from '../renderer/src/components/UsageOverview';
const reading=engine=>({engine,at:0,limits:[{span:'session',name:'This session',percent:38,resetsAt:3600000}]});
it.each([[],[reading('claude')],[reading('claude'),reading('codex')]].map(readings=>[readings]))('shows exactly the available providers: %j',readings=>{
 const html=renderToStaticMarkup(createElement(UsageOverview,{readings,now:0}));
 expect(html.includes('Claude Code')).toBe(readings.some(r=>r.engine==='claude'));
 expect(html.includes('Codex')).toBe(readings.some(r=>r.engine==='codex'));
 if(!readings.length) {expect(html).toContain('No usage reading yet');expect(html).not.toContain('0%');}
});
// Shortcuts left the sidebar on 2026-09-26 (w-6c5534a58d); it stays reachable
// from ⌘K, which is what the last expectation holds.
//
// AND THE SIDEBAR GOT ITS READING BACK ON 2026-10-01 (w-e731ca9376, then
// w-8415594d19), so this test asked for the opposite of the approved foot. It
// asked nobody, though: it found the element by `'<WorkspaceNavigation '` with
// a trailing space, the props went one per line long before that, so `indexOf`
// was -1, the slice was empty and `not.toContain` passed over nothing. True on
// main too. Hence the length check, because a guard that cannot fail is worse
// than no guard: it reads like one.
//
// What goes in the slot and in what order is
// the-sidebar-keeps-usage-and-instructions-close. This holds that production
// fills it, which nothing did between that approval and w-326fb83c0e.
it('hands the sidebar its usage reading and keeps shortcuts accessible',()=>{
 const app=fs.readFileSync(new URL('../renderer/src/App.tsx',import.meta.url),'utf8');
 const at=/<WorkspaceNavigation[\s>]/.exec(app);
 expect(at).not.toBeNull();
 const nav=app.slice(at.index,app.indexOf('{inFullScreen && !workspaceNavigation ?',at.index));
 expect(nav.length).toBeGreaterThan(100);
 expect(nav).toContain('usage=');
 expect(app).toContain("setSettingsPane('shortcuts')");
});
