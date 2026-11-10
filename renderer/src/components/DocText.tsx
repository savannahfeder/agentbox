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
//     onto it (main/doc-file.mts).
//   - Pasting an image is gone. That app wrote it into the doc's own assets/
//     folder through an IPC the app does not have, and inventing one would be a
//     second feature inside this one. A pasted image lands as text; nothing
//     silently disappears.
//   - The link card's "Visit" hands the url to the app the way every other link
//     in Agentbox is handed over, rather than to an in-app browser tab.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { buildExtensions } from '../editor/extensions';
import { mdToPmDoc, pmDocToMd } from '../editor/markdown';
import { patchOriginal } from '../editor/patch-md';
import { mergeText } from '../../../shared/text-merge.mts';
import { theAppKeepsThisKey } from '../../../shared/artifact-keys.mts';
import { api } from '../api';
import { asksForANewTab } from '../link-click';
import { fileBeside, pictureUrl } from '../picture';
import { agoWords } from '../threads/summary-rules';
import { DocOutline } from './DocOutline';
import { scrollKey, useKeptScroll } from '../kept-scroll';
import type { LiveSession } from '../live/live-session';
import { LivePresence, liveExtensions, presenceLook } from '../live/presence';
import './doc-reading.css';

const SAVE_DEBOUNCE_MS = 900;
// The copy that keeps a live file saves at least this often while people keep typing.
const LIVE_SAVE_EVERY_MS = 60_000;
const LIVE_WRITE_MS = 2_000;
const MOVES_THE_CURSOR = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

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

/** How the big view edits: its saves make versions, so what is typed goes to it rather than onto the file. */
export interface DocVersions {
  onDraft: (out: string | null) => void;
  saveNow: () => void;
  /** Handed the way to read the file with her edit in it right now, null when there is no edit. */
  flush: MutableRefObject<(() => string | null) | null>;
  paint?: (root: HTMLElement) => void;
  /** Words kept from a sitting that never got to save. */
  draft?: string;
  byline?: string | null;
  /** Take the cursor on open: a document just made is there to write in. */
  focus?: boolean;
}

export function DocText({ product, src, text, mtime, folder = null, onSaved, onNotice, readOnly = false, versions, live = null }: {
  readOnly?: boolean;
  /** The file's live room: everyone's typing merges, and only the keeper saves. */
  live?: LiveSession | null;
  versions?: DocVersions;
  product: string;
  src: string;
  text: string;
  // What was on disk when the pane loaded it. Handed back on every save so a
  // file an agent rewrote underneath her is not silently overwritten.
  mtime: number;
  // The folder the file sits in, which its relative pictures are drawn from.
  folder?: string | null;
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
  const dirty = useRef(!!versions?.draft);
  const saveTimer = useRef<number | null>(null);
  const asVersions = useRef(versions);
  asVersions.current = versions;
  useEffect(() => { lastMtime.current = mtime; }, [mtime]);

  // Until the room has answered, the file's own words show, so nothing blanks.
  const collab = live?.synced ? live : null;
  const liveNow = useRef(collab);
  liveNow.current = collab;
  const firstUnsaved = useRef<number | null>(null);

  // A picture the document names beside itself, on the window's picture scheme:
  // the page's own address is no folder, so it drew as a broken picture.
  const extensions = useMemo(() => buildExtensions('Write anything…', {
    drawnFrom: folder ? (from) => (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(from) ? from : pictureUrl(fileBeside(from, folder))) : null,
    live: collab ? liveExtensions(collab) : null,
  }), [folder, collab?.doc]);

  const editor = useEditor({
    extensions,
    ...(collab ? {} : { content: mdToPmDoc(versions?.draft ?? text) }),
    editable: !readOnly && !(live && !collab),
    autofocus: versions?.focus && !readOnly ? 'end' : false,
    onUpdate: () => {
      const room = liveNow.current;
      // Everyone's words are in the room. The owner's copy saves them as they come; a
      // teammate's copy keeping the room saves once, on leaving, through the owner.
      if (room && (!room.keeper || !room.me.owner)) return;
      dirty.current = true;
      // In a busy room the typing never pauses, so a save is never put off, only spaced out.
      if (room) {
        saveTimer.current ??= window.setTimeout(() => { saveTimer.current = null; void save(); }, LIVE_WRITE_MS);
      } else {
        if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(save, SAVE_DEBOUNCE_MS);
      }
      if (room) {
        firstUnsaved.current ??= Date.now();
        if (Date.now() - firstUnsaved.current > LIVE_SAVE_EVERY_MS) {
          firstUnsaved.current = null;
          window.setTimeout(() => asVersions.current?.saveNow(), SAVE_DEBOUNCE_MS + 50);
        }
      }
    },
  }, [extensions]);

  // Others' edits wait while a press places the cursor: one landing between press
  // and release put the cursor back where it was and the page jumped to it.
  useEffect(() => {
    const room = collab?.live;
    const dom = editor && !editor.isDestroyed ? editor.view.dom : null;
    if (!room || !dom) return undefined;
    const down = () => room.hold(true);
    const up = () => room.hold(false);
    // A key that only moves the cursor is read back from the page a moment later,
    // and an edit redrawing the page meanwhile put the cursor back: End then typing
    // landed mid-sentence.
    let moving: number | null = null;
    const key = (e: KeyboardEvent) => {
      if (!MOVES_THE_CURSOR.has(e.key)) return;
      room.hold(true);
      if (moving != null) window.clearTimeout(moving);
      moving = window.setTimeout(() => { moving = null; room.hold(false); }, 150);
    };
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('keydown', key);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', up);
    return () => {
      dom.removeEventListener('pointerdown', down); dom.removeEventListener('keydown', key);
      window.removeEventListener('pointerup', up); window.removeEventListener('blur', up);
      if (moving != null) window.clearTimeout(moving);
      room.hold(false);
    };
  }, [editor, collab?.live]);

  // An empty room is filled once, by the copy the room picked, from the file.
  const seeded = useRef(false);
  useEffect(() => {
    // The editor the live one replaced is still handed to this effect once, already destroyed.
    if (!editor || editor.isDestroyed || !collab?.seed || seeded.current) return;
    if (collab.doc.getXmlFragment('default').length > 0) return;
    seeded.current = true;
    editor.commands.setContent(mdToPmDoc(versions?.draft ?? text), { emitUpdate: false });
  }, [editor, collab?.seed, collab?.doc]);
  // Becoming the keeper with words nobody saved yet: save them.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !collab?.keeper || !collab.me.owner) return;
    dirty.current = true;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(save, SAVE_DEBOUNCE_MS);
  }, [editor, collab?.keeper]);

  const save = async () => {
    if (!editor || !dirty.current) return;
    const md = pmDocToMd(editor.getJSON());
    if (md === baseMd.current) { dirty.current = false; asVersions.current?.onDraft(null); return; }
    dirty.current = false;
    if (asVersions.current) { asVersions.current.onDraft(patchOriginal(onDisk.current, baseMd.current, md) ?? md); return; }
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
    if (!editor || editor.isDestroyed || text === onDisk.current) return;
    const room = liveNow.current;
    if (room) {
      // In a live file a new version is merged in once, by the keeper.
      const was = onDisk.current;
      onDisk.current = text;
      baseMd.current = pmDocToMd(mdToPmDoc(text));
      if (!room.keeper) return;
      const now = pmDocToMd(editor.getJSON());
      const merged = mergeText(was, now, text, { overlap: 'mine' }).text;
      // An edit, so the keeper saves the merged words.
      if (merged !== now) editor.commands.setContent(mdToPmDoc(merged), { emitUpdate: true });
      return;
    }
    if (dirty.current) return;
    const doc = mdToPmDoc(text);
    onDisk.current = text;
    baseMd.current = pmDocToMd(doc);
    editor.commands.setContent(doc, { emitUpdate: false });
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
      if (asVersions.current) { asVersions.current.saveNow(); return; }
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

  const visitHref = (url: string) => {
    api.openArtifactExternally({ product, src: url }).then((r) => {
      if (!r.ok) onNotice(r.error ?? 'That link could not be opened.');
    });
  };
  const visit = () => {
    if (!linkPop) return;
    visitHref(linkPop.href);
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

  const [look] = useState(presenceLook);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  useKeptScroll(scroller, scrollKey(product, src));
  const [column, setColumn] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const live = asVersions.current;
    if (!live || !editor) return undefined;
    live.flush.current = () => {
      if (saveTimer.current != null) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
      const room = liveNow.current;
      // Words the room has are the keeper's to save; only words it never got are this copy's.
      if (room && !room.keeper && room.live.state() === 'live' && !room.live.pending()) { dirty.current = false; return null; }
      firstUnsaved.current = null;
      const md = pmDocToMd(editor.getJSON());
      dirty.current = false;
      return md === baseMd.current ? null : patchOriginal(onDisk.current, baseMd.current, md) ?? md;
    };
    const paint = () => asVersions.current?.paint?.(editor.view.dom);
    let timer: number | null = null;
    const later = () => { if (timer != null) window.clearTimeout(timer); timer = window.setTimeout(paint, 250); };
    paint();
    editor.on('update', later);
    return () => { editor.off('update', later); if (timer != null) window.clearTimeout(timer); live.flush.current = null; };
  }, [editor, scroller]);
  // Moves the "Edited" words on with the minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);

  return (
    <div
      ref={setScroller}
      className={`doc-rich doc-scroll markdown${versions ? ' av-doc-scroll' : ''}`}
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
        if (!a) return;
        e.preventDefault();
        const href = a.getAttribute('href') || '';
        if (asksForANewTab(e)) { setLinkPop(null); visitHref(href); return; }
        openFor(a, true);
      }}
    >
      <div className={`doc-sheet${collab ? ` lv-look-${look}` : ''}`}>
        <div className="doc-column" ref={setColumn}>
          {collab && <LivePresence session={collab} editor={editor} column={column} look={look} />}
          {versions?.byline && <p className="doc-byline">{versions.byline}</p>}
          {!versions && mtime > 0 && <p className="doc-byline">Edited {agoWords(mtime, now).replace(/^Y/, 'y')}</p>}
          <EditorContent editor={editor} className="doc-rich-content doc-prose" />
        </div>
        <DocOutline scroller={scroller} page={column} />
      </div>
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
