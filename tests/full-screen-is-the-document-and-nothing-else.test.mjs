// Two rules, and the second one has a trap in it: a sidebar the app collapsed
// by itself is not a preference and must not be written down as one, or a quit
// taken while a document is full screen reopens her app with a sidebar she
// never chose to shut.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');

// THE 40 POINT BAR THIS ONCE ASSERTED IS GONE. It was the right answer to her
// first sentence and the wrong one to her second, the next morning: "all of
// these shots still have the top bar." The bar is 0 now and the marks float
// (full-screen-chrome-and-the-chat-paths.test.mjs owns that). What this test
// still owns is that the NAME never comes back.
it('draws no file name over a full screen document, and takes back the height it used',()=>{
 const css=read('workspace-navigation.css');
 expect(css).toContain('.workspace-layout[data-artifact-layout="focus"]:not(.workspace-settings) .workspace-artifact-header .doc-crumb { display:none; }');
 expect(css).toContain('.workspace-layout[data-artifact-layout="focus"]:not(.workspace-settings) > .topbar {\n  height:0; min-height:0; flex-basis:0;');
 // The crumb is only gone in full screen. Beside a conversation it is still
 // the breadcrumb she approved on.
 expect(css).toContain('.workspace-artifact-header .doc-crumb { font-size:14px; }');
});

// THE SIDEBAR IS ALWAYS NARROW (w-a1ed0e8b25), so full screen has nothing to
// fold on the way in and nothing to put back on the way out, and no sidebar
// preference is written down for a quit to reopen with.
it('leaves the narrow sidebar as it is, and stores no sidebar preference',()=>{
 const app=read('App.tsx');
 expect(app).not.toContain('panelBeforeFullScreen');
 expect(app).not.toContain('powerup.sidebar.collapsed');
 // Full screen is still the mode she picked, not the laid-out view.
 expect(app).toContain("const fullScreenDoc = !!openDoc && artifactMode === 'focus';");
});
