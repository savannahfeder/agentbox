// FIVE ROWS AND A LINE THAT OPENS THE REST., 2026-08-20.
//
// She was shown three ways of quieting a panel she called "hella cluttered" —
// nineteen rows taking 586 pixels of an 801 pixel sidebar, measured on her own
// store — and she answered: "short list wins, implement it".
//
// So the panel keeps the newest five out and puts one plain line underneath.
// The two she turned down (a drawer that hid the whole section behind its
// heading, and that drawer sitting over this short list) came out of the code
// the same session, and this file is what stops either of them coming back:
// anything still switchable is something she has to decide again, her rule on.
// Their code is kept verbatim in `decisions.md` under 08-20.
//
// WHAT IS STILL TRUE, and what these tests hold, is the thing she actually
// turned down: a section that starts hidden and has to be opened before she can
// see her agents. Hers starts OPEN and closes only when she says so, which is
// the opposite arrangement of the same two states. The mode switch is still
// gone and still never comes back.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rail = fs.readFileSync(path.join(root, 'renderer/src/components/Rail.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const markup = rail.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

// The cut itself, read off the source so the number in her write-up and the
// number in the app can never drift apart.
const SHORT = Number(/const SHORT = (\d+);/.exec(markup)?.[1]);

describe('the panel shows five rows and no more until she asks', () => {
  it('cuts at five', () => {
    expect(SHORT).toBe(5);
  });

  it('slices the list to that cut unless the rest has been opened', () => {
    expect(markup).toMatch(/const list = more \? rows : rows\.slice\(0, SHORT\);/);
    expect(markup).toMatch(/list\.map\(\(r\) =>/);
    expect(markup).not.toMatch(/rows\.map\(\(r\) =>/);
  });

  // TWO STATES, AND ONLY ONE OF THEM IS REMEMBERED, which is the whole
  // difference between them. "Show the rest" is her looking at something once,
  // so it resets; closing the section is her putting it away, so it does not.
  it('opens the rest fresh every time, remembering nothing about it', () => {
    expect(markup).toMatch(/const \[more, setMore\] = useState\(false\);/);
    // Switching product resets it too: the rest she opened on one product is
    // not a state the next product should start in.
    expect(markup).toMatch(/setMore\(false\)/);
    expect(markup).not.toMatch(/localStorage[^;]*more/i);
  });
});

describe('the section closes, and stays closed', () => {
  it('the heading is the control, and it is still the heading', () => {
    expect(markup).toMatch(/className="rail-section-label rail-section-toggle"/);
    expect(markup).toMatch(/<span>Active agents<\/span>/);
    // It keeps the label's own metrics, so a control did not make it louder.
    expect(bare).toMatch(/\.rail-section-toggle\s*\{[^}]*font-size:\s*12\.5px/);
    expect(bare).toMatch(/\.rail-section-toggle\s*\{[^}]*color:\s*var\(--text-faint\)/);
    expect(bare).toMatch(/\.rail-section-toggle\s*\{[^}]*background:\s*none/);
    expect(bare).toMatch(/\.rail-section-toggle\s*\{[^}]*border:\s*0/);
  });

  it('starts open, so nothing of hers is hidden until she hides it', () => {
    // The default is the ABSENCE of a stored flag, read as open. This is the
    // line that keeps her rejected drawer rejected.
    expect(markup).toMatch(/getItem\(CLOSED_KEY\(slug\)\) === '1'/);
    expect(markup).toMatch(/catch \{ return false; \}/);
  });

  it('remembers being closed, per product', () => {
    expect(markup).toMatch(/const CLOSED_KEY = \(slug: string\) => `rail\.agents\.closed\./);
    expect(markup).toMatch(/setItem\(CLOSED_KEY\(slug\), '1'\)/);
    expect(markup).toMatch(/removeItem\(CLOSED_KEY\(slug\)\)/);
    // Read on the first render for the product, not in an effect, or a closed
    // section flashes open on the way to being closed.
    expect(markup).toMatch(/useState\(\(\) => readClosed\(slug\)\)/);
    expect(markup).toMatch(/useEffect\(\(\) => \{ setClosed\(readClosed\(slug\)\)/);
  });

  it('hides the rows and the line, and never the heading', () => {
    expect(markup).toMatch(/\{!closed && list\.map/);
    expect(markup).toMatch(/\{!closed && rows\.length > SHORT/);
    // The heading is outside every closed check, so the section cannot vanish.
    expect(markup).not.toMatch(/!closed &&[\s\S]{0,80}rail-section-toggle/);
  });

  // The caret is drawn, because no character sits right on this baseline at
  // 12.5px, and it turns by a second rule rather than a transition.
  it('the caret turns without animating', () => {
    expect(bare).toMatch(/\.rail-section-caret\s*\{[^}]*transform:\s*rotate\(45deg\)/);
    expect(bare).toMatch(/\.rail-section-caret-closed\s*\{[^}]*transform:\s*rotate\(-45deg\)/);
    expect(bare).not.toMatch(/\.rail-section-caret[^{]*\{[^}]*transition/);
    expect(bare).not.toMatch(/\.rail-section-caret[^{]*\{[^}]*animation/);
  });
});

describe('the line underneath', () => {
  it('says what the click does, both ways round', () => {
    expect(markup).toMatch(/'Show fewer' : 'Show the rest'/);
  });

  it('is only drawn when there is a rest to show', () => {
    expect(markup).toMatch(/rows\.length > SHORT && \(/);
  });

  it('carries no count, because a count on a glance surface is out by her law', () => {
    expect(markup).not.toMatch(/\+\s*\{?rows\.length/);
    expect(markup).not.toMatch(/more\b.*\{rows\.length - SHORT\}/);
    expect(markup).not.toMatch(/\{rows\.length\}/);
  });

  it('is the quietest thing in the section, and lifts only its ink on hover', () => {
    expect(bare).toMatch(/\.rail-more\s*\{[^}]*color:\s*var\(--text-faint\)/);
    expect(bare).toMatch(/\.rail-more\s*\{[^}]*opacity:\s*0\.72/);
    expect(bare).toMatch(/\.rail-more:hover\s*\{\s*opacity:\s*1;\s*\}/);
    expect(bare).not.toMatch(/\.rail-more[^{]*\{[^}]*text-decoration/);
    expect(bare).not.toMatch(/\.rail-more[^{]*\{[^}]*transition/);
  });
});

describe('the two she turned down are gone, not hidden behind a switch', () => {
  it('has no mode switch left in the panel', () => {
    expect(markup).not.toMatch(/RailMode/);
    expect(markup).not.toMatch(/railMode/);
    expect(markup).not.toMatch(/'drawer'|"drawer"/);
    expect(markup).not.toMatch(/'both'|"both"/);
  });

  // The drawer she turned down is the one that STARTS shut. Her toggle starts
  // open, so what this now holds is that no default hides her agents and no
  // second way of drawing the section came back with it.
  it('has no drawer: nothing starts hidden and there is one drawing of the section', () => {
    expect(markup).not.toMatch(/rail-drawer/);
    expect(bare).not.toMatch(/rail-drawer/);
    expect(markup).not.toMatch(/useState\(true\)/);
    expect(markup).not.toMatch(/readClosed\(slug\) \?\? true|\|\| true/);
  });
});
