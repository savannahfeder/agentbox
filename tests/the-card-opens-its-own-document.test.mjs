// The card opens its own document, and the divider says it can move.
//
// Then, asked which of the two to build: "build both".
//
// What this pins is the judgment in the first one. Opening the FIRST document a
// message names is the obvious rule and it is wrong: measured across all 701
// cards in her eight products, it opens STATE.md or decisions.md on 249 of the
// 619 that name an openable file, because our own bookkeeping gets named in
// almost every checkpoint a worker writes. Skipping those lands on a document a
// worker actually made on 505 of the 619.
//
// AND THEN ONLY A DESIGN.Measured on her store that day by words alone: the
// pane opened itself on 641 of 1,880 agent-written rows, and on 466 of those it
// landed first on a page of words; under this rule it opens on 335. A report, a
// spec or a markdown file is a chip now, never a pane.
import { describe, it, expect } from 'vitest';
import { mainDocument, documentCandidates, isBookkeeping, isDesign, opensOnItsOwn } from '../renderer/src/message-artifacts.ts';
import { escapeClosesDoc, escapeInTheFileClosesIt, focusIsInTheFile, DOC_FRAME_CLASS } from '../renderer/src/doc-pane.ts';

describe('which document a card opens by itself', () => {
  it('opens the drawing a worker made, not the state file it also named', () => {
    // The shape of almost every checkpoint we write.
    const item = {
      result: [
        '**Say build both, say just the auto opening, or say just the hover mark.**',
        '',
        'The document pane is merged. STATE.md and decisions.md carry the story.',
        '',
        'designs/w-74b0b5cd87/built/the-pane-running.html',
      ].join('\n'),
    };
    expect(mainDocument(item)).toBe('designs/w-74b0b5cd87/built/the-pane-running.html');
  });

  it('reads the whole message, newest part first, the way the chips do', () => {
    const item = {
      body: 'designs/old-round/one.html',
      note: 'designs/newer-round/two.html',
      result: 'designs/newest-round/three.html',
    };
    expect(mainDocument(item)).toBe('designs/newest-round/three.html');
  });

  it('leaves a report, a spec and a markdown file as chips, because words belong in the message', () => {
    // Each of these used to take 72% of her window the moment the card opened.
    expect(mainDocument({ result: 'reports/week-32.md' })).toBeNull();
    expect(mainDocument({ result: 'reports/pricing-teardown.html' })).toBeNull();
    expect(mainDocument({ result: 'specs/email-agent.html' })).toBeNull();
    expect(mainDocument({ result: 'strategy/2026-09-13-email-agent-spec.html' })).toBeNull();
    expect(mainDocument({ result: 'the-answer.html' })).toBeNull();
  });

  it('opens a change to review, her second case: "if you want to review code"', () => {
    // Her 19:42 reply named three things that belong on the side: an app at a
    // port, a design, and code to review. The change file is the third.
    expect(mainDocument({ result: 'changes/w-1.change' })).toBe('changes/w-1.change');
    expect(opensOnItsOwn('changes/w-1.change')).toBe(true);
    expect(opensOnItsOwn('designs/a.html')).toBe(true);
    expect(opensOnItsOwn('reports/a.html')).toBe(false);
    expect(opensOnItsOwn('reports/a.md')).toBe(false);
  });

  it('knows a design by where it lives: an html page under designs or demos', () => {
    expect(isDesign('designs/w-74b0b5cd87/built/the-pane-running.html')).toBe(true);
    expect(isDesign('demos/first-run.html')).toBe(true);
    expect(isDesign('/Users/s/Zero/accounts/a/astral/designs/round4/k.html')).toBe(true);
    expect(isDesign('designs/round4/notes.md')).toBe(false);
    expect(isDesign('reports/designs-review.html')).toBe(false);
    expect(isDesign('redesigns/a.html')).toBe(false);
    expect(isDesign(null)).toBe(false);
  });

  it('stays shut when the card names nothing but bookkeeping, and nothing was made', () => {
    expect(mainDocument({ result: 'Updated STATE.md and decisions.md.' })).toBeNull();
    expect(mainDocument({ note: 'See CLAUDE.md and the README.md.' })).toBeNull();
  });

  it('falls back to what the RUN made, because that is tagged on the card too', () => {
    // Her real. Its words name only decisions.md, and the chip under it comes
    // from the trace: a worker made the page and did not say so.
    const item = { result: 'All five branches are merged into main. decisions.md carries the story.' };
    const made = ['designs/w-74b0b5cd87/built/the-pane-running.html'];
    expect(mainDocument(item)).toBeNull();
    expect(mainDocument(item, made)).toBe('designs/w-74b0b5cd87/built/the-pane-running.html');
  });

  it('puts what the message NAMED ahead of what the run merely made', () => {
    // The same order the attachment row already draws, so the pane never
    // disagrees with the chips at the foot of the same card.
    const item = { result: 'designs/named-on-purpose.html' };
    const made = ['designs/made-in-passing.html', 'designs/named-on-purpose.html'];
    expect(documentCandidates(item, made)).toEqual([
      'designs/named-on-purpose.html',
      'designs/made-in-passing.html',
    ]);
  });

  it('stays shut when the card names nothing the pane can draw', () => {
    // A png opens in Preview and a source file in her editor; neither belongs
    // in a pane that took half her window without being asked.
    expect(mainDocument({ result: 'attachments/pasted-77668.png' })).toBeNull();
    expect(mainDocument({ result: 'renderer/src/App.tsx and main/ipc.mjs' })).toBeNull();
    expect(mainDocument({})).toBeNull();
  });

  it('knows a bookkeeping file wherever on disk it sits, and by name only', () => {
    expect(isBookkeeping('agentbox/STATE.md')).toBe(true);
    expect(isBookkeeping('decisions.md')).toBe(true);
    expect(isBookkeeping('notes.md')).toBe(true);
    expect(isBookkeeping('designs/state-of-the-round.md')).toBe(false);
    expect(isBookkeeping('reports/readme-rewrite.md')).toBe(false);
  });
});

describe('esc does not get in the way of a pane she never opened', () => {
  it('closes a document she clicked open', () => {
    expect(escapeClosesDoc({ product: 'agentbox', src: 'designs/a.html' })).toBe(true);
  });

  it('leaves the task when the card opened the document by itself', () => {
    // Otherwise esc-to-leave costs two presses on 505 of her 619 cards.
    expect(escapeClosesDoc({ product: 'agentbox', src: 'designs/a.html', auto: true })).toBe(false);
  });

  it('leaves the task when no document is open at all', () => {
    expect(escapeClosesDoc(null)).toBe(false);
    expect(escapeClosesDoc(undefined)).toBe(false);
  });
});

// AND THE SAME KEY FROM INSIDE THE FILE.
//
// A keydown does not cross a document boundary, so once her click lands inside
// the page the app's own window listener never hears escape again. Main
// forwards it from below the page (before-input-event, main/main.mjs) and these
// two rules are what the renderer does with it.
const activeFrame = (cls) => ({ tagName: 'IFRAME', classList: { contains: (c) => c === cls } });

describe('escape works from inside the file too', () => {
  it('closes the file, including one the card opened by itself', () => {
    // NOT the rule above, and not a change to it. That one is about a press on
    // the MESSAGE, where a pane she never asked for must not cost a keystroke.
    // Her keyboard is IN the page here, and back means out of it.
    expect(escapeInTheFileClosesIt({ product: 'agentbox', src: 'designs/a.html' })).toBe(true);
    expect(escapeInTheFileClosesIt({ product: 'agentbox', src: 'designs/a.html', auto: true })).toBe(true);
  });

  it('does nothing when there is no file to close', () => {
    expect(escapeInTheFileClosesIt(null)).toBe(false);
    expect(escapeInTheFileClosesIt(undefined)).toBe(false);
  });

  it('answers the forwarded key only while the file holds the keyboard', () => {
    // Measured on Electron 43, 2026-08-21: with the keyboard inside the page
    // the app document's activeElement is the frame ELEMENT, IFRAME#f, and it
    // is DIV#log the moment the app takes the keyboard back. That is the whole
    // test, and it is what stops one press being answered twice.
    expect(focusIsInTheFile(activeFrame(DOC_FRAME_CLASS))).toBe(true);
    expect(focusIsInTheFile({ tagName: 'iframe', classList: { contains: (c) => c === 'doc-view' } })).toBe(true);
  });

  it('leaves every other frame in the app alone', () => {
    // Main forwards from ANY frame, so the class is what tells them apart.
    expect(focusIsInTheFile(activeFrame('some-other-frame'))).toBe(false);
    expect(focusIsInTheFile({ tagName: 'DIV', classList: { contains: () => true } })).toBe(false);
    expect(focusIsInTheFile({ tagName: 'IFRAME' })).toBe(false);
    expect(focusIsInTheFile(null)).toBe(false);
    expect(focusIsInTheFile(undefined)).toBe(false);
  });
});
