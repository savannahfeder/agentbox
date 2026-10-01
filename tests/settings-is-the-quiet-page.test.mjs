// THE QUIET PAGE, AND THE TWO PIECES OF IT THAT ARE NOT PAINT —.
//
// What is worth a test out of that is what a later edit could silently undo:
// the button coming back, the model row going back to printing a value, the
// box losing its edge again, and the height that stops the last line being cut
// in half. The look itself is judged by eye and by
// `scripts/shot-settings-built.mjs`, not here.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('renderer/src/components/Settings.tsx');
const css = read('renderer/src/styles.css');

describe('the instructions are the field, not a button', () => {
  it('has no Edit button anywhere on the settings screen', () => {
    expect(settings).not.toMatch(/>Edit</);
  });

  // The Settings screen itself still has no Edit button. The Instructions page
  // does, since one page of rendered sections with Edit was picked over the
  // always-open boxes (w-4cbcd888ae), and that page is its own file.
  it('opens both workspace files on the page', () => {
    expect(settings).toContain('<InstructionSettings projects={projects}');
    expect(read('renderer/src/components/InstructionSettings.tsx')).toContain('How agents write to you');
  });

  it('names the file under each box, because the box is the file', () => {
    expect(read('main/instruction-settings.mjs')).toContain("rules:'founder.md'");
    // One document since w-3dc46f3a67, where the writing rules and the
    // finishing rules were two boxes and two files.
    expect(read('main/instruction-settings.mjs')).toContain("messages:'message-rules.md'");
  });

  it('saves as she types, with no Apply button between her and the fleet', () => {
    expect(read('renderer/src/components/InstructionSettings.tsx')).toContain('setTimeout(()=>flush(value),400)');
    expect(read('renderer/src/components/InstructionSettings.tsx')).not.toContain('Apply');
  });

  // NEVER EXPLAIN THE UX IN WORDS (w-3dc46f3a67). On the earlier page it was
  // unclear the boxes could be edited, and the fix is to show that visually
  // rather than with text explaining it.
  //
  // Two sentences went, and both were the page describing itself rather than
  // saying anything about the agents: "Saves as you type. Applies to the next
  // agent session" under the text, and "Every section is editable and can be
  // restored to its default" at the top. What tells the user instead is the
  // surface: it is a panel at rest, a deeper one under the pointer, and an
  // accented one with the caret in it while typing (../renderer/src/workspace-navigation).
  it('shows that the page is writable instead of saying so', () => {
    const page = read('renderer/src/components/InstructionSettings.tsx');
    expect(page).not.toContain('Saves as you type');
    expect(page).not.toContain('Every section is editable');
    // The status line is still there for saving, saved, and real errors. Since
    // w-94b3af4e70 it gives the line up to a restore that has just happened,
    // and takes it straight back when a save has something to report.
    expect(page).toContain('className="instruction-save" role="status">');
    expect(page).toContain(': status}</div>');
    // And the caret is in the box the moment it opens for writing.
    expect(page).toContain('box.current?.focus({preventScroll:true})');
    const css = read('renderer/src/workspace-navigation.css');
    expect(css).toMatch(/\.instr-part textarea:hover \{[^}]*background/);
    expect(css).toMatch(/\.instr-part textarea:focus \{[^}]*border-left-color/);
  });

  // ONE SHAPE, AND NOTHING LEFT TO FLIP (w-3dc46f3a67). Option 2, the card, was
  // approved. Three presentations were drawn in the real app for that round and
  // two of them are gone along with the `?shape=` switch that drew them.
  // Anything still switchable here is a decision that would have to be made a
  // second time.
  it('draws the one shape she approved and offers no way back to the others', () => {
    const page = read('renderer/src/components/InstructionSettings.tsx');
    expect(page).not.toContain('instruction-row');
    expect(page).not.toContain('location.search).get');
    const css = read('renderer/src/workspace-navigation.css');
    expect(css).not.toContain('data-shape');
    // Since w-4cbcd888ae the approved shape is one page: one card holding every
    // section, and the writing surface sitting deeper than that card.
    expect(css).toMatch(/\.instr-card \{[^}]*background:var\(--film-strong\)/);
    expect(css).toMatch(/\.instr-part textarea \{[\s\S]*?background:var\(--wash\)/);
  });

  // ⌘K is the way in from everywhere that is not this screen, and the card it
  // opens is the same one the Edit button used to. Taking the button off must
  // not take that door with it.
  it('leaves the standing card reachable from ⌘K', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("{modal === 'standing' && <Standing kind={STANDING}");
    expect(read('renderer/src/components/Palette.tsx')).toContain("id: 'standing'");
  });
});

describe('the box has an edge, and shows whole lines', () => {
  // THE WASH WAS PICKED. Four edges were drawn on the real screen because the
  // boxes looked wrong and seemed to need a border; the wash with a hairline is
  // the one chosen, and the other three are dead. The first build had a wash
  // with NO border, which was the problem, so the hairline is asserted beside
  // the fill.
  // The project's own box that shared this rule is gone: a project's
  // instructions are written on the Instructions page (w-4cbcd888ae).
  it('draws the writing box as a wash with a hairline round it', () => {
    const rule = css.match(/\.set-write textarea \{([^}]*)\}/);
    expect(rule, 'the writing box lost its rule').toBeTruthy();
    expect(rule[1]).toContain('background: var(--wash)');
    expect(rule[1]).toContain('border: 1px solid var(--line-strong)');
  });

  // A textarea clips at its PADDING box, so the bottom padding shows text. A
  // height that is not one top border, one top padding and N whole line boxes
  // slices the last line through the letters, which is what the bug looked like.
  const LINE = 1.72, SIZE = 13, TOP = 15;
  for (const [sel, lines] of [['.set-write textarea', 6]]) {
    it(`${sel} is exactly ${lines} whole lines tall`, () => {
      const m = css.match(new RegExp(`\\${sel} \\{[^}]*min-height: calc\\(([^)]*)\\)`));
      expect(m, `${sel} has no measured min-height`).toBeTruthy();
      expect(m[1].replace(/\s+/g, ' ').trim()).toBe(`${TOP}px + ${lines} * ${LINE} * ${SIZE}px`);
      // The whole point, stated as the arithmetic: the visible text region is a
      // whole number of line boxes, so the cut falls between two lines.
      // min-height, less the two 1px borders and the 13px top padding. What is
      // left is the strip of text that is actually visible, bottom padding and
      // all, and it has to divide by the line box exactly.
      const visible = (TOP + lines * LINE * SIZE) - 2 - 13;
      expect((visible / (LINE * SIZE)).toFixed(6)).toBe(lines.toFixed(6));
    });
  }
});

// THE MODEL IS NOT A CONTROL ON THIS PAGE (w-12081d32cc). It was a row in each
// engine's card, and before that one row on the page. The new task card asks
// which model a run goes out on, keeps the answer between cards, and is now the
// only place the question is asked, so what is left to hold is that this page
// never grows the row back.
describe('the model is not asked on this page', () => {
  it('draws no model row and writes no model setting', () => {
    expect(settings).not.toContain('<div className="set-row-label">Model</div>');
    expect(settings).not.toMatch(/setWorkspace\('model'/);
    expect(settings).not.toMatch(/setWorkspace\('codexModel'/);
    expect(settings).not.toContain("label: 'The CLI default'");
  });

  it('does not print the value any more', () => {
    expect(settings).not.toMatch(/w\.model \?\? 'the CLI default'/);
  });
});

// PAUSING IS A COMMAND, NOT A SETTING (w-12081d32cc). A switch reading "Agents
// are running" sat at the top of the Agents group, and the command palette has
// carried the same switch all along. Stopping the queue is done in the moment,
// which is what the palette is for, and this page is for the few things set
// once. So the row is gone and the command is what has to stay: a page with
// neither would leave nothing anywhere that stops the queue.
describe('the queue is paused from the palette and not from this page', () => {
  it('draws no running switch and writes no running setting', () => {
    expect(settings).not.toContain('<div className="set-row-label">Agents are running</div>');
    expect(settings).not.toMatch(/setWorkspace\('agentsRunning'/);
    expect(settings).not.toMatch(/on=\{w\.agentsRunning\}/);
  });

  it('keeps the pause command in the palette', () => {
    const palette = read('renderer/src/components/Palette.tsx');
    expect(palette).toContain("'Unpause agents' : 'Pause agents'");
  });
});

// AND THE CODING AGENT IS NOT ASKED HERE EITHER (w-12081d32cc). The row was
// drawn only on a Mac with both engines, and the card asks the same question
// where the task is written.
describe('the coding agent is not asked on this page', () => {
  it('draws no coding agent row and writes no engine setting', () => {
    expect(settings).not.toContain('<div className="set-row-label">Coding agent</div>');
    expect(settings).not.toMatch(/setWorkspace\('engine'/);
  });
});
