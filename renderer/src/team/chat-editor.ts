// THE REPLY BOX IN A CHAT SHOWS ITS FORMATTING (w-0d55a2b160).
//
// The box was a plain text field, so the formatting bar wrote markdown into it
// and the person writing saw the marks: "When I hit Command-B, Command-I, or
// anything else that I would think would change the font, allow me to adjust
// it. It's not happening. ... if I paste rich text formatting in here, it
// doesn't format. It just shows, let's say, `**`". It is now the editor the
// document pane and the sidebar note already run (../editor/), set up for a
// message: bold is bold while you type it, ⌘B and the rest work, and pasted
// rich text keeps its bold.
//
// WHAT GOES OUT IS STILL MARKDOWN, because that is what a message has always
// been: the thread draws it, an agent reads it, a draft is saved as it. This
// file is the half that has no DOM in it — the editor's set, the markdown in and
// out, what each formatting key does, and where a character sits — so a test
// can hold all of it. ./RichReply.tsx is the box itself.
import { Extension, getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { lift, toggleMark, wrapIn } from '@tiptap/pm/commands';
import { liftListItem, wrapInList } from '@tiptap/pm/schema-list';
import type { Node as PmNode, Schema } from '@tiptap/pm/model';
import { mdToPmDoc, pmDocToMd } from '../editor/markdown';
import type { Format } from './compose-format';

type Json = Record<string, any>;

// ONE LINE BREAK, NOT A NEW PARAGRAPH. Return in a message is a new line, the
// way it was in the text field, so a run of paragraphs goes out as lines one
// newline apart and an empty paragraph between them is the blank line it looks
// like. The thread honours those breaks (`.chat-msg .msg-body.typed` in
// ./chat.css).
const lineJoin = (blocks: Json[]): Json[] => {
  const out: Json[] = [];
  let run: Json[] | null = null;
  for (const block of blocks) {
    if (block.type !== 'paragraph') { run = null; out.push(block); continue; }
    if (run) run.push({ type: 'hardBreak' }, ...(block.content ?? []));
    else { run = [...(block.content ?? [])]; out.push({ type: 'paragraph', content: run }); }
  }
  return out;
};

/** The box's document as the markdown a message is sent as. */
export function chatMarkdown(doc: Json): string {
  // Without the newline a file ends on, or a Return pressed at the very end:
  // a message is not a file.
  return pmDocToMd({ ...doc, content: lineJoin(doc?.content ?? []) }).replace(/\n+$/, '');
}

/**
 * Markdown as a document the chat box can hold. What the box has no node for —
 * a heading, a table, a task list, a picture — comes in as its words, because a
 * draft saved by the old text field may carry any of them and none of it may
 * be lost on the way back in.
 */
export function chatDoc(md: string, schema: Schema = chatSchema()): Json {
  const fit = (node: Json): Json[] => {
    if (node.type === 'text') return [{ ...node, marks: (node.marks ?? []).filter((m: Json) => schema.marks[m.type]) }];
    if (schema.nodes[node.type]) return [{ ...node, content: node.content?.flatMap(fit) }];
    if (node.type === 'image') return [{ type: 'paragraph', content: [{ type: 'text', text: `![${node.attrs?.alt ?? ''}](${node.attrs?.src ?? ''})` }] }];
    const kids = (node.content ?? []).flatMap(fit);
    // A heading's words are a paragraph; a table or a task list is its rows.
    return kids.some((k: Json) => k.type === 'text' || k.type === 'hardBreak') ? [{ type: 'paragraph', content: kids }] : kids;
  };
  const doc = mdToPmDoc(md);
  const blocks = (doc.content ?? []).flatMap(fit).filter((n: Json) => n.type !== 'text');
  // Two paragraphs in markdown stood a blank line apart, and in this box a
  // blank line is an empty paragraph (`lineJoin`), so it is put back between
  // them or "one\n\nthree" would come back as two lines touching.
  const content = blocks.flatMap((n: Json, i: number) => (
    i && n.type === 'paragraph' && blocks[i - 1].type === 'paragraph' ? [{ type: 'paragraph' }, n] : [n]));
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

// WHAT EACH FORMAT DOES TO THE DOCUMENT, as a plain ProseMirror command so it
// runs against a bare EditorState in a test. The keys and the bar both come
// through here, so ⌘B and the B button cannot do two different things.
type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

const inside = (state: EditorState, name: string) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d -= 1) if ($from.node(d).type.name === name) return true;
  return false;
};

export function formatCommand(what: Exclude<Format, 'link'>, schema: Schema): Command {
  const { marks, nodes } = schema;
  switch (what) {
    case 'bold': return toggleMark(marks.bold);
    case 'italic': return toggleMark(marks.italic);
    case 'strike': return toggleMark(marks.strike);
    case 'code': return toggleMark(marks.code);
    // A LIST OR A QUOTE PRESSED AGAIN TAKES IT OFF, the rule the text field's
    // bar had (./compose-format.ts), so there is always a way back.
    case 'bullet':
    case 'number': {
      const list = what === 'bullet' ? nodes.bulletList : nodes.orderedList;
      return (state, dispatch) => (inside(state, list.name)
        ? liftListItem(nodes.listItem)(state, dispatch)
        : wrapInList(list)(state, dispatch));
    }
    case 'quote': return (state, dispatch) => (inside(state, 'blockquote') ? lift(state, dispatch) : wrapIn(nodes.blockquote)(state, dispatch));
  }
}

/**
 * THE KEYS, SLACK'S. ⌘B and ⌘I are what she pressed; the rest are the ones
 * Slack uses for the same buttons, so a hand that knows Slack's knows these.
 * The editor already has ⌘B, ⌘I and ⌘E for code and ⌘⇧7/⌘⇧8 for the lists;
 * these are added beside them, never instead.
 */
export const CHAT_KEYS: Record<string, Exclude<Format, 'link'>> = {
  'Mod-b': 'bold',
  'Mod-i': 'italic',
  'Mod-Shift-x': 'strike',
  'Mod-Shift-c': 'code',
  'Mod-Shift-7': 'number',
  'Mod-Shift-8': 'bullet',
  'Mod-Shift-9': 'quote',
};

const ChatKeys = Extension.create({
  name: 'chatKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    const keys: Record<string, () => boolean> = {};
    for (const [key, what] of Object.entries(CHAT_KEYS)) {
      keys[key] = () => formatCommand(what, this.editor.schema)(this.editor.state, this.editor.view.dispatch);
    }
    return keys;
  },
});

// WHERE A CHARACTER SITS. The @ menu (./ChatAgents.tsx) was written against a
// text field and counts in characters of the words; the editor counts in
// document positions, where every paragraph and every mark-free boundary costs
// one. The words here are the document's text, a line per paragraph, with a
// line break as a newline: what somebody reading the box sees, and so what an
// @ query is found in.
type Run = { pos: number; at: number; size: number };

function runsOf(doc: PmNode): { runs: Run[]; length: number } {
  const runs: Run[] = [];
  let at = 0;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (runs.length) at += 1;
    // Inside a text block every character and every inline leaf (a line
    // break) is exactly one position, so a run counts the same in both.
    runs.push({ pos: pos + 1, at, size: node.content.size });
    at += node.content.size;
    return false;
  });
  return { runs, length: at };
}

/** The box's words, as somebody reading it sees them. */
export function plainOf(doc: PmNode): string {
  const lines: string[] = [];
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    lines.push(node.textBetween(0, node.content.size, undefined, (leaf) => (leaf.type.name === 'hardBreak' ? '\n' : '￼')));
    return false;
  });
  return lines.join('\n');
}

/** A document position as an offset into `plainOf`. */
export function plainAt(doc: PmNode, pos: number): number {
  const { runs, length } = runsOf(doc);
  for (const run of runs) {
    if (pos < run.pos) return run.at;
    if (pos <= run.pos + run.size) return run.at + (pos - run.pos);
  }
  return length;
}

/** An offset into `plainOf` as a document position. */
export function posAt(doc: PmNode, at: number): number {
  const { runs } = runsOf(doc);
  for (const run of runs) if (at <= run.at + run.size) return run.pos + Math.max(0, at - run.at);
  const last = runs[runs.length - 1];
  return last ? last.pos + last.size : 0;
}

/** The one edit that turns `was` into `next`: what to cut and what to put in. */
export function spliceOf(was: string, next: string): { from: number; to: number; insert: string } {
  let head = 0;
  while (head < was.length && head < next.length && was[head] === next[head]) head += 1;
  let tail = 0;
  while (tail < was.length - head && tail < next.length - head && was[was.length - 1 - tail] === next[next.length - 1 - tail]) tail += 1;
  return { from: head, to: was.length - tail, insert: next.slice(head, next.length - tail) };
}

// A MENTION OF AN AGENT IS DRAWN AS A CHIP ON THE WORDS THEMSELVES. In the
// text field the chips were a second copy of the text drawn behind it; here
// they are marks the editor draws on its own words, so they cannot drift.
export const mentionKey = new PluginKey<DecorationSet>('chatMentions');
export type MentionSpan = { start: number; end: number; loose: boolean };

const Mentions = Extension.create({
  name: 'chatMentions',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: mentionKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, set) => {
          const spans = tr.getMeta(mentionKey) as MentionSpan[] | undefined;
          if (!spans) return set.map(tr.mapping, tr.doc);
          return DecorationSet.create(tr.doc, spans.map((m, i) => Decoration.inline(
            posAt(tr.doc, m.start), posAt(tr.doc, m.end),
            { class: `mention-chip${m.loose ? ' loose' : ''}`, 'data-mention': String(i) },
          )));
        },
      },
      props: { decorations: (state) => mentionKey.getState(state) },
    })];
  },
});

/** The chat box's editor: the document pane's, cut down to what a message holds. */
export function chatExtensions(placeholder: string | (() => string) = '') {
  return [
    // No headings and no rule: a message is not a document. Pasted ones come
    // in as their words (`chatDoc`).
    StarterKit.configure({ heading: false, horizontalRule: false }),
    Link.configure({ openOnClick: false, autolink: true }),
    // A function so the box can say who it replies to without being rebuilt.
    Placeholder.configure({ placeholder: typeof placeholder === 'function' ? () => placeholder() : placeholder }),
    ChatKeys,
    Mentions,
  ];
}

let schemaOnce: Schema | null = null;
export function chatSchema(): Schema {
  return (schemaOnce ??= getSchema(chatExtensions()));
}

/**
 * PLAIN TEXT THAT IS REALLY MARKDOWN. Copying out of a chat with an AI, or out
 * of a terminal, gives text with the marks in it and no rich copy beside it;
 * that is the paste that showed `**`. It is read as markdown only when it
 * carries a mark that cannot be anything else — paired bold, a markdown link,
 * or a list or quote at the start of a line — so a pasted command with a glob
 * in it stays exactly the characters it was.
 */
export function readsAsMarkdown(text: string): boolean {
  return /\*\*[^*\s](?:[^*\n]*[^*\s])?\*\*/.test(text)
    || /~~[^~\s](?:[^~\n]*[^~\s])?~~/.test(text)
    || /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/.test(text)
    || /(^|\n)\s*(?:[-*]|\d+\.)\s+\S[^\n]*\n\s*(?:[-*]|\d+\.)\s+\S/.test(text)
    || /(^|\n)>\s+\S/.test(text);
}
