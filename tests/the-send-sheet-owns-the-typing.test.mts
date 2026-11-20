// THE SEND SHEET OWNS THE TYPING (2026-11-20).
//
// Lena, on the rerun: Share… › Send to someone… › Priya › Review and send
// back, then typed her note. It went into the thread's Reply box: the person
// she picked from the list vanished with the focus on it, the want she
// pressed kept the focus on a button, and a letter with no box under it is
// the thread's. The review went with no note. Now picking a person or a want
// puts the keys in the note, and a letter pressed anywhere on the open sheet
// goes to the note and stops there. Measured by reading the sheet and the
// menu's key handling.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the send sheet', () => {
  const sheet = read('renderer/src/threads/SharePanel.tsx');
  it('moves the keys to the note when a person or a want is picked', () => {
    expect(sheet).toContain("const add = (id: string) => { setTo((was) => [...new Set([...was, id])]); setTyped(''); noteBox.current?.focus(); };");
    expect(sheet).toContain('onClick={() => { setWant((was) => (was === w ? null : w)); noteBox.current?.focus(); }}>');
    expect(sheet).toContain('<textarea ref={noteBox} className="sh-note"');
  });
  it('takes a stray letter into the note before the thread can', () => {
    const menu = read('renderer/src/threads/ThreadMenu.tsx');
    expect(menu).toContain("if (note && document.activeElement !== note && e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) { note.focus(); e.stopImmediatePropagation(); return; }");
    // The menu's keys run on the window's capture, ahead of the thread's own.
    expect(menu).toContain("window.addEventListener('keydown', keys, true);");
  });
});
