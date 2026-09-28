// THE FOOT OF THE READING PANE, AFTER SHE PICKED —.
//
// AND THEN SHE PICKED THE HAIRLINE TOO, 2026-08-28, having been shown both:
// "Option 2: Drop the line and merge it." So Tidy is the pane, the three
// keystroke buttons are off it, and there is no rule anywhere in the foot. The
// `?foot=` flag and `renderer/src/foot-look.ts` are deleted, because an option
// still switchable after she has picked is an option she has to pick again.
//
// The load-bearing tests here are the last two: nothing that carries a key may
// sit in that row any more, and neither of the two verbs she loses a button for
// may lose its mouse route as well. The second one is, and it is the reason
// those buttons existed at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer', 'src', 'styles.css'), 'utf8');
const focus = fs.readFileSync(path.join(root, 'renderer', 'src', 'components', 'Focus.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer', 'src', 'App.tsx'), 'utf8');

describe('the message just stops, because she dropped the line', () => {
  it('draws no rule over the foot', () => {
    expect(css).not.toContain('.attached-hairline');
    expect(focus).not.toContain('attached-hairline');
  });

  it('has no flag left to switch it back on', () => {
    // Rule 6: the loser comes out of the code in the same session she picks.
    expect(fs.existsSync(path.join(root, 'renderer', 'src', 'foot-look.ts'))).toBe(false);
    expect(focus).not.toContain('foot-look');
    expect(focus).not.toContain('footLook');
    expect(focus).not.toContain("get('foot')");
  });
});

// AND THEN THE CHIPS THEMSELVES WENT, w-38d7d32c88, 2026-09-23. Her words:
// "If I upload images, I can scroll up in chat to see them. If the agent
// returns images, it returns them in the chat as it currently does and I can
// scroll to see. Same with files/previews. These components at the bottom,
// these rectangular tags for files, is confusing, takes up space and is
// unecessary." Tidy was a smaller row; this is no row.
describe('no row of file tags under the message', () => {
  it('has no chip left to draw, in the pane or the stylesheet', () => {
    expect(focus).not.toContain('<Attached');
    expect(focus).not.toContain('function Attached(');
    expect(focus).not.toContain('attached-file');
    expect(css).not.toMatch(/\n\.attached[ .{]/);
    expect(css).not.toContain('.af-name');
    expect(css).not.toContain('.af-mark');
    expect(css).not.toContain('.af-open');
  });

  it('keeps the two doors a file still has', () => {
    // A path a worker names is drawn or linked WHERE IT IS NAMED, and a design
    // or a markdown document still frames under the message. Those are the
    // drawings she says she can already scroll to.
    expect(focus).toContain('remarkArtifactPaths');
    expect(focus).toContain('className="artifact-entry-list"');
  });

  it('never draws the document a third time under the message', () => {
    // A link in the paragraph, a lit chip, and a line saying it is open on the
    // right: one path, three drawings, 34px, measured on.
    expect(focus).toContain('if (isOpen) return null;');
  });
});

describe('the shortcuts are off the screen and the verbs are not', () => {
  it('leaves no button in that row carrying a key', () => {
    // The comments in that row still quote her sentence, so the walk is over
    // the BUTTONS rather than the text: `onResolve` and `onSnooze` were the
    // two handlers, and <b>E</b>/<b>S</b> were the only key captions in the app.
    const row = focus.slice(focus.indexOf('<div className="focus-actions">'), focus.indexOf('focus-dock'));
    expect(row).not.toMatch(/onClick=\{onResolve\}/);
    expect(row).not.toMatch(/onClick=\{onSnooze\}/);
    expect(row).not.toMatch(/onClick=\{onClose\}/);
    expect(row).not.toMatch(/<b>[A-Z]<\/b>/);
  });

  it('keeps the buttons she did NOT name, because she has not decided those', () => {
    // Undecided is not the same as removed.
    const row = focus.slice(focus.indexOf('<div className="focus-actions">'), focus.indexOf('focus-dock'));
    expect(row).toContain('back to inbox');
    expect(row).toContain('let it run now');
    expect(row).toContain('take me to it');
    expect(row).toContain('stop this task');
    expect(row).toContain('send back to agent');
  });

  it('does not draw an empty row on a finished task', () => {
    // On the screen she photographed none of the remaining buttons apply, and a
    // bar with a rule over it and nothing in it is the 51px she asked to lose.
    const guard = focus.slice(focus.lastIndexOf('{((', focus.indexOf('<div className="focus-actions">')), focus.indexOf('<div className="focus-actions">'));
    expect(guard).toContain('(scheduledUntil ?? 0) > 0 && !!onUnschedule');
    expect(guard).toContain('!!agent && !agentTakesReply && !!onReveal');
    expect(guard).toContain('stoppable');
    expect(guard).toContain("item.status === 'blocked'");
  });

  it('costs her no way to close a task or put one off', () => {
    // THE ONE THAT MATTERS. Both verbs keep a mouse route in the palette, and
    // both keys still work. If this ever fails is back.
    expect(app).toContain("label: target.agent ? 'Close This' : 'Close This Task'");
    expect(app).toContain("label: 'Remind Me (Snooze)'");
    expect(app).toContain('onResolve={() => markDone(focused)}');
  });
});
