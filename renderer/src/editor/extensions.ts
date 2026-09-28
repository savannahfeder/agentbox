/*
 * extensions.ts — the doc editor's TipTap extension set, modeled on Crown's
   Studio editor (the one the founder tuned): StarterKit with markdown input rules
   (## headings, **bold**, - bullets, 1. numbered), task lists ([ ] / [x]),
   underline (Cmd+U — StarterKit omits it), and "type an arrow, get an arrow"
   (-> becomes →, one Backspace undoes it). */
import { Mark, Node, Extension, mergeAttributes, textInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    underline: {
      setUnderline: () => ReturnType;
      unsetUnderline: () => ReturnType;
      toggleUnderline: () => ReturnType;
    };
  }
}

// Same ~30-line shape as @tiptap/extension-underline (ported from Crown):
// render/parse <u> plus text-decoration spans so pasted underlines survive.
export const Underline = Mark.create({
  name: 'underline',
  parseHTML() {
    return [
      { tag: 'u' },
      { style: 'text-decoration', consuming: false, getAttrs: (style) => ((style as string).includes('underline') ? {} : false) },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setUnderline: () => ({ commands }) => commands.setMark(this.name),
      unsetUnderline: () => ({ commands }) => commands.unsetMark(this.name),
      toggleUnderline: () => ({ commands }) => commands.toggleMark(this.name),
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-u': () => this.editor.commands.toggleUnderline(),
      'Mod-U': () => this.editor.commands.toggleUnderline(),
    };
  },
});

// ⌘B ON A HEADING TAKES THE HEADING OFF.
//
// She is right about the cause and right about the remedy. In the sidebar note
// a heading and bold text are deliberately drawn as ONE look — 13.5px, weight
// 600, `--text-dim` for both, and `styles.css` says so out loud. So there is
// nothing on screen that tells her which of the two a line is, and there is no
// reason she should have to remember.
//
// Now the first press turns the heading back into an ordinary paragraph and
// clears any bold inside it, so the line stops looking bold, once, whatever it
// started as. Pressing it again bolds the paragraph the ordinary way, so
// nothing is one-way. Outside a heading this returns false and StarterKit's own
// Bold handles the key exactly as before.
//
// It is a plain ProseMirror command rather than a TipTap chain so it can be run
// against a bare EditorState in a test, with no DOM and no editor view.
export function unboldHeading(state: any, dispatch?: (tr: any) => void): boolean {
  const heading = state.schema.nodes.heading;
  const paragraph = state.schema.nodes.paragraph;
  if (!heading || !paragraph) return false;
  const { from, to } = state.selection;
  const found: { node: any; pos: number }[] = [];
  state.doc.nodesBetween(from, to, (node: any, pos: number) => {
    if (node.type === heading) found.push({ node, pos });
  });
  if (!found.length) return false;
  if (dispatch) {
    const { tr } = state;
    const bold = state.schema.marks.bold;
    for (const { node, pos } of found) {
      // A heading and a paragraph are both text blocks of the same size, so
      // nothing shifts under us and the positions stay good.
      tr.setNodeMarkup(pos, paragraph, {}, node.marks);
      if (bold && node.content.size) tr.removeMark(pos + 1, pos + 1 + node.content.size, bold);
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
}

// The key binding for the above. `priority` puts it ahead of StarterKit's Bold
// in the keymap chain; returning false hands the key straight back to it.
export const UnboldHeading = Extension.create({
  name: 'unboldHeading',
  priority: 1000,
  addKeyboardShortcuts() {
    const run = () => unboldHeading(this.editor.state, this.editor.view.dispatch);
    return { 'Mod-b': run, 'Mod-B': run };
  },
});

// "->"/"-->" → "→", "<-"/"<--" → "←" as you type (Crown's rule table; the
// deliberately small, unambiguous set — no => / <= which collide with code).
export const Arrows = Extension.create({
  name: 'arrows',
  addInputRules() {
    return [
      textInputRule({ find: /--?>$/, replace: '→' }),
      textInputRule({ find: /<--?$/, replace: '←' }),
    ];
  },
});

// A minimal block image node (hand-rolled like Underline, so no new dep): it
// round-trips ![alt](src) through markdown.ts and renders a plain <img>. src is
// a creation-file:// URL written by creation:save-image; the founder pastes or
// drops an image and it lands as a real file beside the doc.
export const Image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },
});

/*
 * `tables` is off for the sidebar note and on everywhere else.
   The rail's column is 298px, a table cannot be narrowed to fit one, and the
   only two ways that ends are a panel wider than its own words or a row of
   cells running off the edge. Nothing else about the set changes: the same
   markdown, the same input rules, the same file on disk either way. */
export function buildExtensions(placeholder: string, { tables = true }: { tables?: boolean } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    UnboldHeading,
    Arrows,
    Image,
    Link.configure({ openOnClick: false, autolink: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    ...(tables ? [Table.configure({ resizable: false }), TableRow, TableHeader, TableCell] : []),
    Placeholder.configure({ placeholder }),
  ];
}
