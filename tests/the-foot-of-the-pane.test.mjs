// THE FOOT OF THE READING PANE, AFTER THE PICK.
//
// AND THEN THE HAIRLINE WAS PICKED TOO, with both shown: option 2, drop the
// line. So Tidy is the pane, the three keystroke buttons are off it, and there
// is no rule anywhere in the foot. The `?foot=` flag and
// `renderer/src/foot-look.ts` are deleted, because an option still switchable
// after a pick is an option that has to be picked again.
//
// The load-bearing tests here are the last two: nothing that carries a key may
// sit in that row any more, and neither of the two verbs that lost a button
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
    // Rule 6: the loser comes out of the code in the same session as the pick.
    expect(fs.existsSync(path.join(root, 'renderer', 'src', 'foot-look.ts'))).toBe(false);
    expect(focus).not.toContain('foot-look');
    expect(focus).not.toContain('footLook');
    expect(focus).not.toContain("get('foot')");
  });
});

// AND THEN THE CHIPS THEMSELVES WENT, w-38d7d32c88. Uploaded images, images an
// agent returns, files and previews are all visible by scrolling the chat, so a
// row of rectangular file tags at the bottom is confusing, takes up space and
// adds nothing. Tidy was a smaller row; this is no row.
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
    // drawings the chat can already be scrolled to.
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
    // The comments in that row still quote the old captions, so the walk is over
    // the BUTTONS rather than the text: `onResolve` and `onSnooze` were the
    // two handlers, and <b>E</b>/<b>S</b> were the only key captions in the app.
    const row = focus.slice(focus.indexOf('<div className="focus-actions">'), focus.indexOf('focus-dock'));
    expect(row).not.toMatch(/onClick=\{onResolve\}/);
    expect(row).not.toMatch(/onClick=\{onSnooze\}/);
    expect(row).not.toMatch(/onClick=\{onClose\}/);
    expect(row).not.toMatch(/<b>[A-Z]<\/b>/);
  });

  it('keeps the buttons she did NOT name, because she has not decided those', () => {
    // In-progress tasks still need ways back to the inbox, and whether these
    // buttons are the best way to present them is undecided. Undecided is not
    // the same as removed.
    //
    // THE STOP IS NO LONGER ONE OF THEM (w-581dbc6cc4). Most apps put the stop
    // in the chat message, so it is on the reply card now, and the three tests
    // below hold it there.
    const row = focus.slice(focus.indexOf('<div className="focus-actions">'), focus.indexOf('focus-dock'));
    expect(row).toContain('back to inbox');
    expect(row).toContain('let it run now');
    expect(row).toContain('take me to it');
    expect(row).toContain('send back to agent');
  });

  it('does not draw an empty row on a finished task', () => {
    // On a finished task none of the remaining buttons apply, and a bar with a
    // rule over it and nothing in it is 51px of nothing.
    const guard = focus.slice(focus.lastIndexOf('{((', focus.indexOf('<div className="focus-actions">')), focus.indexOf('<div className="focus-actions">'));
    expect(guard).toContain('(scheduledUntil ?? 0) > 0 && !!onUnschedule');
    expect(guard).toContain('!!agent && !agentTakesReply && !!onReveal');
    expect(guard).toContain("item.status === 'blocked'");
    // And an In progress task no longer opens this row by itself, because the
    // one button it used to open it for has moved to the dock.
    expect(guard).not.toMatch(/\|\|\s*stoppable/);
  });

  it('costs her no way to close a task or put one off', () => {
    // THE ONE THAT MATTERS. Both verbs keep a mouse route in the palette, and
    // both keys still work. If this ever fails, w-617a55c276 is back.
    // The palette label follows the round's word now (w-581dbc6cc4), so this
    // checks the row still exists rather than what it is called.
    expect(app).toContain("id: 'done'");
    expect(app).toContain('DONE.verb} Task');
    expect(app).toContain("label: 'Remind Me (Snooze)'");
    expect(app).toContain('onResolve={() => markDone(focused)}');
  });
});

// THE STOP IS ON THE REPLY CARD AND CLOSING HAS A CONTROL (w-581dbc6cc4). The
// drawings that kept the verb under the conversation were rejected as poorly
// placed; most apps put the stop in the chat message. And closing a task must
// not depend on knowing the E shortcut.
describe('the stop is the send slot while the box is empty', () => {
  // THE MODEL, instead of a stop that sat on the box all the time: clicking
  // into the box shows a send control, and the stop appears there. Typing
  // anything turns it back into send, the way Codex works.
  it('puts the stop in the send slot and gives it back the moment she types', () => {
    expect(focus).toContain('{stop && !hasDraft ? stop : (');
    expect(focus).toContain('const stopButton = stoppable ?');
    expect(focus.match(/className="dock-stop"/g)).toHaveLength(1);
  });

  it('puts no STOP on the folded box, which is what she turned down', () => {
    // The folded pill carried the stop for one round and she turned it down:
    // the stop belongs in the slot that appears when she clicks in. One of the
    // seven Done placements does wrap that pill in a row, so this is about the
    // stop and not about the row.
    // It reaches the card as the composer's `stop` prop and nowhere else.
    const dock = focus.slice(focus.indexOf('className="focus-dock"'));
    expect(dock.match(/stopButton/g)).toHaveLength(1);
    expect(dock).toContain('stop={stopButton} />');
    expect(focus).toContain('{stop && !hasDraft ? stop : (');
  });

  it('keeps the promise the old label carried, in the toast', () => {
    expect(app).toContain('Agent stopped. Back in your inbox. Reply to redirect it.');
  });

  it('has no stop on the agent live line and no stop look left', () => {
    // Both were drawn in the round before this one and neither survived it.
    expect(fs.existsSync(path.join(root, 'renderer', 'src', 'stop-look.ts'))).toBe(false);
    expect(focus).not.toContain('stopOnLive');
    expect(css).not.toContain('.live-stop');
    expect(css).not.toContain('.verb-menu');
  });
});

// FINISHING A TASK: THE MARK THAT WAS PICKED (w-581dbc6cc4). Eight rounds of options are written up in decisions.md;
// what is left in the code is one button.
describe('the Done mark she picked', () => {
  const word = fs.readFileSync(path.join(root, 'renderer', 'src', 'done-word.ts'), 'utf8');

  it('has no switch left anywhere', () => {
    // Rule 6: an option still switchable after a pick is an option that has
    // to be picked again. `foot-look.ts` and `stop-look.ts` went the same way.
    expect(fs.existsSync(path.join(root, 'renderer', 'src', 'done-look.ts'))).toBe(false);
    for (const f of [focus, app, css]) expect(f).not.toContain('done-look');
    expect(focus).not.toContain('doneMark(');
    expect(css).not.toContain('.dm-');
  });

  it('draws two ticks and nothing else', () => {
    expect(focus).toContain('<path d="m3 13 3.6 3.6L13.4 9" />');
    expect(focus).toContain('<path d="m10.6 13 3.6 3.6L21 9" />');
    expect(focus.match(/className="icon-btn done-mark"/g)).toHaveLength(1);
  });

  it("is the terminal's own component, not a copy of its colour", () => {
    // It matches the colour of its neighbour, the terminal control. Sharing the class is what stops the two
    // drifting, and the stroke has to match too, because a heavier one reads as
    // a darker mark at this size.
    expect(focus).toMatch(/className="icon-btn done-mark"[\s\S]{0,900}strokeWidth="1.1"/);
    expect(css).toContain('.done-mark { order: 1; flex: 0 0 auto; margin-left: 4px; }');
  });

  it('sits last in the corner row, by order rather than by markup', () => {
    expect(focus).toContain('{canFinish && cornerHeaderTarget && createPortal(doneButton, cornerHeaderTarget)}');
    expect(css).toMatch(/\.done-mark \{[^}]*order: 1/s);
  });

  it('offers nothing to finish on a task that is already finished', () => {
    expect(focus).toContain("const canFinish = item.status !== 'done';");
  });

  it('names the verb once, and every surface reads that one', () => {
    const rules = fs.readFileSync(path.join(root, 'renderer', 'src', 'list-rules.ts'), 'utf8');
    const nav = fs.readFileSync(path.join(root, 'renderer', 'src', 'components', 'WorkspaceNavigation.tsx'), 'utf8');
    expect(word).toContain("export const DONE = { verb: 'Done', short: 'Done', noun: 'Done' };");
    expect(rules).toContain("{ key: 'E', word: DONE.short }");
    expect(nav).toContain('doneNoun: DONE.noun');
    expect(app).toContain('DONE.verb} Task');
    expect(app).toContain('workspacePageTitle(view, DONE.noun)');
    expect(focus).toContain('aria-label={DONE.verb}');
  });
});


// THE CORNER ROW AND THE LINE UNDER IT NEED AIR BETWEEN THEM (w-581dbc6cc4).
// The corner marks sat almost on top of the code figures under them; only a
// few pixels, but enough to make the whole corner look wrong.
//
// Measured at 2103 by 1183 before the change: the marks end at y=88 and the
// figures begin at y=90.
describe('the corner marks do not land on the code figures', () => {
  const nav = fs.readFileSync(path.join(root, 'renderer', 'src', 'workspace-navigation.css'), 'utf8');

  it('drops the figures without moving the title', () => {
    // The bar is a fixed 88 and the header is centred inside it, so growing the
    // header alone moves the TITLE, which is what the marks are aligned to.
    expect(nav).toContain('.workspace-layout.workspace-task .workspace-task-header { align-self: flex-start; margin-top: 18px; }');
    expect(nav).toContain('.workspace-layout.workspace-task .workspace-task-header .keep-line > .focus-meta > .change-figures { transform: translateY(8px); }');
  });

  // w-299ee43d2e, 2026-09-28: dropping the whole line pushed the words on the
  // left away from the title too, and the left was spaced right before. The
  // line keeps its old 7; only the figures move.
  it('leaves the words under her title where they were before the figures moved', () => {
    expect(nav).not.toMatch(/\.keep-line > \.focus-meta \{ margin-top: 15px/);
    const styles = fs.readFileSync(path.join(root, 'renderer', 'src', 'styles.css'), 'utf8');
    expect(styles).toContain('.keep-line > .focus-meta { margin-top: 7px; }');
  });

  it('moves the header with a margin, so the back chevron comes too', () => {
    // The chevron is absolute against the header with `top: 0`. Padding leaves
    // it behind at the bar's top edge, measured 18 points adrift of the title.
    expect(nav).toContain('.workspace-task-header > .back-esc {\n position:absolute; left:0; top:0;');
    expect(nav).not.toMatch(/\.workspace-task-header \{ align-self: flex-start; padding-top/);
  });

  it('leaves the bar its fixed height, so nothing else on the screen moves', () => {
    expect(nav).toContain('.workspace-layout.workspace-task > .topbar { height: 88px; min-height: 88px; flex-basis: 88px; }');
  });
});

// THE CORNER ON A TASK IS THE TASK'S (w-581dbc6cc4). The '+' and ⌘K buttons
// are not needed on a task page; they stay on the plain inbox list page.
describe('the corner carries the task on a task and the app on a list', () => {
  it('draws neither the plus nor the palette mark while a task is open', () => {
    expect(app).toContain('const taskOpen = workspaceNavigation && !!focused && !settingsOpen;');
    expect(app).toMatch(/\{!taskOpen && <button[\s\S]{0,200}aria-label="New thread"/);
    expect(app).toMatch(/\{!taskOpen && <button[\s\S]{0,200}aria-label="Commands"/);
  });

  it('costs neither verb a route she already has', () => {
    // The sidebar carries New task on every screen including a task's, its own
    // key opens it, ⌘K opens the palette, and both marks are untouched on the
    // lists. The key itself is not this test's business and has changed once.
    const nav = fs.readFileSync(path.join(root, 'renderer', 'src', 'components', 'WorkspaceNavigation.tsx'), 'utf8');
    expect(nav).toContain('className="workspace-create"');
    expect(app).toMatch(/\(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === 'k'/);
  });
});

// THE MARK SAYS ITS KEY ON HOVER (w-581dbc6cc4). The Done button needs the
// same shortcut hint on hover as its neighbours.
describe('the Done mark hangs a hint plate like its neighbours', () => {
  const plate = fs.readFileSync(path.join(root, 'renderer', 'src', 'hint-plate.ts'), 'utf8');

  it('carries the data-hint the plate is keyed by', () => {
    expect(focus).toContain('data-hint="done"');
    expect(plate).toContain("done: [{ key: 'E', what: 'Mark done' }],");
  });

  it('hangs it the way the corner marks beside it do', () => {
    // It is at the right-hand end of the bar, so the plate lines up on its
    // right edge rather than running off the window.
    expect(focus).toMatch(/data-hint="done"\s*\n\s*data-hint-align="right"/);
  });

  it('describes E exactly as the row plate describes it', () => {
    // The same key doing the same thing in two places may not be worded two
    // ways, and the row is where most people meet it.
    const row = plate.slice(plate.indexOf('  row: ['), plate.indexOf('  row: [') + 400);
    expect(row).toContain("{ key: 'E', what: 'Mark done' }");
  });
});
