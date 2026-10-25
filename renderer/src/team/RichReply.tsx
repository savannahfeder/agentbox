// THE REPLY BOX IN A CHAT, AS AN EDITOR THAT SHOWS ITS FORMATTING
// (w-0d55a2b160). ./chat-editor.ts holds the reasons and everything testable;
// this is the box.
//
// IT STANDS IN FOR THE TEXT FIELD IT REPLACED, ON PURPOSE. The reply box around
// it (Focus.tsx's DockComposer, ./ThreadPanel.tsx) and the @ menu
// (./ChatAgents.tsx) were all written against a <textarea>: they read its
// `value` and `selectionStart`, call `setSelectionRange` and `focus`, measure
// its height and grow it. So the element this hands back answers those same
// questions, in characters of the words somebody sees, and the code around it
// keeps working unchanged. Its `rich` is the one thing a textarea never had:
// the formatting bar asks the editor to bold rather than typing asterisks.
import { useEffect, useRef, type MutableRefObject } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { chatDoc, chatExtensions, chatMarkdown, formatCommand, mentionKey, plainAt, plainOf, posAt, readsAsMarkdown, spliceOf, type MentionSpan } from './chat-editor';
import type { Format } from './compose-format';

/** What the formatting bar can ask of the box. */
export type RichControl = {
  format: (what: Exclude<Format, 'link'>) => void;
  /** Make the selection a link, or put the address in as one when nothing is selected. */
  link: (href: string) => void;
  /** Put text in at the caret, the way typing it would: an @ or an emoji. */
  insert: (text: string) => void;
  /** Replace the words with these, editing only what differs, so the formatting around it stays. */
  setPlain: (next: string) => void;
};

/** The box's element, answering a text field's questions. */
export type RichBox = HTMLDivElement & {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  setSelectionRange: (from: number, to: number) => void;
  rich: RichControl;
};

/** Pasted plain text, a line to a paragraph, so its blank lines survive. */
const linesOf = (text: string) => text.replace(/\r\n?/g, '\n').split('\n').map((line) => (
  line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }));

export function RichReply({ value, onChange, onPlain, placeholder, className, boxRef, mentions, onKeyDown, onFiles, onCaret, onClick, label }: {
  /** The message as markdown, which is what is saved and sent. */
  value: string;
  onChange: (markdown: string) => void;
  /** The words as somebody reading the box sees them, for the @ menu. */
  onPlain?: (plain: string) => void;
  placeholder: string;
  className: string;
  boxRef: MutableRefObject<HTMLTextAreaElement | null> | MutableRefObject<RichBox | null>;
  /** Agent mentions to draw as chips, in characters of the words. */
  mentions?: MentionSpan[];
  /** The box's keys go here first; true means the key was taken. */
  onKeyDown?: (e: KeyboardEvent) => boolean;
  /** Files pasted or dropped: they are attachments, not text. */
  onFiles?: (files: File[]) => void;
  onCaret?: (box: RichBox) => void;
  onClick?: (box: RichBox) => void;
  label?: string;
}) {
  const wrap = useRef<RichBox | null>(null);
  const said = useRef(placeholder);
  said.current = placeholder;
  // The markdown this box last handed up. A `value` that differs from it came
  // from outside — a draft restored, the box emptied by a send, a command
  // picked off the slash menu — and is loaded; one that matches is our own
  // keystroke coming back, and loading it would throw the caret to the end.
  const handed = useRef(value);
  // The handlers change every render; the editor is made once.
  const live = useRef({ onChange, onPlain, onKeyDown, onFiles, onCaret });
  live.current = { onChange, onPlain, onKeyDown, onFiles, onCaret };

  const filesIn = (list: FileList | DataTransferItemList | undefined | null) => {
    const files: File[] = [];
    for (const one of Array.from((list ?? []) as ArrayLike<File | DataTransferItem>)) {
      if ('kind' in one) { if (one.kind === 'file') { const f = one.getAsFile(); if (f) files.push(f); } }
      else files.push(one);
    }
    return files;
  };

  const editor = useEditor({
    extensions: chatExtensions(() => said.current),
    content: chatDoc(value),
    editorProps: {
      attributes: { class: 'rich-reply-doc', 'aria-label': label ?? placeholder, 'aria-multiline': 'true', role: 'textbox' },
      handleKeyDown: (_view, event) => {
        if (event.isComposing) return false;
        return live.current.onKeyDown?.(event) ?? false;
      },
      handlePaste: (_view, event) => {
        const data = event.clipboardData;
        const files = filesIn(data?.items);
        if (files.length) { live.current.onFiles?.(files); return true; }
        // Rich text is the editor's own to read: bold stays bold.
        if (data?.getData('text/html')) return false;
        const text = data?.getData('text/plain') ?? '';
        if (readsAsMarkdown(text)) { editorOf.current?.commands.insertContent(chatDoc(text).content); return true; }
        if (text.includes('\n')) { editorOf.current?.commands.insertContent(linesOf(text)); return true; }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = filesIn((event as DragEvent).dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        live.current.onFiles?.(files);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = chatMarkdown(ed.getJSON());
      handed.current = md;
      live.current.onPlain?.(plainOf(ed.state.doc));
      live.current.onChange(md);
      if (wrap.current) live.current.onCaret?.(wrap.current);
    },
    onSelectionUpdate: () => { if (wrap.current) live.current.onCaret?.(wrap.current); },
  });
  const editorOf = useRef<Editor | null>(null);
  editorOf.current = editor;

  // A VALUE FROM OUTSIDE IS LOADED, with the caret at the end of it.
  useEffect(() => {
    if (!editor || value === handed.current) return;
    handed.current = value;
    editor.commands.setContent(chatDoc(value), false);
    editor.commands.focus('end');
    onPlain?.(plainOf(editor.state.doc));
  }, [value, editor]);

  // The words once, for whoever counts in them, before the first keystroke.
  useEffect(() => { if (editor) onPlain?.(plainOf(editor.state.doc)); }, [editor]);

  // THE CHIPS FOLLOW THE MENTIONS. Sent only when they change, because each
  // send is a transaction and a transaction is a render.
  const sentSpans = useRef('');
  useEffect(() => {
    const key = JSON.stringify(mentions ?? []);
    if (!editor || key === sentSpans.current) return;
    sentSpans.current = key;
    editor.view.dispatch(editor.state.tr.setMeta(mentionKey, mentions ?? []));
  }, [mentions, editor]);

  const control: RichControl = {
    format: (what) => {
      const ed = editorOf.current;
      if (!ed) return;
      formatCommand(what, ed.schema)(ed.state, ed.view.dispatch);
      ed.commands.focus();
    },
    link: (href) => {
      const ed = editorOf.current;
      if (!ed || !href.trim()) return;
      const url = /^[a-z][a-z0-9+.-]*:/i.test(href.trim()) ? href.trim() : `https://${href.trim()}`;
      if (ed.state.selection.empty) {
        ed.chain().focus().insertContent({ type: 'text', text: href.trim(), marks: [{ type: 'link', attrs: { href: url } }] }).run();
      } else {
        ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      }
    },
    insert: (text) => { editorOf.current?.chain().focus().insertContent(text).run(); },
    setPlain: (next) => {
      const ed = editorOf.current;
      if (!ed) return;
      const doc = ed.state.doc;
      const cut = spliceOf(plainOf(doc), next);
      const from = posAt(doc, cut.from);
      const to = posAt(doc, cut.to);
      const tr = cut.insert ? ed.state.tr.insertText(cut.insert, from, to) : ed.state.tr.delete(from, to);
      ed.view.dispatch(tr);
    },
  };

  // The element the code around this reaches for, answering as a text field.
  const attach = (el: HTMLDivElement | null) => {
    const box = el as RichBox | null;
    wrap.current = box;
    (boxRef as MutableRefObject<RichBox | null>).current = box;
    if (!box || 'rich' in box) return;
    const doc = () => editorOf.current?.state.doc;
    Object.defineProperties(box, {
      value: { configurable: true, get: () => { const d = doc(); return d ? plainOf(d) : ''; } },
      selectionStart: { configurable: true, get: () => { const d = doc(); return d ? plainAt(d, editorOf.current!.state.selection.from) : 0; } },
      selectionEnd: { configurable: true, get: () => { const d = doc(); return d ? plainAt(d, editorOf.current!.state.selection.to) : 0; } },
      setSelectionRange: { configurable: true, value: (from: number, to: number) => {
        const ed = editorOf.current;
        if (!ed) return;
        const d = ed.state.doc;
        ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(d, posAt(d, from), posAt(d, to))));
      } },
      focus: { configurable: true, value: () => { editorOf.current?.commands.focus(); } },
      blur: { configurable: true, value: () => { editorOf.current?.commands.blur(); } },
      rich: { configurable: true, get: () => control },
    });
  };

  return (
    <div
      ref={attach}
      className={`${className} rich-reply`}
      onClick={() => { if (wrap.current) onClick?.(wrap.current); }}
      // A click on the padding round the words still puts the caret in them.
      onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); editor?.commands.focus('end'); } }}
      onDragOver={(e) => e.preventDefault()}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
