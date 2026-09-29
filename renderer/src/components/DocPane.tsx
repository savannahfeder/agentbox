import {ArtifactControlGlyph} from './ArtifactControlGlyph';
import {FocusControl} from './FocusControl';
import type {FocusControlStyle} from '../focus-control';
import {usePreviewReveal} from '../preview-reveal';
import {PreviewLoading} from './PreviewLoading';
import { isLocalPreview, type ArtifactMode } from '../artifact-layout';
// THE DOCUMENT PANE. The right half of the window is the file itself.
//
// The look is settled and is not a question any more.
//
// THE SPEC, measured off the drawn screen (decisions.md, 08-21):
//
//   ground under the file          the window's own card, --doc-page
//   air, card to window            14 / 16 / 16 / 14   top, right, foot, left
//   corner                         10px
//   card's edge to the icon's ink  20px
//   how the card is held           a 1px hairline, no shadow
//   the two marks                  open, close, hairline icons, top right
//   the path                       a breadcrumb, in the reading face
//
// The air is UNEVEN BY 2px on purpose. Card two was the correction and she read
// that sentence and picked card one anyway. Do not even it up.
//
// A MARKDOWN FILE FOLLOWS THE WINDOW'S THEME. AN HTML FILE DOES NOT. Both
// halves are hers, on this row, a day apart.
//
// Markdown we draw ourselves, so there is nothing to guess.
//
// That is why the kind rides on the element: styles.css keys the split off
// doc-md / doc-html rather than off the theme.
//
// THE PANE HAS NO ZOOM OF ITS OWN, and it is not missing.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { crumbParts, docKind, docName, splitFromPointer, OPENING_SPLIT, type DocKind } from '../doc-pane';
import { pictureUrl } from '../picture';
import { DocText } from './DocText';
import { CodeArtifact } from './CodeArtifact';
import type { Change } from '../code-artifact';
import { NAME } from '../../../shared/product-name.mjs';

// The app's own icon recipe (SearchIcon.tsx): a 24 grid, a hairline, round
// caps, no fill. 1.3 here rather than 1.1 because these two sit at 15px.
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >{children}</svg>
  );
}
const OpenGlyph = () => (
  <Glyph>
    <path d="M14 4.8h5.2V10" />
    <path d="M19.2 4.8 11.6 12.4" />
    <path d="M18.4 14.2v3.6a1.6 1.6 0 0 1-1.6 1.6H6.2a1.6 1.6 0 0 1-1.6-1.6V7.2a1.6 1.6 0 0 1 1.6-1.6h3.6" />
  </Glyph>
);
const CloseGlyph = () => (
  <Glyph>
    <path d="M6.6 6.6 17.4 17.4" />
    <path d="M17.4 6.6 6.6 17.4" />
  </Glyph>
);

// `auto` marks a document the card opened by itself rather than one she
// clicked. Nothing about the pane is drawn differently for it; it only decides
// what esc does (escapeClosesDoc in doc-pane.ts). `at` is the ONE file inside
// a change she is being taken to, when something opened the artifact by
// pointing at a file rather than at the change as a whole: a chip on a work
// line in the conversation. It is not remembered anywhere. Reopening the
// change from its own chip puts her back at the top of it, which is what a
// change with no file named is.
//
// `atFrom` IS WHY THE SECOND PRESS WORKS. Pressing a chip, walking away with J
// and K and pressing the SAME chip again leaves `at` on the value it already
// had, so nothing downstream would notice and the press would do nothing. This
// changes on every press and is the whole reason it exists.
export type OpenDoc = { product: string; src: string; auto?: boolean; at?: string; atFrom?: number };

export function DocPane({ doc, roots, split, onSplit, onClose, onNotice, mode, onMode, headerTarget, focusControlStyle }: {
  focusControlStyle?: FocusControlStyle;
  headerTarget?: HTMLElement | null;
  mode?: ArtifactMode;
  onMode?: (mode: ArtifactMode) => void;
  doc: OpenDoc;
  // The product's own folders, so the breadcrumb says "astral › designs › …"
  // rather than printing the account plumbing above it.
  roots: string[];
  // How much of the window the document takes, 0..1.
  split: number;
  onSplit: (fraction: number) => void;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const kind: DocKind = docKind(doc.src) ?? 'html';
  // The file this really is, found by the app's own finder in the main process,
  // so the pane opens exactly what a click on the same path would have opened.
  const [resolved, setResolved] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [mtime, setMtime] = useState<number>(0);
  const [failed, setFailed] = useState<string | null>(null);
  // The address the frame points at, minted by main when it resolved the file.
  // An html page is served from its own origin so its pictures load; see
  // main/doc-scheme.mjs for why file:// could not.
  const [url, setUrl] = useState<string | null>(null);
  const [frameReady, revealFrame] = usePreviewReveal(url);
  // The change a run made, when the artifact is one.
  const [change, setChange] = useState<Change | null>(null);
  // Which file inside a change she is standing on, so the mark in this header
  // opens THAT file rather than the change as a whole.
  const [fileAt, setFileAt] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setResolved(null); setText(null); setFailed(null); setMtime(0); setUrl(null); setChange(null);
    if (isLocalPreview(doc.src)) { setResolved(doc.src); setUrl(doc.src); return () => { live = false; }; }
    api.resolveDoc({ product: doc.product, src: doc.src }).then((r) => {
      if (!live) return;
      if (!r.ok || !r.opened) { setFailed(r.error ?? 'That file could not be found.'); return; }
      setResolved(r.opened);
      setUrl(r.url ?? null);
    });
    if (kind === 'code') {
      api.codeChange({ product: doc.product, src: doc.src }).then((r) => {
        if (!live) return;
        if (!r.ok || !r.change) { setFailed(r.error ?? 'That change could not be read.'); return; }
        setChange(r.change as Change);
      });
    }
    if (kind === 'markdown') {
      api.readDoc({ product: doc.product, src: doc.src }).then((r) => {
        if (!live) return;
        if (!r.ok) { setFailed(r.error ?? 'That file could not be read.'); return; }
        setText(r.text ?? '');
        setMtime(r.mtime ?? 0);
      });
    }
    return () => { live = false; };
  }, [doc.product, doc.src, kind]);

  // FULLY RESIZABLE, hers. The pointer is captured on the divider, so a fast
  // drag over the document's own iframe does not lose the grip — an iframe eats
  // pointer events, which is what makes a naive mousemove listener let go
  // halfway across the screen.
  const grip = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const onGripDown = (e: React.PointerEvent) => {
    e.preventDefault();
    grip.current?.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const body = grip.current?.closest('.body')?.getBoundingClientRect();
    onSplit(body ? splitFromPointer(e.clientX - body.left, body.width) : splitFromPointer(e.clientX, window.innerWidth));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    try { grip.current?.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    setDragging(false);
  };

  const crumb = crumbParts(resolved ?? doc.src, roots);
  // WHAT THE FIRST MARK DOES, AND FOR A CHANGE IT IS HER EDITOR.On a markdown
  // file or a page it is unchanged and still hands the file to the operating
  // system, which is what she approved on 08-20.
  const openOutside = () => {
    const src = kind === 'code' ? (fileAt ?? doc.src) : doc.src;
    api.openArtifactExternally({ product: doc.product, src }).then((r) => {
      if (!r.ok) onNotice(r.error ?? 'That file could not be opened.');
    });
  };

  const documentHeader = (
<div className="doc-head">
          <div className="doc-crumb" title={resolved ?? doc.src}>
            {crumb.map((part, i) => (
              <span key={`${part}-${i}`} className="doc-crumb-part">
                {i > 0 && <span className="doc-crumb-sep">›</span>}
                <span className={i === crumb.length - 1 ? 'doc-crumb-leaf' : undefined}>{part}</span>
              </span>
            ))}
          </div>
          <span className="doc-marks">
            {onMode && (focusControlStyle ? <FocusControl style={focusControlStyle} focused={!!headerTarget} onClick={()=>headerTarget ? onClose() : onMode('focus')}/> : !headerTarget && <button type="button" className="artifact-expand" aria-label="Expand preview" title="Expand preview to Focus" onClick={() => onMode('focus')}><Glyph><path d="M14 5h5v5M19 5l-6 6M10 19H5v-5M5 19l6-6" /></Glyph><span>Focus</span></button>)}
            {/* The two marks she approved, and nothing beside them. */}
            <button
              type="button"
              className="doc-mark"
              title={kind === 'code' ? 'Open this file in your editor' : `Open outside ${NAME}`}
              onClick={openOutside}
            >
              {focusControlStyle ? <ArtifactControlGlyph kind="open"/> : <OpenGlyph />}
            </button>
            <button type="button" className="doc-mark" title={headerTarget ? 'Exit Focus' : 'Close this document (esc)'} onClick={onClose}>
              {focusControlStyle ? <ArtifactControlGlyph kind="close"/> : <CloseGlyph />}
            </button>
          </span>
        </div>
  );

  return (
    <aside
      className={`doc-pane ${kind === 'html' ? 'doc-html' : kind === 'code' ? 'doc-code' : kind === 'image' ? 'doc-image' : 'doc-md'}${dragging ? ' dragging' : ''}`}
      style={{ flexBasis: `${split * 100}%` }}
    >
      {/* The divider. It is a 9px reach around a 1px line: a hairline is the
          right thing to see and the wrong thing to have to hit. */}
      <div
        ref={grip}
        className="doc-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the document"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // DOUBLE CLICK PUTS IT BACK WHERE IT OPENS, which is three quarters
        // since her pick on (2026-08-22) and was an even split before it. A
        // reset that goes somewhere the pane never opens is not a reset, it is
        // a fifth position she has to know about.
        onDoubleClick={() => onSplit(OPENING_SPLIT)}
      />
      <div className="doc-card">
        {headerTarget ? createPortal(documentHeader, headerTarget) : documentHeader}
        {failed ? (
          <div className="doc-missing">{failed}</div>
        ) : kind === 'image' ? (
          // THE PICTURE ITSELF. Nothing to sandbox and nothing to parse: it
          // goes on the app's own picture scheme, the same one every picture in
          // a message already uses (../picture.ts), because her window is
          // served over http and an http page may not load file://. Held inside
          // the card rather than flush, because it is a thing to look at like a
          // page is, not a diff.
          resolved
            ? <img className="doc-view doc-picture" src={pictureUrl(resolved)} alt={docName(resolved)} crossOrigin="anonymous" onError={() => setFailed('That picture could not be drawn.')} />
            : <PreviewLoading />
        ) : kind === 'code' ? (
          change
            ? <CodeArtifact
                product={doc.product}
                src={doc.src}
                change={change}
                startAt={doc.at ?? null}
                startAtFrom={doc.atFrom ?? 0}
                onFileAt={setFileAt}
                onNotice={onNotice}
              />
            : <PreviewLoading />
        ) : kind === 'html' ? (
          // A page of ours brings its own colour and the card cannot reach
          // inside it. That join is a cost of a card WITH a header and it was
          // measured before it shipped: 33.5 points of step where a file brings
          // its own black, 0 on a markdown file (decisions.md, 08-21).
          // allow-same-origin is safe HERE and was not safe on file://: under
          // astral-doc:// the page's origin is its own, so its pictures are
          // same-origin with it while the app stays out of reach. Without it
          // the frame is opaque and Chromium refuses every local picture in the
          // page, which is exactly what she was looking at.
          resolved ? (url
            ? <div className="preview-frame" aria-busy={!frameReady}>
              <PreviewLoading ready={frameReady} />
              <iframe
                key={url} onLoad={revealFrame} onError={() => setFailed("This preview could not be loaded.")}
                style={{opacity:frameReady ? 1 : 0}}
                className="doc-view" src={url}
                sandbox="allow-scripts allow-same-origin" title={crumb.join('/')}
              /></div>
            : <div className="doc-missing">Quit and reopen {NAME} to see this page's pictures.</div>) : <PreviewLoading />
        ) : text === null ? (
          <PreviewLoading />
        ) : (
          <DocText
            key={resolved ?? doc.src}
            product={doc.product}
            src={doc.src}
            text={text}
            mtime={mtime}
            onSaved={(at) => setMtime(at)}
            onNotice={onNotice}
          />
        )}
      </div>
    </aside>
  );
}
