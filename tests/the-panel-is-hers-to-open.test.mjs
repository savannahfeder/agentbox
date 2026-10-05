// Updated 2026-09-14: the right project rail is retired; the same toggle now controls left navigation.
// The product panel is a toggle, it is up by default, and its state is ONE
// remembered thing rather than one per screen.
//
// Four separate decisions stack here.
//
// What this file pins now is that shape: one flag, no per-mode split, nothing
// resetting it on the way back to the list, and it outlives the window.
//
// Asserted against the source because this repo has no DOM test environment
// (the reasoning is in shortcuts-swallow-their-key.test.mjs). The invariants
// here are structural, so a structural check is honest about what it proves.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { opensATextField } from '../renderer/src/keys';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const app = read('renderer/src/App.tsx');
const palette = read('renderer/src/components/Palette.tsx');

describe('the app remembers one answer, not one per screen', () => {
  it('holds it in a single flag', () => {
    expect(app).toMatch(/const \[panelUp, setPanelUp\] = useState/);
    // What is DRAWN is that flag and one more fact: whether there is a project
    // behind the panel at all (see the block below). The toggle she presses is
    // still one flag, which is what this file is about.
    // Since w-df42206cea a narrow window can fold it too, which is not her
    // answer and is never stored: `panelShownNow` is the flag plus that fold.
    expect(app).toContain('const workspaceCollapsed = !panelShownNow;');
    expect(app).not.toContain('<Rail');
  });

  it('has no per-mode state left to disagree with itself', () => {
    // The split was the reported bug: hiding it on the list and opening a
    // task put it back, because the two screens each kept their own answer.
    expect(app).not.toMatch(/listRail|focusRail/);
    expect(app).not.toMatch(/inFullScreen \? \w*[Rr]ail/);
  });

  it('never puts it back up behind her', () => {
    // There used to be an effect resetting it every time she left a task. A
    // remembered state and an effect that un-remembers it cannot both be true.
    expect(app).not.toMatch(/setPanelUp\(true\)\s*;?\s*\}?,\s*\[focused/);
    expect(app).toMatch(/NOTHING RESETS THE PANEL/);
  });

  it('outlives the window, because "throughout the app" is not "until you quit"', () => {
    expect(app).toMatch(/const PANEL_KEY = 'zero\.panel'/);
    expect(app).toContain("useState(() => localStorage.getItem('powerup.sidebar.collapsed') !== 'true')");
    expect(app).toMatch(/localStorage\.setItem\(PANEL_KEY, panelUp \? '1' : '0'\)/);
  });

  it('shows the product of the task she is READING, not the row the list left behind', () => {
    // In full screen the list selection and the open task can be two different
    // products, and a panel answering "where is this product" about the wrong
    // one is worse than no panel at all.
    expect(app).toMatch(/const railItem = \(inFullScreen \? focused : current\) \?\? current \?\? null;/);
    expect(app).not.toContain('<Rail');
  });
});

// NO HAIRLINE WITHOUT A SIDEBAR BEHIND IT.
//
// Two things have to go together and that is the whole of this block. Dropping
// the <Rail> alone leaves `panel-up` on the app, and `panel-up` is what pads the
// reading column right to clear a hairline that is no longer there, so the text
// would sit off-centre with nothing beside it.
describe('a panel with no project behind it is not drawn at all', () => {
  it('asks whether the open task even has a project', () => {
    expect(app).toMatch(/const railProduct = snap\?\.products\.find\(\(p\) => p\.slug === railItem\?\.product\) \?\? null;/);
  });

  it('drops the aside and the class together, so nothing shifts under her', () => {
    expect(app).toMatch(/\$\{panelShown \? ' panel-up' : ''\}/);
    expect(app).not.toMatch(/\$\{panelUp \? ' panel-up' : ''\}/);
  });

  it('only in full screen, because in the list it would resize as the cursor moves', () => {
    // `.rail` carries no border outside full screen and the list pane does not
    // reflow around it, so collapsing it there would be an unrequested change
    // and a jumpy one.
    expect(app).toContain('const panelShown = false;');
  });

  it('hands ⌘K the sidebar as drawn, never the retired rail', () => {
    // "Hide the product panel" had to describe her switch, not the retired
    // rail's `panelShown`, which is always false. Since w-df42206cea a narrow
    // window folds the sidebar without touching her switch, and the command
    // must say what pressing it does there: "Expand sidebar" on a folded one.
    expect(app).toMatch(/panelUp=\{panelShownNow\}/);
    expect(app).not.toMatch(/panelUp=\{panelShown\}/);
  });
});

describe('the key', () => {
  it('is \\, handled once for both modes', () => {
    const start = app.indexOf('const onKey = (e: KeyboardEvent)');
    const end = app.indexOf("window.addEventListener('keydown', onKey)");
    const handler = app.slice(start, end);
    expect(handler).toContain("if (e.key === '\\\\') {");
    // Above the branch that returns for an open task, or it would work in the
    // list and do nothing in the one mode it is for.
    expect(handler.indexOf("e.key === '\\\\'")).toBeLessThan(handler.indexOf('if (focused) {'));
    // One implementation, called from everywhere.
    expect(handler).toMatch(/e\.key === '\\\\'\)\s*\{\s*e\.preventDefault\(\);\s*togglePanel\(\);/);
  });

  it('opens no text field, so it has nothing to swallow', () => {
    // Which is why it can sit above every branch without the S problem.
    expect(opensATextField('\\')).toBe(false);
  });
});

// TWO WAYS IN, AND THE CORNER IS NOT ONE OF THEM.
//
// A corner button used to sit left of the plus as "layer one" for a toggle that
// was otherwise keyboard-only. It was taken out: the side panel toggle lives
// only in the ⌘K menu and on its existing shortcut. So the invariant flipped:
// the corner must stay clean, and those two ways must both keep working. Losing
// either one silently would leave the panel with no way in at all, which is why
// they are asserted here rather than assumed.
describe('the ways into the panel are ⌘K and the key, and nothing else', () => {
  it('has no panel button in the top-right corner', () => {
    expect(app).not.toMatch(/PanelIcon/);
    expect(app).not.toMatch(/aria-pressed=\{panelUp\}/);
    // The plus and the cog are the whole of that corner now.
    const topbar = app.slice(app.indexOf('<div className="topbar-right">'), app.indexOf('</header>'));
    expect(topbar).not.toMatch(/togglePanel/);
    expect(topbar).toMatch(/<ComposeIcon \/>/);
    expect(topbar).toMatch(/<SettingsIcon \/>/);
  });

  it('does not leave the icon behind for someone to wire back up', () => {
    expect(fs.existsSync(path.join(root, 'renderer/src/components/PanelIcon.tsx'))).toBe(false);
  });

  it('names it in ⌘K, with its key printed beside it', () => {
    expect(palette).toMatch(/label: panelUp \? 'Collapse sidebar' : 'Expand sidebar'/);
    expect(palette).toMatch(/keyHint: '\\\\'/);
    expect(palette).toMatch(/run: onTogglePanel/);
  });

  it('wires that ⌘K entry to the same toggle the key uses, and closes the palette', () => {
    expect(app).toMatch(/onTogglePanel=\{\(\) => \{ setModal\(null\); togglePanel\(\); \}\}/);
  });
});
