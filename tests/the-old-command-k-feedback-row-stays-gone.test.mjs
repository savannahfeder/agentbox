// THE OLD ⌘K FEEDBACK ROW STAYS GONE (was the-feedback-feature-is-gone).
//
// WHAT CHANGED ON 2026-10-04 (w-1b574413db). This file ended by saying that if
// feedback is genuinely wanted again, she is the one who says so, and this file
// goes with it. She said so, in her own words: "I want us to create a way for
// users of Agentbox to easily send me feedback", with the entry point in the
// sidebar "just like another sidebar tab". That feature is a Feedback row in
// the sidebar's foot opening a card (FeedbackCard.tsx), and it reuses the
// ordinary names `main/feedback.mjs`, `shared/feedback.mjs`, "Send feedback"
// and `onFeedback`, so those are no longer banned here.
//
// What is still banned is the thing she asked three times to be rid of: the
// row in ⌘K, its card, its bridge, its channel and its modal. Those names
// belong to nothing else and must not come back.
//
// The history, as it was written:
//
// SHE IS DESCRIBING SOMETHING REAL AND IT IS MEASURABLE. The removal was
// written twice and merged never:
//
//   f411149  "The ⌘K feedback feature comes out entirely"
// on agentbox/-remove. Not in main.
//   2dfd052  "The Command K feedback row and everything behind it come out
// ". Not in main.
//
// Both branches still exist and neither ever reached `main`, so every build she
// has ever installed has had the row in it, while two rows in her inbox said it
// was gone. This is the third time she has had to say it.
//
// WHY A WHOLE-TREE TEST AND NOT ANOTHER PALETTE ASSERTION. There is already one
// of those (`offers no feedback row at all`, her-word-is-project.test.mjs) and
// it passed on both unmerged branches, which is exactly the problem: a test
// that lives on the branch that does the deleting protects nothing. This one
// sits on main and fails if any PART of the feature comes back, whether or not
// the palette row does: the two modules, the card, the preload bridge, the IPC
// channel, the modal name, or the label itself.
//
// IT KEYS ON THE FEATURE'S OWN NAMES, NOT ON THE WORD "feedback", which is
// ordinary English and appears legitimately in this tree: `shared/contracts.mjs`
// carries the Agents Tray review pipeline, and `renderer/src/fixtures.ts` lists
// a sample Claude agent that gives feedback on screenshots.
// Neither of those is this.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The old card's file. `main/feedback.mjs` and `shared/feedback.mjs` were
 *  the old feature's too and are the new one's now (see the head of the file). */
const FILES = [
  'renderer/src/components/Feedback.tsx',
];

/** The old row's own names, none of which the sidebar feature uses. "Send
 *  feedback" and `onFeedback` left this list on 2026-10-04: the new card is
 *  titled "Send feedback" and the sidebar takes `onFeedback`. */
const NAMES = [
  'tell us what broke',   // the palette row's hint
  'feedbackSend',         // the preload bridge and the window.zero type
  'zero:feedback-send',   // the IPC channel behind it
  "setModal('feedback')", // the card being opened as a palette modal
];

/**
 * Everything that ships. `renderer/dist` is build output and is rebuilt from
 *  these, so scanning it would only ever report a stale bundle. */
const TREES = ['renderer/src', 'main', 'shared'];
const LOOSE = ['preload.cjs'];

function sourceFiles() {
  const out = [...LOOSE.map((f) => path.join(root, f))];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|cjs|js|css)$/.test(e.name)) out.push(p);
    }
  };
  for (const t of TREES) walk(path.join(root, t));
  return out;
}

describe('the feedback feature is not anywhere in the application', () => {
  it('has none of its files', () => {
    const back = FILES.filter((f) => fs.existsSync(path.join(root, f)));
    expect(back, `these came back: ${back.join(', ')}`).toEqual([]);
  });

  it('has none of its names, in any file that ships', () => {
    const files = sourceFiles();
    // If this ever reads zero files the test is vacuous and every assertion
    // below passes for the wrong reason.
    expect(files.length).toBeGreaterThan(50);
    const hits = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const name of NAMES) {
        if (src.includes(name)) hits.push(`${path.relative(root, file)}: ${name}`);
      }
    }
    expect(
      hits,
      `the feedback feature is back in the app:\n  ${hits.join('\n  ')}\n`
      + 'She has asked for it to be gone three times (2026-08-21, 2026-08-25, 2026-09-01). '
      + 'If it is genuinely wanted again, she is the one who says so, and this file goes with it.',
    ).toEqual([]);
  });

  it('leaves no feedback modal for anything to open', () => {
    const scope = fs.readFileSync(path.join(root, 'renderer/src/modal-scope.ts'), 'utf8');
    expect(scope).not.toMatch(/'feedback'/);
  });

  // AND THE ORDINARY USES OF THE WORD ARE LEFT ALONE, so a later round does not
  // read this file as "delete every line saying feedback" and take a comment
  // about a control loop out with it.
  it('does not object to the word itself where it means something else', () => {
    const fixtures = fs.readFileSync(path.join(root, 'renderer/src/fixtures.ts'), 'utf8');
    expect(fixtures).toContain('Gives feedback on screenshots');
  });
});
