// 2026-09-14: usage distracted from tasks even as text. Put all subscription
// windows at the top of Settings; cover zero, one, and both providers.
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
// from ⌘K, which is what the second expectation holds.
it('keeps usage out of the production sidebar and keeps shortcuts accessible',()=>{
 const app=fs.readFileSync(new URL('../renderer/src/App.tsx',import.meta.url),'utf8');
 const nav=app.slice(app.indexOf('<WorkspaceNavigation '),app.indexOf('{inFullScreen && !workspaceNavigation ?',app.indexOf('<WorkspaceNavigation ')));
 expect(nav).not.toContain('usage=');
 expect(app).toContain("setSettingsPane('shortcuts')");
});
