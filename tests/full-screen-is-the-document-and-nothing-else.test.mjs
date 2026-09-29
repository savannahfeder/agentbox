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

it('collapses the sidebar on the way in and puts it back on the way out',()=>{
 const app=read('App.tsx');
 expect(app).toContain('const panelBeforeFullScreen = useRef<boolean | null>(null);');
 // It watches the mode she picked, not the laid-out view, so a narrow window
 // cannot collapse her sidebar on its own.
 expect(app).toContain("if (!!openDoc && artifactMode === 'focus') {");
 expect(app).toContain('}, [openDoc, artifactMode]);');
 expect(app).toContain('panelBeforeFullScreen.current = true;');
 expect(app).toContain('setPanelUp(back);');
});

it('never writes an automatic collapse down as her preference',()=>{
 const app=read('App.tsx');
 const persist=app.slice(app.indexOf('const [panelUp, setPanelUp]'),app.indexOf('const togglePanel'));
 expect(persist).toContain('if (panelBeforeFullScreen.current !== null) return;');
 expect(persist).toContain("localStorage.setItem('powerup.sidebar.collapsed', String(!panelUp));");
});
