// A PAGE IN THE PANE KEEPS ITS SCROLLBAR OUT OF SIGHT UNTIL YOU SCROLL.
//
// The app's own scrollbars are invisible at rest (styles.css, "SCROLLBARS ARE
// NOT FURNITURE"), but a page drawn in the document pane is its own document
// and that stylesheet stops at the frame. With a mouse plugged in, macOS draws
// classic scrollbars, and a page that does not declare itself dark gets the
// light ones: a white track the full height of the pane with a grey thumb in
// it. That was the report, with a screenshot, on 2026-10-05.
//
// THE FILE IS STILL SERVED EXACTLY AS IT WAS WRITTEN (doc-scheme.mjs). What is
// added here is the app's own chrome, from outside, once the page's document
// exists: one adopted stylesheet that touches nothing but scrollbars, inside a
// cascade layer so a page that styled its own scrollbars keeps them, and two
// passive listeners that only ever swap that sheet. Nothing a page does is
// changed or stopped, and no key or gesture of hers is listened to.
//
// A frame whose sandbox has no allow-scripts cannot be handed this (measured:
// "Script not run"). The one such frame is the small preview under a message,
// and that one is told not to scroll at all (ArtifactThumbnail.tsx).
import { DOC_SCHEMES, isScheme } from '../shared/schemes.mjs';
import { DOCUMENT_HEIGHT_SCRIPT, wantsDocumentHeight } from './frame-document-height.mjs';

const RULES = (thumb) => `@layer agentbox-scrollbars {
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${thumb}; border-radius: 10px; border: 3px solid transparent; background-clip: content-box; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(150, 150, 150, 0.7); background-clip: content-box; }
}`;

/** No track and no thumb: what a page looks like while nobody is scrolling it. */
export const AT_REST = RULES('transparent');
/** A thin soft thumb that reads on a dark page and a light one alike. */
export const SHOWN = RULES('rgba(140, 140, 140, 0.45)');

/** Is this a page of ours or a file, rather than a running app or the web. */
export function wantsQuietScrollbars(url) {
  let parsed;
  try { parsed = new URL(String(url ?? '')); } catch { return false; }
  return parsed.protocol === 'file:' || isScheme(DOC_SCHEMES, parsed.protocol);
}

/**
 * Runs INSIDE the page, so it is written to be serialised: everything it uses
 * comes in through its arguments. Shown while the page or anything in it
 * scrolls and for a moment after, and while the pointer is at the right edge
 * where the thumb would be grabbed.
 */
export function quietScrollbars(page, atRest, shown) {
  const doc = page.document;
  if (doc.adoptedStyleSheets.some((s) => s.agentboxScrollbars)) return;
  const sheet = new page.CSSStyleSheet();
  sheet.agentboxScrollbars = true;
  sheet.replaceSync(atRest);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  let showing = false;
  let atEdge = false;
  let timer = null;
  const show = () => { if (!showing) { sheet.replaceSync(shown); showing = true; } };
  const hideSoon = () => {
    page.clearTimeout(timer);
    timer = page.setTimeout(() => { timer = null; if (!atEdge) { sheet.replaceSync(atRest); showing = false; } }, 900);
  };
  page.addEventListener('scroll', () => { show(); if (!atEdge) hideSoon(); }, { capture: true, passive: true });
  page.addEventListener('mousemove', (e) => {
    const edge = e.clientX >= doc.documentElement.clientWidth - 14;
    if (edge === atEdge) return;
    atEdge = edge;
    if (edge) { page.clearTimeout(timer); timer = null; show(); } else hideSoon();
  }, { passive: true });
  page.addEventListener('mouseout', (e) => {
    if (e.relatedTarget || !atEdge) return;
    atEdge = false;
    hideSoon();
  }, { passive: true });
}

const SCRIPT = `(${quietScrollbars.toString()})(window, ${JSON.stringify(AT_REST)}, ${JSON.stringify(SHOWN)})`;

function quiet(frame) {
  if (!frame || !wantsQuietScrollbars(frame.url)) return;
  frame.executeJavaScript(SCRIPT).catch(() => { /* a sandbox without scripts, or the frame went away */ });
  if (wantsDocumentHeight(frame.url)) {
    frame.executeJavaScript(DOCUMENT_HEIGHT_SCRIPT).catch(() => { /* the document navigated away */ });
  }
}

/** Every page frame in this window gets the quiet scrollbar as its document is ready. */
export function quietTheFramesScrollbars(contents) {
  contents.on('frame-created', (_event, { frame }) => {
    if (!frame || frame === contents.mainFrame) return;
    frame.on('dom-ready', () => quiet(frame));
  });
}
