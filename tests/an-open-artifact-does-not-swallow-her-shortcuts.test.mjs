// AN OPEN ARTIFACT DOES NOT SWALLOW HER SHORTCUTS.
//
// She was right three times over, and the three had nothing in common but the
// symptom. Measured on the real renderer with her real cards and her real files
// before anything was touched:
//
//   markdown, caret in the file    ⌘K dead    j dead    Escape dead
//   page, clicked inside it        ⌘K dead    j dead    Escape closed it
//   change, caret in a line        ⌘K works   j dead    Escape dead
//
// The end-to-end half of this is that script, which presses real keys through
// Chromium's own input pipeline and asks the DOM what the app did. This file is
// the part that runs in the suite, and it guards the rule itself and the three
// places it is applied — because the rule was applied in three places and
// disagreed in all three, which is what made it three bugs instead of one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HER_LETTERS_IN_A_PAGE,
  IS_SHE_TYPING_IN_THE_PAGE,
  theAppKeepsThisKey,
  theAppKeepsThisInput,
  theAppKeepsThisLetterInAPage,
  whatTheFileSentUp,
} from '../shared/artifact-keys.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const docText = read('renderer', 'src', 'components', 'DocText.tsx');
const codeArtifact = read('renderer', 'src', 'components', 'CodeArtifact.tsx');
const mainMjs = read('main', 'main.mjs');
const app = read('renderer', 'src', 'App.tsx');

describe('which keys are still the app\'s', () => {
  it('keeps escape, because escape is the way back', () => {
    expect(theAppKeepsThisKey({ key: 'Escape' })).toBe(true);
  });

  it('keeps every command and control chord, because a chord is never text', () => {
    expect(theAppKeepsThisKey({ key: 'k', metaKey: true })).toBe(true);
    expect(theAppKeepsThisKey({ key: 'K', metaKey: true, shiftKey: true })).toBe(true);
    expect(theAppKeepsThisKey({ key: 'a', ctrlKey: true })).toBe(true);
    // ⌘S is in here on purpose: the save listener is a window listener too, so
    // it was dead by the same line, and her "Saved." never appeared.
    expect(theAppKeepsThisKey({ key: 's', metaKey: true })).toBe(true);
  });

  it('gives every letter to the file, which is the half that was already right', () => {
    for (const key of ['j', 'k', 'e', 'r', 's', 'c', 'z', '/', '\\', '1']) {
      expect(theAppKeepsThisKey({ key })).toBe(false);
    }
    expect(theAppKeepsThisKey({ key: 'J', shiftKey: true })).toBe(false);
  });

  it('gives OPTION to the file, because option-e is a letter on a Mac', () => {
    expect(theAppKeepsThisKey({ key: 'e', altKey: true })).toBe(false);
  });

  it('says no to nonsense rather than throwing', () => {
    expect(theAppKeepsThisKey(null)).toBe(false);
    expect(theAppKeepsThisKey({})).toBe(false);
  });

  it('answers the same question in the main process\'s vocabulary', () => {
    expect(theAppKeepsThisInput({ key: 'Escape' })).toBe(true);
    expect(theAppKeepsThisInput({ key: 'k', meta: true })).toBe(true);
    expect(theAppKeepsThisInput({ key: 'j' })).toBe(false);
    expect(theAppKeepsThisInput({ key: 'e', alt: true })).toBe(false);
    expect(theAppKeepsThisInput(null)).toBe(false);
  });
});

describe('what a key sent up from inside a page means', () => {
  it('escape is out of the file, which it has meant since w-9c4bc5d244', () => {
    expect(whatTheFileSentUp({ key: 'Escape' })).toBe('close');
  });

  it('command-K is the palette, whichever case the key arrives in', () => {
    expect(whatTheFileSentUp({ key: 'k', meta: true })).toBe('palette');
    expect(whatTheFileSentUp({ key: 'K', meta: true })).toBe('palette');
    expect(whatTheFileSentUp({ key: 'k', ctrl: true })).toBe('palette');
  });

  it('answers nothing for the chords the main process handles itself', () => {
    // ⌘R, ⌘=, ⌘0, ⌘Y and ⌘N are all answered in main/main.mjs. The window must
    // not answer them a second time.
    for (const key of ['r', 'y', 'n', '=', '-', '0']) {
      expect(whatTheFileSentUp({ key, meta: true })).toBe(null);
    }
    // J USED TO BE ON THIS LINE and it is not any more, deliberately. It was
    // here when the only keys a page sent up were escape and ⌘K; her letters
    // come up out of a page now, and J is one of them. What still means
    // nothing is a key the PAGE needs:
    expect(whatTheFileSentUp({ key: 'Enter' })).toBe(null);
    expect(whatTheFileSentUp({ key: 'ArrowDown' })).toBe(null);
    expect(whatTheFileSentUp(null)).toBe(null);
  });
});

describe('the markdown editor', () => {
  it('no longer swallows every key it sees', () => {
    // The line was `e.stopPropagation;` on its own, and the app's own handler
    // is a WINDOW listener above the React root, so it stopped ⌘K and escape
    // reaching the app at all.
    expect(docText).not.toMatch(/onKeyDown=\{\(e\) => \{[^}]*\n\s*e\.stopPropagation\(\);\n\s*\}\}/);
    expect(docText).toContain('if (!theAppKeepsThisKey(e)) e.stopPropagation();');
  });

  it('reads the one rule rather than writing its own', () => {
    expect(docText).toContain("from '../../../shared/artifact-keys.mjs'");
  });

  it('hands the keyboard back on escape instead of eating it', () => {
    expect(docText).toMatch(/if \(e\.key === 'Escape'\)[\s\S]{0,220}editor\?\.commands\.blur\(\)/);
  });
});

describe('a line of a change', () => {
  it('steps out of the line on escape, which also saves it', () => {
    // A line is a contentEditable, so the app's own guard refuses escape from
    // inside one. Blurring hands the keyboard back and onBlur is onDone.
    expect(codeArtifact).toMatch(/if \(e\.key === 'Escape'\) \{[^}]*blur\(\)/);
  });
});

describe('a page in the pane', () => {
  it('forwards every key the app owns, not just escape', () => {
    expect(mainMjs).toContain('theAppKeepsThisInput(input)');
    expect(mainMjs).toContain("window.webContents.send('zero:key-in-the-file'");
    // The old branch forwarded one key and nothing else, which is why ⌘K was
    // dead inside a page for three days.
    expect(mainMjs).not.toContain("send('zero:escape-doc')");
  });

  it('lets a chord fall through to the handlers below it', () => {
    // ⌘R, the zoom chords and ⌘Y/⌘N are answered further down that same
    // handler. Returning on every forwarded key would have taken them away.
    expect(mainMjs).toMatch(/if \(input\.key === 'Escape'\) return;/);
  });

  it('blurs the frame before it opens the palette', () => {
    // Otherwise the palette is on screen with the keyboard still in the page,
    // and every letter she types goes into the file.
    expect(app).toMatch(/meant === 'palette'[\s\S]{0,200}blur\?\.\(\)/);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// AND THEN E.
//
// E is not ⌘K and the difference is the whole of this half. Measured that day
// (shots//e-before.json), E archives the card perfectly well while her keyboard
// is ON THE MESSAGE, with a file open beside it or without one. It failed in
// exactly two places, for two unrelated reasons:
//
// It did NOT fail in a markdown file or in a line of a change with the caret in
// them, and it must not start working there: a letter has to stay a letter or
// typing the word "the" archives the card she is reading.

describe('her letters, coming up out of a page', () => {
  it('keeps E, because a page has nothing in it to type', () => {
    expect(theAppKeepsThisLetterInAPage({ key: 'e' })).toBe(true);
    expect(theAppKeepsThisLetterInAPage({ key: 'E' })).toBe(true);
    expect(whatTheFileSentUp({ key: 'e' })).toBe('app');
  });

  it('keeps the rest of her single-letter shortcuts with it', () => {
    for (const key of ['j', 'k', 'r', 'c', 'n', 's', 'z', 'b', 'g', '/', '\\']) {
      expect(theAppKeepsThisLetterInAPage({ key })).toBe(true);
      expect(whatTheFileSentUp({ key })).toBe('app');
    }
    expect([...HER_LETTERS_IN_A_PAGE]).toContain('e');
  });

  it('leaves the arrows, Enter, space and Tab to the page itself', () => {
    // Arrows SCROLL a page. Taking them would break reading the very thing she
    // opened, and Tab walks the page's own links.
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Tab']) {
      expect(theAppKeepsThisLetterInAPage({ key })).toBe(false);
      expect(whatTheFileSentUp({ key })).toBe(null);
    }
  });

  it('leaves 1 through 9 alone, because those APPROVE', () => {
    // Approval in this app only ever happens deliberately; App.tsx says so
    // where E used to approve and burned her. A forwarded digit is not that.
    for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(theAppKeepsThisLetterInAPage({ key })).toBe(false);
      expect(whatTheFileSentUp({ key })).toBe(null);
    }
  });

  it('is bare or shifted only, never under a modifier', () => {
    expect(theAppKeepsThisLetterInAPage({ key: 'e', meta: true })).toBe(false);
    expect(theAppKeepsThisLetterInAPage({ key: 'e', control: true })).toBe(false);
    // Option-e is a letter on a Mac, and this rule must not take that away.
    expect(theAppKeepsThisLetterInAPage({ key: 'e', alt: true })).toBe(false);
    expect(whatTheFileSentUp({ key: 'e', alt: true })).toBe(null);
  });

  it('says no to nonsense rather than throwing', () => {
    expect(theAppKeepsThisLetterInAPage(null)).toBe(false);
    expect(theAppKeepsThisLetterInAPage({})).toBe(false);
  });

  it('does not disturb what a letter means inside a file she can type in', () => {
    // theAppKeepsThisKey is the rule DocText reads, where she really is typing.
    // Every letter still belongs to the file there. That is the guard on the
    // whole of this change.
    for (const key of ['e', 'j', 'k', 'r', 's', 'c', 'z']) {
      expect(theAppKeepsThisKey({ key })).toBe(false);
    }
  });
});

describe('the one question main cannot answer by itself', () => {
  it('asks the page whether she is typing in it', () => {
    expect(mainMjs).toContain('IS_SHE_TYPING_IN_THE_PAGE');
    expect(mainMjs).toContain('theAppKeepsThisLetterInAPage(input)');
    // Only a frame can see its own focus, so the frame is asked.
    expect(mainMjs).toMatch(/executeJavaScript\(IS_SHE_TYPING_IN_THE_PAGE[\s\S]{0,200}sendItUp\(\)/);
  });

  it('the script it asks with looks for a real text field', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(IS_SHE_TYPING_IN_THE_PAGE).toContain(tag);
    }
    expect(IS_SHE_TYPING_IN_THE_PAGE).toContain('isContentEditable');
  });

  it('a letter is forwarded only from a page, never with the rest', () => {
    // The chord path is untouched: it forwards without asking anything, which
    // is what keeps ⌘K instant.
    expect(mainMjs).toMatch(/const aLetterFromAPage = !theAppKeepsThisInput\(input\) && theAppKeepsThisLetterInAPage\(input\);/);
  });
});

describe('the app is handed the letter back rather than told what it means', () => {
  it('replays the press into the app\'s own handler', () => {
    // Restating what a letter means in a second place is how S came to mean
    // two things at once (renderer/src/keys.ts). E archives, J and K walk, and
    // every guard already in front of them stays in front of them.
    expect(app).toMatch(/meant === 'app'[\s\S]{0,400}dispatchEvent\(new KeyboardEvent\('keydown'/);
  });

  it('blurs the frame first, the same as the palette does', () => {
    expect(app).toMatch(/meant === 'app'[\s\S]{0,300}blur\?\.\(\)/);
  });
});

describe('a change no longer takes E off her', () => {
  it('does not bind bare E to opening the file outside', () => {
    // MEASURED 2026-08-24 with a change open and her keyboard on the message:
    // E opened the file and the card was NOT archived. The archive never ran
    // at all, though every other letter reached the app in the same state a
    // moment earlier. E means archive everywhere else in this app.
    expect(codeArtifact).not.toMatch(/if \(e\.key === 'e' && current\)/);
    expect(codeArtifact).not.toContain('openOutside(current.path)');
  });

  it('leaves the control that already does it, on the same file', () => {
    // Nothing is lost: the pane draws the icon she settled on 2026-08-23, and
    // it opens the file this component reports up as fileAt.
    const docPane = read('renderer', 'src', 'components', 'DocPane.tsx');
    expect(docPane).toContain('openArtifactExternally');
    expect(docPane).toMatch(/kind === 'code' \? \(fileAt \?\? doc\.src\)/);
    expect(codeArtifact).toContain('onFileAt(current?.path ?? null)');
  });
});
