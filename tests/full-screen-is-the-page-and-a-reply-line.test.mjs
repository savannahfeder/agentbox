// FULL SCREEN, AS SHE APPROVED IT —, 2026-09-21.
//
// So: no title, no bar, the marks floating and fading, and the composer under
// the page. The traps worth a test are the ones that fail SILENTLY and still
// look plausible on screen.
import {it,expect} from 'vitest';
import fs from 'node:fs';
import { chromeIsUp, CHROME_HOLD, CHROME_REACH } from '../renderer/src/full-screen-chrome.ts';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
const FOCUS='.workspace-layout[data-artifact-layout="focus"]:not(.workspace-settings)';

it('keeps the marks up while she is reaching for them, and lets them go after',()=>{
 expect(chromeIsUp({reaching:false,awake:false})).toBe(false);
 expect(chromeIsUp({reaching:false,awake:true})).toBe(true);
 // The hand on its way to a mark must never have it fade out from under it.
 expect(chromeIsUp({reaching:true,awake:false})).toBe(true);
 expect(CHROME_HOLD).toBeGreaterThan(1000);
 expect(CHROME_REACH.width).toBeGreaterThanOrEqual(120);
});

it('gives the bar no height in full screen and floats the marks instead',()=>{
 const css=read('workspace-navigation.css');
 expect(css).toContain(`${FOCUS} > .topbar {\n  height:0; min-height:0; flex-basis:0;`);
 expect(css).toMatch(/\.workspace-artifact-header \.doc-marks \{[^}]*position:fixed/);
 expect(css).toMatch(/\.workspace-artifact-header \.doc-marks \{[^}]*opacity:0/);
});

// THE ONE THAT FAILED SILENTLY. The rule that shows the marks has to out-weigh
// the rule that hides them, and the hiding one carries [data-artifact-layout]
// and a :not. A shorter selector is simply ignored: `data-chrome` said "up"
// and the measured opacity stayed 0.
it('shows the marks with a selector heavy enough to beat the one that hides them',()=>{
 const css=read('workspace-navigation.css');
 const show='.workspace-layout[data-artifact-layout="focus"][data-chrome="up"]:not(.workspace-settings) .workspace-artifact-header .doc-marks';
 expect(css).toContain(show);
 const weigh=(s)=>(s.match(/[.[:]/g)??[]).length;
 const hide=`${FOCUS} .workspace-artifact-header .doc-marks`;
 expect(weigh(show)).toBeGreaterThan(weigh(hide));
});

// The reply line draws no conversation of its own. The pane is already mounted
// with the real thread and the real composer; full screen shows its dock and
// hides everything above it. Anything rendering a second composer here would
// be the fault this whole round was about.
it('shows the dock of the pane that is already there, and nothing new',()=>{
 const css=read('workspace-navigation.css');
 expect(css).toContain(`${FOCUS} > .body > .list-pane .focus-scroll { display:none; }`);
 expect(css).toContain(`${FOCUS} > .body { flex-direction:column; gap:0; }`);
 expect(read('App.tsx')).not.toContain('className="chat-pill"');
});

// `order`. The conversation is FIRST in the document because in every other
// layout it is the left or the only pane; turning the body into a column
// without this puts the reply line ABOVE the page, which is what it did.
it('puts the reply line under the page and not over it',()=>{
 const css=read('workspace-navigation.css');
 expect(css).toContain(`${FOCUS} > .body > .doc-pane { order:1;`);
 expect(css).toContain(`${FOCUS} > .body > .list-pane {\n  order:2;`);
});

// THE HALF FOLD LASTED ONE DAY. It started the strip collapsed in full screen,
// which drew a heading with no options under it.So the whole strip is gone
// until she opens the box.
it('shows no strip at all under a full screen document until the box is open',()=>{
 const focus=read('components/Focus.tsx');
 expect(focus).toContain("const stripShown = showOptions && (artifactView !== 'focus' || replyOpen);");
 expect(focus).toContain('{stripShown && (');
 // `showOptions` itself must not be narrowed: it also decides whether the
 // options list is stripped out of the message text, so a full screen row
 // would otherwise print its own options twice.
 expect(focus).toContain('const showOptions = offerIsLive(item);');
 // And the chevron is back to plain: no full screen special case in the state.
 expect(focus).toContain('const [optsOpen, setOptsOpen] = useState(true);');
});

it('folds the box back when she clicks away, in full screen only',()=>{
 const app=read('App.tsx');
 expect(app).toContain("if (!fullScreenDoc || modal !== 'reply') return;");
 expect(app).toContain("if (at?.closest?.('.focus-dock')) return;");
 // A click INTO the page is a blur of this window that leaves the frame
 // focused. A bare window blur would also fire when she switches applications.
 expect(app).toContain("if ((document.activeElement as HTMLElement | null)?.tagName === 'IFRAME') foldBack();");
 expect(app).toContain("window.addEventListener('blur', intoThePage);");
});

// HER APPROVAL CLOSED THE OPTION SET. The other three paths and the switch
// that chose between them are deleted; anything still switchable is something
// she has to decide twice.
it('keeps no way to switch back to the three paths she did not pick',()=>{
 expect(fs.existsSync(new URL('../renderer/src/chat-path.ts',import.meta.url))).toBe(false);
 const app=read('App.tsx');
 for (const gone of ['chatPath','chatOpen','CHAT_PATH_SUMMONED','data-chat-path']) {
  expect(app.includes(gone), `${gone} survived the pick`).toBe(false);
 }
 expect(read('workspace-navigation.css')).not.toContain('[data-chat-path=');
});

// EVERY ONE OF THE THREE MARKS WAS DEAD FOR A DAY.
//
// The reach was at z-index 7 and the marks at 8, which looks right and is not:
// `.topbar` is `position:relative; z-index:1`, so it opens a stacking context
// and the marks' 8 is spent inside it. Against the reach, in the root context,
// the whole bar is worth 1. Measured with elementFromPoint at the centre of
// each mark: `div.chrome-reach` all three times.
it('leaves the three marks on top of the reach that wakes them',()=>{
 const css=read('workspace-navigation.css');
 const reach=css.match(/\.chrome-reach \{[^}]*\}/)[0];
 const z=Number(reach.match(/z-index:(\d+)/)[1]);
 const bar=css.match(/\.workspace-layout > \.topbar \{[^}]*\}/)[0];
 const barZ=Number(bar.match(/z-index:\s*(\d+)/)[1]);
 // The comparison that matters is against the BAR, not against the marks: the
 // marks cannot out-rank the context they are drawn inside.
 expect(z, 'the reach must not out-rank the bar the marks live in').toBeLessThanOrEqual(barZ);
 // And it still has to lie over the document, which is positioned with an
 // automatic z-index, so it cannot go to 0 or be dropped.
 expect(z).toBeGreaterThan(0);
});

// Reaching is read off where the pointer IS, not off enter and leave handlers
// on the reach. Those handlers were the reason the reach had to lie over the
// marks at all, which is what broke them.
it('reads reaching off the pointer target so the reach can sit underneath',()=>{
 const app=read('App.tsx');
 expect(app).toContain("setChromeReaching(!!(e.target as HTMLElement | null)?.closest?.('.doc-marks, .chrome-reach'));");
 expect(app).not.toContain('onMouseEnter={() => setChromeReaching(true)}');
});

// THE ONE THAT ACTUALLY KILLED THEM, and it is invisible to every harness we
// have. `.workspace-layout::after` is a strip of `-webkit-app-region: drag`
// across the top of the window, and a drag region swallows a press: macOS
// moves the window instead of handing the click to the page. The marks sat
// inside it at top:11 and were dead for three rounds. `-webkit-app-region`
// does not exist in Chrome, so they hit-tested and pressed perfectly in the
// Chrome harness the whole time.
//
// The rule is geometric, so this test is arithmetic: whatever the strip's
// height, the marks start below it.
it('keeps the marks clear of the window drag strip',()=>{
 const css=read('workspace-navigation.css');
 const strip=css.match(/\.workspace-layout::after \{[^}]*\}/)[0];
 expect(strip).toContain('-webkit-app-region: drag');
 const stripBottom=Number(strip.match(/height:\s*(\d+)px/)[1]);
 const marks=css.match(/\.workspace-artifact-header \.doc-marks \{[^}]*\}/)[0];
 const marksTop=Number(marks.match(/top:(\d+)px/)[1]);
 expect(marksTop, `the marks start at ${marksTop} and the drag strip runs to ${stripBottom}`)
   .toBeGreaterThanOrEqual(stripBottom);
});

// The corner that wakes them has to reach as far down as they now sit, or
// there is a band she can put the pointer in that shows her nothing.
it('reaches far enough down to cover where the marks now are',()=>{
 const css=read('workspace-navigation.css');
 const marks=css.match(/\.workspace-artifact-header \.doc-marks \{[^}]*\}/)[0];
 const marksTop=Number(marks.match(/top:(\d+)px/)[1]);
 expect(CHROME_REACH.height).toBeGreaterThan(marksTop);
});
