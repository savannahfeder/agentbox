// A DOCUMENT YOU CANNOT TYPE IN IS NOT CALLED A TEXT BOX.
//
// A power tester (2026-11-23) opened a teammate's draft and her screen reader's
// list of things to press had the whole body as a text box, "Booking payment
// amounts Draft for Lena's review...", beside the Comment box. Tiptap puts
// role="textbox" on every editor, and DocText also draws documents nobody may
// type in (a teammate's copy, a live file before its room answers), so those
// were announced as a field to fill. No DOM in these tests, so the wiring is
// read from source, as the other DocText tests do; Tiptap spreads
// `editorProps.attributes` over its own role (getEditorViewAttributes).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../renderer/src/components/DocText.tsx', import.meta.url), 'utf8');
const options = src.slice(src.indexOf('useEditor({'), src.indexOf('}, [extensions]);'));

describe("DocText's editor", () => {
  it('is editable by the one rule, and is a text box only then', () => {
    expect(src).toMatch(/const editable = !readOnly && !\(live && !collab\);/);
    expect(options).toMatch(/editable,/);
    expect(options).toMatch(/attributes: \{ role: editable \? 'textbox' : 'document' \}/);
  });
});
