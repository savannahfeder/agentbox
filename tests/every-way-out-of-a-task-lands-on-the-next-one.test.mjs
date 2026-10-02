// EVERY WAY A ROW LEAVES HER INBOX LANDS HER ON THE NEXT TASK.
//
// The rule was already right and already written down (./advance, 2026-08-22).
// What was wrong is that only SOME branches asked it. Closing a row and
// answering one went through `deferCommit`, which calls the rule; setting a
// reminder, replying to an agent and sending a row back each cleared `focused`
// on their own and never asked, so the row left and she was put back at the top
// of the list she was working down.
//
// Measured on the built app before and after
//: one task open, S, then
// return on the first preset. Before, the reading pane was gone and she was in
// the list. After, the pane is up and it is showing the NEXT row.
//
// So this file guards the SHAPE that made it possible: one pairing of "note the
// advance" with "close the task", and every branch that empties her inbox
// calling it. A tenth branch added later cannot half-do it without failing here.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

// The source of one `const NAME = useCallback(` up to the line that closes it.
function bodyOf(name) {
  const start = app.indexOf(`const ${name} = useCallback(`);
  expect(start, `${name} is not a useCallback in App.tsx`).toBeGreaterThan(-1);
  const end = app.indexOf('\n  }, [', start);
  expect(end, `${name} never closes`).toBeGreaterThan(start);
  return app.slice(start, app.indexOf('\n', end + 5));
}

// The four branches that take a row OUT of her inbox. Everything else that
// clears `focused` is navigation — search, Tab between views, cmd-A — and
// navigation is not something she did to the task.
const LEAVES_THE_INBOX = ['deferCommit', 'snoozeUntil', 'replyToAgent', 'sendBack'];

describe('the one pairing', () => {
  it('notes the advance and closes the task together, in one place', () => {
    const leave = bodyOf('leaveResolved');
    expect(leave).toContain('noteAdvance(item)');
    expect(leave).toContain('setFocused(null)');
  });

  // If a branch could still do half of it, the half it would skip is the
  // advance, because clearing `focused` is the visible part.
  it('is the only thing that calls the rule', () => {
    // One call in the whole file, and it is the one inside leaveResolved. The
    // declaration reads `const noteAdvance = useCallback(` and its mention in
    // leaveResolved's deps reads `[noteAdvance]`, so neither is counted here.
    const calls = app.match(/noteAdvance\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(bodyOf('leaveResolved').match(/noteAdvance\(/g)?.length).toBe(1);
  });
});

describe('every way a row leaves her inbox', () => {
  it.each(LEAVES_THE_INBOX)('%s closes the task through leaveResolved', (name) => {
    expect(bodyOf(name)).toContain('leaveResolved(');
  });

  // The bug in one line: a bare setFocused(null) in one of these is a row that
  // goes and a founder who does not.
  it.each(LEAVES_THE_INBOX)('%s never clears focus on its own', (name) => {
    expect(bodyOf(name)).not.toContain('setFocused(null)');
  });

  // React would not warn about this and the advance would silently go stale,
  // firing against whichever inbox the last render happened to hold.
  it.each(LEAVES_THE_INBOX)('%s lists leaveResolved among its deps', (name) => {
    const start = app.indexOf(`const ${name} = useCallback(`);
    const deps = app.slice(app.indexOf('\n  }, [', start));
    expect(deps.slice(0, deps.indexOf(']'))).toContain('leaveResolved');
  });
});

describe('a reminder in particular', () => {
  // Her actual complaint. The advance is noted AFTER the write, because a
  // refused write leaves the row in her inbox and moving her off it would say
  // it had gone: the function already orders its toast that way for the same
  // reason.
  it('advances only once the moment is really kept', () => {
    const body = bodyOf('snoozeUntil');
    const failed = body.indexOf('Could not schedule');
    const advanced = body.indexOf('leaveResolved(');
    expect(failed).toBeGreaterThan(-1);
    expect(advanced).toBeGreaterThan(failed);
  });

  // Taken from the list there is no task to leave, and `advanceAfter` already
  // returns null for that. This is only that the picker cannot be handed a row
  // she was not on: from inside a task it is opened on `focused` and on
  // nothing else.
  // L, NOT S, SINCE 2026-10-01, and the excerpt is the only thing about this
  // that changed. S opened this picker here AND toggled the summary panel on
  // the same screen, so one letter meant two things; scheduling is L
  // everywhere now. The claim being made is unchanged: the picker is opened on
  // the task being read and on nothing else.
  it('opens on the task she is reading, so the row it advances past is hers', () => {
    expect(app).toContain("else if (e.key === 'l' || e.key === 'L') openSnooze(focused);");
  });
});

// AND THE ONE THE FIRST PASS MISSED, WHICH SHE THEN DELETED: DECLINE.
//
// The four callbacks above were the four that cleared `focused` themselves, so
// they are the four a grep for `setFocused(null)` finds. "Decline Proposal"
// cleared nothing, which is why it was not among them: it wrote `status: done`
// straight to the ledger from inside the ⌘K list and left her sitting on a row
// that had gone. Same disappearance as Close, no advance, no undo window.
//
// What survives is the guard that found it, and it is on SHAPE rather than on a
// list of names: no command in the palette resolves a row by itself. Every one
// of them hands the row to a named callback, and every callback that ends a row
// goes through deferCommit, which is the one place the advance lives. That is
// what keeps the next command anyone adds inline from repeating this.
describe('the palette resolves nothing by hand', () => {
  const commands = (() => {
    const start = app.indexOf('itemCommands={(() => {');
    expect(start, 'the palette no longer builds itemCommands inline').toBeGreaterThan(-1);
    // The prop after itemCommands. It was `onFilter={` until the per-project
    // rows became one "Filter…" line (w-aa3fa4cbf0).
    const end = app.indexOf('filtering={', start);
    expect(end, 'itemCommands never ends').toBeGreaterThan(start);
    return app.slice(start, end);
  })();

  it('never writes to the ledger from inside a command', () => {
    expect(commands).not.toContain('api.answer(');
  });

  it('offers no Decline, because she took it out', () => {
    expect(commands).not.toContain("id: 'decline'");
    expect(commands.toLowerCase()).not.toContain('decline proposal');
  });

  it('has no declining code left anywhere to be wired back up', () => {
    expect(app).not.toContain('declineProposal');
  });
});

// AND THE ONE THE SECOND PASS MISSED: RESUME.
//
// "Resume This Agent" is offered in ⌘K on a row she is READING, and it is the
// fifth way out. A worker claims the row, the row moves to In progress, and her
// inbox empties by one exactly as closing it does. Like Decline it cleared
// nothing, so a grep for `setFocused(null)` never found it either; unlike
// Decline it does not resolve the row, which is why the palette guard above
// passes over it. It left her parked on a row that had gone.
//
// It differs from the other five in one way that matters, and the test below is
// mostly about that way. Resuming does not always take the row: over capacity
// the supervisor only remembers it, the row stays open with no claim, and both
// tabs read the row itself (`belongsInProgress` never looks at the queue), so
// it is still sitting in her inbox. Advancing off it then would say it had gone
// — the same mistake the reminder makes if it advances before its write lands.
describe('putting a worker back on a row', () => {
  const body = bodyOf('putAgentBackOn');

  it('closes the task through leaveResolved, like every other way out', () => {
    expect(body).toContain('leaveResolved(');
    expect(body).not.toContain('setFocused(null)');
  });

  it('lists leaveResolved among its deps', () => {
    const start = app.indexOf('const putAgentBackOn = useCallback(');
    const deps = app.slice(app.indexOf('\n  }, [', start));
    expect(deps.slice(0, deps.indexOf(']'))).toContain('leaveResolved');
  });

  // The whole point. A row that only got queued never left, so she stays on it.
  it('advances only when a worker actually started, never when it queued', () => {
    expect(body).toMatch(/if \(started > 0\) leaveResolved\(/);
  });

  it('is offered in the palette and hands the row to that callback', () => {
    const start = app.indexOf('itemCommands={(() => {');
    const commands = app.slice(start, app.indexOf('onFilter={', start));
    expect(commands).toContain("id: 'resume-any'");
    expect(commands).toContain('putAgentBackOn([target])');
  });
});
