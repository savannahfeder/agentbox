// A MARKDOWN FILE YOU CAN TYPE INTO. Ported from the old app, not rebuilt.
//
// So this is the old app's `renderer/src/views/DocEditor.tsx` moved across, with
// its two supporting files (`editor/extensions.ts`, `editor/markdown.ts`) taken
// verbatim. Hyphen-space becomes a bullet, `##` a heading, `**` bold, `1.` a
// numbered list, `[ ]` a task, `->` an arrow. None of that is written here.
//
// WHAT CHANGED IN THE PORT, and why:
//   - The file is the document. That app saved a creation by id through its own
//     IPC; here the pane already has a path, and main writes markdown straight
//     onto it (main/doc-file.mjs).
//   - Pasting an image is gone. That app wrote it into the doc's own assets/
//     folder through an IPC the app does not have, and inventing one would be a
//     second feature inside this one. A pasted image lands as text; nothing
//     silently disappears.
//   - The link card's "Visit" hands the url to the app the way every other link
//     in Agentbox is handed over, rather than to an in-app browser tab.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { buildExtensions } from '../editor/extensions';
import { mdToPmDoc, pmDocToMd } from '../editor/markdown';
import { patchOriginal } from '../editor/patch-md';
import { theAppKeepsThisKey } from '../../../shared/artifact-keys.mjs';
import { api } from '../api';

const SAVE_DEBOUNCE_MS = 900;

// A link in the editor never navigates on its own; she gets a hover card with
// the real actions instead. A typed or pasted bare domain becomes a proper URL
// so "Visit" always has something to open.
function normalizeHref(v: string): string {
  const s = v.trim();
  if (!s) return '';
  if (/^(https?:|mailto:)/i.test(s)) return s;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  return `https://${s}`;
}
function prettyHref(h: string): string {
  return h.replace(/^https?:\/\//i, '').replace(/^mailto:/i, '');
}

type LinkPop = { href: string; left: number; top: number; pos: number; pinned: boolean };

export function DocText({ product, src, text, mtime, onSaved, onNotice }: {
  product: string;
  src: string;
  text: string;
  // What was on disk when the pane loaded it. Handed back on every save so a
  // file an agent rewrote underneath her is not silently overwritten.
  mtime: number;
  onSaved: (mtime: number) => void;
  onNotice: (text: string) => void;
}) {
  // THE BYTES ON DISK, which are not the same thing as what the editor makes of
  // them. Compared against incoming `text` so our own save echoing back does not
  // reset the editor and its undo history.
  const onDisk = useRef(text);
  // The same file after a round trip through the editor. This is the yardstick
  // her edit is measured against, so that saving writes back only the lines she
  // actually touched. See `editor/patch-md.ts` for why that matters here and
  // did not matter there: these files are markdown an agent wrote, and two
  // of them are how every session on a product stays in agreement.
  const baseMd = useRef(pmDocToMd(mdToPmDoc(text)));
  const lastMtime = useRef(mtime);
  const dirty = useRef(false);
  const saveTimer = useRef<number | null>(null);
  useEffect(() => { lastMtime.current = mtime; }, [mtime]);

  const extensions = useMemo(() => buildExtensions('Write anything…'), []);

  const editor = useEditor({
    extensions,
    content: mdToPmDoc(text),
    editable: true,
    onUpdate: () => {
      dirty.current = true;
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(save, SAVE_DEBOUNCE_MS);
    },
  });

  const save = async () => {
    if (!editor || !dirty.current) return;
    const md = pmDocToMd(editor.getJSON());
    if (md === baseMd.current) { dirty.current = false; return; }
    dirty.current = false;
    // Her edit spliced back into the file, with every line she did not touch
    // left as the bytes it already was. Null means it could not be placed
    // exactly, and then the editor's own markdown is what gets written: her
    // words are never the thing we drop, and she is told the rest of the file
    // was tidied so it is not a surprise the next time an agent reads it.
    const patched = patchOriginal(onDisk.current, baseMd.current, md);
    const out = patched ?? md;
    const res = await api.writeDoc({ product, src, text: out, mtime: lastMtime.current });
    if (res.ok) {
      onDisk.current = out;
      baseMd.current = md;
      lastMtime.current = res.mtime ?? 0;
      onSaved(res.mtime ?? 0);
      if (patched === null) onNotice('Saved. The rest of the file was reformatted as well.');
    } else {
      // Keep the edits armed for the next attempt, and SAY SO. A save that
      // fails quietly is the app losing the user's words.
      dirty.current = true;
      onNotice(res.error ?? 'That could not be saved.');
    }
  };

  // The document changed under her (an agent rewrote it): take it only when she
  // is not mid-edit, and skip our own save echoing back.
  useEffect(() => {
    if (!editor || text === onDisk.current || dirty.current) return;
    const doc = mdToPmDoc(text);
    onDisk.current = text;
    baseMd.current = pmDocToMd(doc);
    editor.commands.setContent(doc);
  }, [text, editor]);

  // ⌘S SAVES IT NOW.A markdown file was already saving itself on a pause and on
  // losing focus, so nothing here was ever lost — but a save you cannot ASK for
  // is a save you do not know happened, and pressing ⌘S and watching nothing
  // occur is the app telling her it did not work. So it flushes, and it says
  // so.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.key !== 's' && e.key !== 'S')) return;
      e.preventDefault();
      if (saveTimer.current != null) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
      const had = dirty.current;
      void Promise.resolve(save()).then(() => { if (had && !dirty.current) onNotice('Saved.'); });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Closing the pane unmounts this, and the window losing focus is the other
  // moment she has stopped typing. Both flush.
  useEffect(() => {
    const flush = () => { void save(); };
    window.addEventListener('blur', flush);
    return () => {
      window.removeEventListener('blur', flush);
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  /*
   * ---- links: a hover card, not an auto-open. Clicking a link never leaves
     the app; the card offers Visit, Copy, Edit and Remove. ---- */
  const [linkPop, setLinkPop] = useState<LinkPop | null>(null);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const [copied, setCopied] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => { if (closeTimer.current != null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setLinkPop((p) => (p?.pinned ? p : null)), 140);
  };
  const openFor = (a: HTMLAnchorElement, pinned: boolean) => {
    if (!editor) return;
    const href = a.getAttribute('href') || '';
    const rect = a.getBoundingClientRect();
    let pos = 0;
    try { pos = editor.view.posAtDOM(a, 0); } catch { pos = 0; }
    cancelClose();
    setEditing(false);
    setCopied(false);
    setLinkPop({ href, left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)), top: rect.bottom + 6, pos, pinned });
  };
  const anchorAt = (e: React.MouseEvent) => (e.target as HTMLElement).closest?.('a') as HTMLAnchorElement | null;

  const visit = () => {
    if (!linkPop) return;
    const url = linkPop.href;
    api.openArtifactExternally({ product, src: url }).then((r) => {
      if (!r.ok) onNotice(r.error ?? 'That link could not be opened.');
    });
    setLinkPop(null);
  };
  const copyLink = async () => {
    if (!linkPop) return;
    try { await navigator.clipboard.writeText(linkPop.href); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* clipboard blocked */ }
  };
  const startEdit = () => { if (linkPop) { setEditVal(linkPop.href); setEditing(true); setLinkPop({ ...linkPop, pinned: true }); } };
  const applyEdit = () => {
    if (!linkPop || !editor) return;
    const href = normalizeHref(editVal);
    if (href) {
      editor.chain().focus().setTextSelection(linkPop.pos).extendMarkRange('link').setLink({ href }).run();
      setLinkPop({ ...linkPop, href });
    }
    setEditing(false);
  };
  const removeLink = () => {
    if (!linkPop || !editor) return;
    editor.chain().focus().setTextSelection(linkPop.pos).extendMarkRange('link').unsetLink().run();
    setLinkPop(null);
    setEditing(false);
  };

  // A pinned card closes on Escape or a click outside it. Escape is swallowed
  // here so the card goes and the document stays; the pane's own Escape is one
  // step further out (App.tsx).
  useEffect(() => {
    if (!linkPop?.pinned) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.('.link-pop') || t.closest?.('a')) return;
      setLinkPop(null); setEditing(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setLinkPop(null); setEditing(false); }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey, true); };
  }, [linkPop?.pinned]);

  return (
    <div
      className="doc-rich markdown"
      onKeyDown={(e) => {
        // ESCAPE HANDS THE KEYBOARD BACK, and that is the whole of its job in
        // here. One press steps out of the words, the app has its keys again,
        // and the next press closes the file the way it always has. The reply
        // box already works exactly this way (Focus.tsx): escape leaves the
        // box she is typing in rather than throwing the box away.
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          editor?.commands.blur();
          return;
        }
        // Every letter in this app is a shortcut somewhere. While she is typing
        // into a document, none of them are — and the app already knows that by
        // itself, because this editor is a contentEditable and its own guard
        // refuses letters that arrive from one (`inInput`, App.tsx).
        //
        // WHAT THIS LINE USED TO DO WAS SWALLOW EVERYTHING, and the app's own
        // handler is a WINDOW listener, above the React root, so stopping the
        // press here stopped it reaching the app at all. ⌘K, measured dead.
        // So did ⌘S, whose "Saved." notice is a
        // window listener twenty lines up this same file.
        if (!theAppKeepsThisKey(e)) e.stopPropagation();
      }}
      onMouseOver={(e) => {
        const a = anchorAt(e);
        if (!a) return;
        cancelClose();
        if (editing) return;
        if (linkPop && linkPop.href === (a.getAttribute('href') || '')) return;
        openFor(a, linkPop?.pinned ?? false);
      }}
      onMouseOut={(e) => { if (anchorAt(e)) scheduleClose(); }}
      onClick={(e) => {
        const a = anchorAt(e);
        if (a) { e.preventDefault(); openFor(a, true); }
      }}
    >
      <EditorContent editor={editor} className="doc-rich-content" />
      {linkPop && createPortal(
        <div
          className="link-pop"
          style={{ left: linkPop.left, top: linkPop.top }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {editing ? (
            <div className="link-pop-edit">
              <input
                autoFocus
                value={editVal}
                placeholder="Paste or type a link"
                onChange={(e) => setEditVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); applyEdit(); }
                  if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
                }}
              />
              <button type="button" className="link-pop-btn" onClick={applyEdit}>Save</button>
            </div>
          ) : (
            <>
              <button type="button" className="link-pop-url" title={linkPop.href} onClick={visit}>
                {prettyHref(linkPop.href) || 'link'}
              </button>
              <span className="link-pop-actions">
                <button type="button" className="link-pop-btn" onClick={visit}>Visit</button>
                <button type="button" className="link-pop-btn" onClick={copyLink}>{copied ? 'Copied' : 'Copy'}</button>
                <button type="button" className="link-pop-btn" onClick={startEdit}>Edit</button>
                <button type="button" className="link-pop-btn" onClick={removeLink}>Remove</button>
              </span>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
