// R REPLIES WITHOUT CLOSING THE PAGE YOU ARE READING (w-6282026162).
//
// Hers: "when i have an artifact like fullscreened or something and hit "r" it
// often closes it then i have to reopen. I should be able to respond in full
// screen". R inside an open thread ran `setOpenDoc(null)` before opening the
// box, so the page shut every time and she had to find it and open it again.
// Full screen has drawn the reply box under the page since 2026-09-21, and its
// folded pill even shows an R cap; clicking that pill kept the page open, and
// pressing the key it names shut it.
//
// How it got there: R used to switch the page to an "inline" mode and then
// open the box. When inline was deleted on 2026-09-15 the line was changed to
// close the page instead, and nothing pinned which one R was meant to do.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HER_LETTERS_IN_A_PAGE } from '../shared/artifact-keys.mjs';
import { keyWhileABoxIsOpen } from '../renderer/src/keys';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const focus = read('renderer/src/components/Focus.tsx');

const HANDLER = app.indexOf('    const onKey = (e: KeyboardEvent) => {');
const FOCUSED = app.indexOf('      if (focused) {', HANDLER);
const LIST = app.indexOf('      switch (e.key) {', FOCUSED);
const beforeBranches = app.slice(HANDLER, FOCUSED);
const inAThread = app.slice(FOCUSED, LIST);
const onTheList = app.slice(LIST, app.indexOf('    };', LIST));

const rInAThread = inAThread.split('\n').find((l) => l.includes("e.key === 'r' || e.key === 'R'"));

describe('R in an open thread', () => {
  it('has one line, in the thread branch', () => {
    expect(HANDLER).toBeGreaterThan(0);
    expect(FOCUSED).toBeGreaterThan(HANDLER);
    expect(LIST).toBeGreaterThan(FOCUSED);
    expect(rInAThread).toBeTruthy();
  });

  it('opens the reply box', () => {
    expect(rInAThread).toContain("setModal('reply')");
  });

  it('leaves the open page where it is, full screen or beside the thread', () => {
    expect(rInAThread).not.toContain('setOpenDoc(');
    expect(rInAThread).not.toContain('closeArtifact(');
    expect(rInAThread).not.toContain('setArtifactMode(');
  });

  it('does the same as clicking the reply pill', () => {
    expect(app).toContain("onReply={() => setModal('reply')}");
    // AND PUTS THE CARET BACK IN A BOX THAT IS ALREADY OPEN (w-326fb83c0e):
    // the dock focuses itself when it mounts, and Escape leaves it mounted.
    expect(rInAThread).toBe("        else if (e.key === \'r\' || e.key === \'R\') { e.preventDefault(); setModal(\'reply\'); if (modal === \'reply\') focusTheReplyBox(); }");
  });
});

describe('the box it opens is on the screen in full screen', () => {
  it('draws the composer in the dock when the box is open', () => {
    expect(focus).toMatch(/\) : replyOpen \? \([\s\S]{0,400}<DockComposer /);
  });

  it('names R on the folded pill, so the key it names has to keep the page', () => {
    expect(focus).toContain('<span className="dock-pill-key"><kbd>R</kbd></span>');
  });

  it('reaches the same line when R is pressed inside the page', () => {
    expect(HER_LETTERS_IN_A_PAGE.has('r')).toBe(true);
    expect(app).toContain("window.dispatchEvent(new KeyboardEvent('keydown', { key: k.key, bubbles: true }));");
  });
});

describe('what must not change', () => {
  it('escape with the box open folds the box and keeps the page', () => {
    // The gate is a rule now rather than a condition (renderer/src/keys.ts,
    // w-326fb83c0e), so the claim is made against the rule: Escape with the
    // caret out of the box closes the box, and nothing here touches the page.
    expect(beforeBranches).toContain("const gate = keyWhileABoxIsOpen({ modal, inInput, key: e.key });");
    expect(beforeBranches).toContain("if (gate === 'close-the-modal') { setModal(null); return; }");
    expect(keyWhileABoxIsOpen({ modal: 'reply', inInput: false, key: 'Escape' })).toBe('close-the-modal');
  });

  it('escape with the box folded still closes the page, one step back', () => {
    expect(inAThread).toContain("if (e.key === 'Escape') { if (escapeClosesDoc(openDoc)) closeArtifact(); else setFocused(null); }");
  });

  it('clicking into a full screen page folds the box and keeps the page', () => {
    expect(app).toContain('const foldBack = () => { if (!aVoiceNoteIsRecording()) setModal(null); };');
  });

  it('R on the list still opens the thread with its box', () => {
    expect(onTheList).toContain("case 'r': case 'R': if (!multiSel.size && pointed && replyKeyWorksIn(view)) { e.preventDefault(); setFocused(pointed); markSeen(pointed); setModal('reply'); } break;");
  });
});
