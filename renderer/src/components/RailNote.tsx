// THE SIDEBAR YOU CAN TYPE INTO.
//
// It replaces keeping a note alive with a repeating task, and the test it has
// to pass is that the most important line of the week is on screen without
// asking anyone for it.
//
// NOTHING HERE IS NEW MACHINERY. The editor is the same one the document pane
// runs (`editor/extensions.ts`, `editor/markdown.ts`), which was tuned in the
// old app and is reused rather than rebuilt: hyphen-space becomes a bullet,
// `##` a heading, `**` bold, `[ ]` a task, `->` an arrow. The note is markdown
// on disk, in the product's own folder, so the note is a file an agent can be
// pointed at rather than a blob in a settings store (main/rail-note.mjs).
//
// WHAT IT DELIBERATELY DOES NOT HAVE, and each one is a design rule rather
// than a corner cut: • No toolbar, no formatting buttons, no menu. The
// formatting is in the typing, the way it already is in the document pane, and
// a row of icons in a panel whose whole job is quiet re-orientation is the
// densest thing on the screen. • No box, no border, no card. The panel is the
// wall, not the object. A text field drawn as a field would be the
// only outlined thing in the window. • No save button, no saved-at line, no
// unsaved mark. It writes itself 900ms after she stops, on blur, and on the way
// out. The red unsaved dot in the footer was already removed once for being
// stressful, and nothing like it comes back here. • No title, no second note,
// no list of notes. One note per product. There is not even a label on it any
// more: it said "Notes" for one round and the word came off. A panel
// with one editable region in it does not need to be told what the editable
// region is. • No tables. The column is 298px wide and a table cannot be made
// to fit it, so the one thing the shared editor can draw that this panel cannot
// hold is switched off rather than left to overflow. • Nothing animates.
//
// THE ONE THING IT SAYS OUT LOUD is a save that failed, through the app's own
// toast, because a note that quietly stops saving is the user's words being
// thrown away by a panel that looks fine.
//
// This note stands where it stood.
//
// WHAT THAT MEANS IN PRACTICE, and the alternative it was chosen over: a
// product she has never written on opens with its description already in the
// editor, hers to keep, edit or delete. It is NOT written to disk on the way
// in — opening a card is not typing — so nothing is created in a product's
// folder until she actually changes something, and until then a fresher
// description from `dashboard.jsonl` still wins. The moment she touches it the
// file is the truth and the description stops feeding it, because a line she
// has rewritten is not one an agent should be able to overwrite.
//
// The alternative was to keep the description as its own uneditable line and
// simply drop the "Notes" label off the note below. That is two text blocks
// where one is wanted, and it leaves the one-liner exactly as unchangeable
// as it was, which is the problem this solves.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { buildExtensions } from '../editor/extensions';
import { mdToPmDoc, pmDocToMd } from '../editor/markdown';
import { api } from '../api';

const SAVE_DEBOUNCE_MS = 900;

// SHE IS NOT TOLD WHAT TO PUT IN IT.
const PLACEHOLDER = 'Write anything…';

export function RailNote({ product, oneLiner, onNotice }: {
  product: string;
  oneLiner: string | null;
  onNotice: (text: string) => void;
}) {
  // The bytes as the file last had them, so our own save echoing back, or a
  // switch to another product and straight back again, never resets what she is
  // typing.
  const onDisk = useRef('');
  // HER MARKDOWN IS TAKEN AT THE KEYSTROKE, NOT AT THE SAVE, and that is what
  // makes the last write safe. The editor is destroyed when this panel goes
  // away, so a flush on the way out that reached into it would be reading a
  // dead editor; it reads this instead and cannot fail.
  const pending = useRef<string | null>(null);
  const dirty = useRef(false);
  // TRUE WHILE THE EDITOR IS SHOWING THE DESCRIPTION AND THE FILE IS STILL
  // EMPTY. It exists for one case that would otherwise be silent: she clears
  // the seeded line to nothing, the text and the file are then both empty, the
  // save short-circuits as "no change", and the description comes back the next
  // time she opens the product. Deleting it has to stick, so while this is set
  // an edit always writes, even an edit down to nothing.
  const seeded = useRef(false);
  // Set when a note loads empty and there was no description to hand yet.
  const wantsSeed = useRef(false);
  // The freshest description, read inside the load without making the load
  // re-run every time the dashboard fold answers. A re-run would reload the
  // file underneath whatever she was in the middle of typing.
  const liner = useRef(oneLiner);
  const saveTimer = useRef<number | null>(null);
  const slug = useRef(product);
  const [ready, setReady] = useState(false);

  const extensions = useMemo(() => buildExtensions(PLACEHOLDER, { tables: false }), []);

  // WHICH PRODUCT THIS TEXT BELONGS TO IS CAPTURED WHEN THE SAVE IS ARMED, not
  // when it lands. She clicks a row of another product while the timer is still
  // counting, `product` has already changed, and without this her Agentbox note is
  // written onto Crown's file. Nothing on screen would look wrong afterwards.
  const save = async (forSlug = slug.current) => {
    if (!dirty.current) return;
    const md = pending.current ?? '';
    if (md === onDisk.current && !seeded.current) { dirty.current = false; return; }
    dirty.current = false;
    const res = await api.saveRailNote({ product: forSlug, text: md });
    if (res.ok) {
      if (forSlug === slug.current) { onDisk.current = md; seeded.current = false; }
    } else {
      // Keep it armed and SAY SO. A note that fails to save in silence is the
      // app losing the user's words while still showing them back.
      dirty.current = true;
      onNotice(res.error ?? 'That note could not be saved.');
    }
  };

  const editor = useEditor({
    extensions,
    content: '',
    editable: true,
    // NO SPELLCHECK, AND IT IS A DESIGN RULE RATHER THAN A PREFERENCE.
    // Measured on the first shot of this panel: "DAU" came back underlined in
    // red the moment it was typed, and a note like this is mostly product names,
    // initials and shorthand, so it would rarely be anything else.
    editorProps: { attributes: { spellcheck: 'false' } },
    onUpdate: ({ editor: ed }) => {
      pending.current = pmDocToMd(ed.getJSON() as any).trim();
      dirty.current = true;
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => { void save(); }, SAVE_DEBOUNCE_MS);
    },
  });

  // OPENING ANOTHER PRODUCT WRITES THE OLD NOTE FIRST, then loads the new one.
  // The order is the whole of it: reading first would put someone else's words
  // in the editor while hers were still unwritten.
  useEffect(() => {
    if (!editor) return;
    let alive = true;
    const previous = slug.current;
    if (saveTimer.current != null) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    const swap = async () => {
      if (previous !== product) await save(previous);
      slug.current = product;
      setReady(false);
      const res = await api.railNote(product);
      if (!alive || slug.current !== product) return;
      const text = res.ok ? (res.text ?? '') : '';
      // AN UNWRITTEN NOTE OPENS ON THE PRODUCT'S OWN DESCRIPTION, which is the
      // line this panel used to print above it and the line that needed to be
      // editable. The file stays empty until she changes something: what is
      // on disk is always what the user typed, never what an agent wrote about the
      // product.
      const seed = text ? '' : (liner.current ?? '').trim();
      onDisk.current = text;
      pending.current = seed || text;
      dirty.current = false;
      seeded.current = !!seed;
      // The description is read out of the dashboard fold, which usually has
      // not answered yet the first time this runs. If it has not, the effect
      // below picks the seeding up when it does.
      wantsSeed.current = !text && !seed;
      editor.commands.setContent(mdToPmDoc(seed || text));
      setReady(true);
      // A preload too old to have the bridge is worth one sentence: the panel
      // would otherwise offer her a box that throws every word away.
      if (!res.ok && res.error) onNotice(res.error);
    };
    void swap();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, editor]);

  // THE DESCRIPTION USUALLY ARRIVES AFTER THE PANEL DOES, so the seeding cannot
  // live in the load alone. This is it only fires on a note that loaded EMPTY
  // (`wantsSeed`), only while the file is still empty, and only while she has
  // not touched the editor. If she started typing into the empty note in the
  // moment before the fold answered, nothing happens.
  useEffect(() => {
    liner.current = oneLiner;
    if (!editor || !wantsSeed.current || dirty.current || onDisk.current) return;
    const seed = (oneLiner ?? '').trim();
    if (!seed) return;
    wantsSeed.current = false;
    seeded.current = true;
    pending.current = seed;
    editor.commands.setContent(mdToPmDoc(seed));
  }, [editor, oneLiner]);

  // The window losing focus, and this panel going away, are the two other
  // moments she has stopped typing. Both write.
  useEffect(() => {
    const flush = () => { void save(); };
    window.addEventListener('blur', flush);
    return () => {
      window.removeEventListener('blur', flush);
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESCAPE PUTS HER BACK IN THE APP. Every single-letter shortcut is dead while
  // the caret is in here (`inInput` in App.tsx), which is correct and also means
  // there has to be a way out that is not the mouse. It writes on the way, and
  // it stops there: the next Escape, with the caret gone, is the app's own and
  // closes whatever she was reading.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    void save();
    editor?.commands.blur();
  };

  return (
    <div className="rail-note" onKeyDown={onKeyDown}>
      <EditorContent
        editor={editor}
        className={`rail-note-body${ready ? '' : ' rail-note-waiting'}`}
      />
    </div>
  );
}
