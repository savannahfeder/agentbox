// The sidebar note: where the user's words go, and the ways they could have
// been lost.
//
// Everything pinned written onto the wrong product's file, written on top of a
// page an agent wrote, truncated instead of refused, or drawn with a table the
// column cannot hold.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notePath, readNote, writeNote, NOTE_NAME, MAX_NOTE_BYTES } from '../main/rail-note.mjs';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { buildExtensions, unboldHeading } from '../renderer/src/editor/extensions.ts';
import { mdToPmDoc, pmDocToMd } from '../renderer/src/editor/markdown.ts';

function aProduct(name = 'agentbox') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rail-note-${name}-`));
  return { slug: name, name, dir };
}

describe('where the note lives', () => {
  it('is one markdown file in the product\'s own folder', () => {
    const prod = aProduct();
    expect(notePath(prod)).toBe(path.join(prod.dir, 'pinned.md'));
  });

  // notes.md is taken. On Agentbox it holds a map an agent wrote in round one
  // that has been stale since 08-13, and loading that into her sidebar the
  // first time she opened it is the one failure here she would never think to
  // report.
  it('is never notes.md, which agents already write', () => {
    expect(NOTE_NAME).toBe('pinned.md');
    expect(NOTE_NAME).not.toBe('notes.md');
  });

  it('says so rather than throwing when a project has no folder', () => {
    expect(notePath({ slug: 'nowhere' })).toBeNull();
    expect(readNote({ product: { slug: 'nowhere' } }).ok).toBe(false);
    expect(writeNote({ product: { slug: 'nowhere' }, text: 'hi' }).ok).toBe(false);
  });
});

describe('her words survive', () => {
  it('reads an unstarted note as empty, not as an error', () => {
    const prod = aProduct();
    const read = readNote({ product: prod });
    // The panel draws its placeholder off this. An error here would put a
    // failure message where "Write anything…" belongs, on every product she has
    // never typed on, which is all of them on the first day.
    expect(read).toEqual({ ok: true, text: '', mtime: 0 });
    expect(fs.existsSync(notePath(prod))).toBe(false);
  });

  it('writes the file on the first keystroke and reads back exactly it', () => {
    const prod = aProduct();
    const her = '## This week\n\n- Finish the onboarding copy\n- [ ] Clean up the settings page\n';
    expect(writeNote({ product: prod, text: her }).ok).toBe(true);
    expect(fs.readFileSync(notePath(prod), 'utf8')).toBe(her);
    expect(readNote({ product: prod }).text).toBe(her);
  });

  it('keeps two products apart', () => {
    const agentbox = aProduct('agentbox');
    const quarry = aProduct('quarry');
    writeNote({ product: agentbox, text: 'one goal' });
    writeNote({ product: quarry, text: 'something else' });
    expect(readNote({ product: agentbox }).text).toBe('one goal');
    expect(readNote({ product: quarry }).text).toBe('something else');
  });

  it('empties the note when she deletes every word, rather than keeping the old one', () => {
    const prod = aProduct();
    writeNote({ product: prod, text: 'old' });
    expect(writeNote({ product: prod, text: '' }).ok).toBe(true);
    expect(readNote({ product: prod }).text).toBe('');
  });

  // REFUSED, NOT TRUNCATED. Half her note written back is worse than none,
  // because the panel would show her the half and nothing would say the rest
  // went.
  it('refuses a note past the cap and leaves what was there alone', () => {
    const prod = aProduct();
    writeNote({ product: prod, text: 'the real note' });
    const huge = 'x'.repeat(MAX_NOTE_BYTES + 1);
    const res = writeNote({ product: prod, text: huge });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(readNote({ product: prod }).text).toBe('the real note');
  });
});

describe('the formatting she asked for, and the one piece she cannot have', () => {
  // The rules are the document pane's, unchanged, so what she types in the
  // sidebar is the same markdown she gets in a file.
  it('round-trips a heading, a bullet, a task and bold through the editor', () => {
    // A bullet list and a task list are two blocks, so the blank line between
    // them is the editor being right rather than the note drifting.
    const her = '## Priorities\n\n- **Fix the signup** form first\n- tidy the settings page\n\n- [ ] reply to the support emails\n';
    expect(pmDocToMd(mdToPmDoc(her)).trim()).toBe(her.trim());
  });

  // TWO BUGS on the shipped panel: blank lines vanished, and bold could not be
  // taken off a heading.
  //
  // Both are pinned here because both were invisible until a reload. The gap
  // was already gone the moment the note saved; the screen just kept showing it
  // until the file was read back. And a heading and bold text are drawn as one
  // look in this panel on purpose, so there was nothing that could have told
  // her which one a line was.
  it('keeps the blank lines she pressed Enter for', () => {
    // A line, two empty lines, another line: what the editor holds after she
    // hits Enter three times.
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Finish the onboarding copy this week.' }] },
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'The settings page comes next' }] },
      ],
    };
    const md = pmDocToMd(doc);
    expect(mdToPmDoc(md).content).toEqual(doc.content);
    // And it settles: saving what came back writes the same file again, so the
    // note does not drift a line every time she opens the product.
    expect(pmDocToMd(mdToPmDoc(md))).toBe(md);
  });

  it('still reads one blank line as an ordinary paragraph break', () => {
    // The gap between two paragraphs is not something the user typed, and turning it
    // into an empty line would grow every note in the store by a line per
    // paragraph the first time it was opened.
    expect(mdToPmDoc('a\n\nb\n').content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
    ]);
    expect(pmDocToMd(mdToPmDoc('a\n\nb\n'))).toBe('a\n\nb\n');
  });

  it('keeps a gap that falls next to a heading or a list', () => {
    const her = '## This week\n\n\nFinish the onboarding copy this week.\n\n\n\n- Clean up the settings page\n';
    expect(pmDocToMd(mdToPmDoc(her))).toBe(her);
  });

  it('drops blank lines at the top and bottom, and keeps dropping them', () => {
    // Trailing whitespace in a file is not a line she can see, and the note is
    // trimmed on the way to disk anyway. What matters is that it settles.
    expect(pmDocToMd(mdToPmDoc('\n\n\na\n\n\n\n'))).toBe('a\n');
  });

  it('unbolds a line that started as a heading', () => {
    // She cannot tell a heading from bold text here, and styles.css says why:
    // "so bold and a heading are one look". So Cmd+B on a heading takes the
    // heading off rather than adding an invisible bold mark on top of it.
    const schema = getSchema(buildExtensions('Write anything…', { tables: false }));
    const caretIn = (md) => {
      const st = EditorState.create({ schema, doc: schema.nodeFromJSON(mdToPmDoc(md)) });
      return st.apply(st.tr.setSelection(TextSelection.create(st.doc, 1)));
    };
    let state = caretIn('### This week\n');
    expect(state.doc.firstChild.type.name).toBe('heading');
    expect(unboldHeading(state, (tr) => { state = state.apply(tr); })).toBe(true);
    expect(state.doc.firstChild.type.name).toBe('paragraph');
    expect(pmDocToMd(state.doc.toJSON())).toBe('This week\n');
  });

  it('takes the bold written inside that heading off with it', () => {
    // `## **Both**` is one look, not two, so one press has to clear both or the
    // line still comes back bold and she presses it again for nothing.
    const schema = getSchema(buildExtensions('Write anything…', { tables: false }));
    const st0 = EditorState.create({ schema, doc: schema.nodeFromJSON(mdToPmDoc('### **This week**\n')) });
    let state = st0.apply(st0.tr.setSelection(TextSelection.create(st0.doc, 1)));
    unboldHeading(state, (tr) => { state = state.apply(tr); });
    expect(pmDocToMd(state.doc.toJSON())).toBe('This week\n');
  });

  it('leaves ordinary bold alone, so Cmd+B still bolds a plain line', () => {
    // It returns false on anything that is not a heading, which is what hands
    // the key back to the editor's own Bold.
    const schema = getSchema(buildExtensions('Write anything…', { tables: false }));
    const st0 = EditorState.create({ schema, doc: schema.nodeFromJSON(mdToPmDoc('This week\n')) });
    const state = st0.apply(st0.tr.setSelection(TextSelection.create(st0.doc, 1)));
    expect(unboldHeading(state, () => { throw new Error('nothing should have been dispatched'); })).toBe(false);
  });

  it('has no table in the sidebar, and still has one everywhere else', () => {
    const rail = buildExtensions('Write anything…', { tables: false }).map((e) => e.name);
    const pane = buildExtensions('Write anything…').map((e) => e.name);
    expect(rail).not.toContain('table');
    expect(pane).toContain('table');
    // Everything else she types is the same set in both.
    for (const kept of ['underline', 'taskList', 'taskItem', 'link', 'arrows']) {
      expect(rail, kept).toContain(kept);
    }
  });
});

// These read the component's source rather than mounting it, which is what the
// rest of this file does with the CSS. What they are actually holding is a set
// of ways the user's words could go missing without the panel looking wrong, and each
// one is a real hazard of seeding an editor from a value that arrives late.
describe('the description is hers to edit, and it is the note', () => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../renderer/src/components/RailNote.tsx'),
    'utf8',
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const rail = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../renderer/src/components/Rail.tsx'),
    'utf8',
  ).replace(/^\s*\/\/.*$/gm, '');

  it('has no label on it at all, because she took the word off', () => {
    expect(code).not.toMatch(/>Notes</);
    expect(code).not.toMatch(/rail-section-label/);
  });

  it('is handed the description, and the panel no longer draws it separately', () => {
    expect(code).toMatch(/oneLiner/);
    expect(rail).toMatch(/oneLiner=\{/);
    expect(rail).not.toMatch(/rail-oneliner/);
  });

  // THE FILE IS ONLY EVER WHAT THE USER TYPED. Opening a card is not typing, so
  // a product never written on must not get a pinned.md full of something an
  // agent wrote about it; until the user changes something, a fresher
  // description still wins.
  it('shows the description without writing it to her disk', () => {
    const seedLine = /const seed = text \? '' : \(liner\.current \?\? ''\)\.trim\(\);/;
    expect(code).toMatch(seedLine);
    // The seed reaches the editor and the pending buffer, and never onDisk.
    expect(code).toMatch(/onDisk\.current = text;/);
    expect(code).not.toMatch(/onDisk\.current = seed/);
    // And nothing saves on the way in.
    const swap = code.slice(code.indexOf('const swap = async'), code.indexOf('void swap();'));
    expect(swap).not.toMatch(/saveRailNote/);
  });

  // She clears the seeded line to nothing. The text and the file are then both
  // empty, so a plain "no change" guard would skip the save and the description
  // would come back the next time she opened the product. Deleting has to stick.
  it('writes an emptied note even though the file was already empty', () => {
    expect(code).toMatch(/if \(md === onDisk\.current && !seeded\.current\)/);
    expect(code).toMatch(/seeded\.current = false;/);
  });

  // The description is read out of the dashboard fold and usually arrives after
  // the panel does, so there is a second effect that seeds late. If she started
  // typing into the empty note in that gap, it must do nothing.
  it('never overwrites what she has already typed when the description lands', () => {
    const late = code.slice(code.indexOf('liner.current = oneLiner;'));
    expect(late).toMatch(/if \([^)]*!wantsSeed\.current \|\| dirty\.current \|\| onDisk\.current\)/);
  });

  // And the load itself must not re-run when the description changes, or the
  // file would be read back over whatever she was in the middle of writing.
  it('does not reload the file every time the description changes', () => {
    const deps = /\}, \[product, editor\]\);/;
    expect(code).toMatch(deps);
    expect(code).not.toMatch(/\}, \[product, editor, oneLiner\]\);/);
  });
});
