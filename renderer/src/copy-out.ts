// WHAT LEAVES THE APP WHEN SHE COPIES A MESSAGE.
//
// WHY, MEASURED rather than guessed — scripts/measure-copy-and-link-colour.mjs
// copies a real message out of a real window and reads every flavour back off
// the system clipboard. A selection carrying a picture and a file link leaves
// with two flavours, and the urls in the html one are these:
//
//   text/plain  clean, exactly the words on the screen
//   text/html   astral-img://file/tmp/one.png
// file:///Users/you/Zero/accounts/00000000-…/personas/one.md
//
// Neither url means anything outside this window. Agentbox prefers the html and
// resolves both, so pasting back into Agentbox looks perfect; Gmail prefers the
// html too and resolves neither, so the picture arrives broken and the file
// link arrives as that raw path — which is the screenshot she attached.
// One copy, two answers, and that is the inconsistency she is describing.
//
// So the html flavour is rewritten on the way out. Two rules:
//
//   1. A PICTURE GOES AS THE PICTURE. It is already decoded on the screen, so
//      it is drawn to a canvas and inlined as a data: uri, which every mail
//      client on earth understands. This is why the picture scheme sends
//      `access-control-allow-origin` and why <img> asks with `crossOrigin`
//      (main/main.mjs): without both, the canvas throws SecurityError and there
//      is nothing to inline.
//   2. A PATH ON THIS MAC IS NOT A LINK ANYWHERE ELSE. A `file://` anchor is
//      unwrapped to the words it was showing, so her email says
//      "personas/one.md" instead of thirteen folders of her home directory.
//
// Everything else is left exactly as it was: an https link is still a link, a
// mailto is still a mailto, and text/plain is not touched at all, because it
// was already right.

import { unwrapWrappedProse, isWrappedProse } from './unwrap-lines';
import { ALL_SCHEMES } from '../../shared/schemes.mjs';

// A LINK INTO THIS MAC, ON ANY SCHEME OF OURS. Read rather than typed, and it
// carries every name this app has had, because a message she was sent months
// ago holds urls spelled the way the app was spelled that day.
const OURS = new RegExp(`^(file|${ALL_SCHEMES.join('|')}):`, 'i');

// AND THE SECOND THING THAT LEAVES WRONG, a round later: the line breaks inside
// a block. Workers wrap a draft at eighty columns out of habit, those newlines
// are real characters, and every one of them is drawn by the app she pastes
// into. `unwrapWrappedProse` decides which breaks were mechanical; it refuses
// anything that might be a command, so a block it is unsure about goes over
// untouched.
/** Is this fence one a worker tagged as code, rather than as words? */
function taggedAsCode(pre: Element | null): boolean {
  const tag = pre?.querySelector('code')?.className ?? '';
  const lang = /language-([\w-]+)/.exec(tag)?.[1]?.toLowerCase();
  return !!lang && !['text', 'txt', 'plain', 'markdown', 'md', 'email'].includes(lang);
}

/**
 * The text of one code block as it should reach the clipboard, for the copy
 * button that rides on every block.
 *
 * A fence a worker tagged with a language is code because they said so, and it
 * is handed over exactly as drawn. Only an untagged block, or one tagged as
 * words, is even a candidate for unwrapping.
 */
export function blockCopyText(pre: HTMLPreElement | null): string {
  const text = pre?.innerText ?? '';
  if (taggedAsCode(pre)) return text;
  return unwrapWrappedProse(text);
}

/** A picture already on the screen, as a data: uri, or null if it cannot be read. */
function inline(img: HTMLImageElement): string | null {
  if (!img.complete || !img.naturalWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // A tainted canvas, which is what a picture we do not serve looks like.
    return null;
  }
}

/**
 * Rewrite one copied fragment in place. Exported for the test: it takes the
 * cloned fragment and the live images it came from, and returns nothing,
 * because the fragment IS the answer.
 */
export function rewriteFragment(fragment: DocumentFragment, live: HTMLImageElement[]): void {
  const copies = Array.from(fragment.querySelectorAll('img'));
  copies.forEach((copy, i) => {
    const source = live[i];
    const data = source ? inline(source) : null;
    if (data) { copy.setAttribute('src', data); copy.removeAttribute('crossorigin'); return; }
    // Nothing readable to send. An <img> pointing at a scheme the other app has
    // never heard of is worse than no picture, so it goes and its name stays.
    const name = copy.getAttribute('alt');
    copy.replaceWith(name ? document.createTextNode(name) : document.createTextNode(''));
  });

  for (const a of Array.from(fragment.querySelectorAll('a'))) {
    const href = a.getAttribute('href') ?? '';
    if (OURS.test(href)) {
      a.replaceWith(document.createTextNode(a.textContent ?? ''));
    }
  }

  // A wrapped draft loses its typed-in breaks in the html flavour too, or she
  // fixes the paste by hand in every app that prefers html over words.
  for (const pre of Array.from(fragment.querySelectorAll('pre'))) {
    if (taggedAsCode(pre)) continue;
    const holder = pre.querySelector('code') ?? pre;
    const text = holder.textContent ?? '';
    if (isWrappedProse(text)) holder.textContent = unwrapWrappedProse(text);
  }
}

/**
 * Handle a copy out of the reading pane. Attach to the element the message is
 * drawn in; it does nothing at all when the selection is empty or is not inside
 * that element, so a copy from anywhere else is untouched.
 */
export function handleCopyOut(e: ClipboardEvent, within: HTMLElement | null): void {
  if (!within || !e.clipboardData) return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!within.contains(range.commonAncestorContainer)) return;

  // The live images, in document order, so each copy can be matched to the one
  // on the screen it was cloned from. cloneContents gives us copies whose src
  // still points at the scheme, and a clone has never been decoded.
  const holder = document.createElement('div');
  holder.appendChild(range.cloneContents());
  const live = Array.from(within.querySelectorAll('img')).filter((img) => range.intersectsNode(img));

  const fragment = document.createDocumentFragment();
  while (holder.firstChild) fragment.appendChild(holder.firstChild);
  rewriteFragment(fragment, live);

  const out = document.createElement('div');
  out.appendChild(fragment);
  e.clipboardData.setData('text/html', out.innerHTML);
  // The words were already right, so they are handed over unchanged rather than
  // re-derived from the html, which would lose the line breaks between blocks.
  //
  // The one exception is a drag that stayed inside a single untagged block:
  // that is her selecting a draft to send, and its typed-in wrapping is the
  // whole of. A selection that spans a block AND the words around it is left
  // alone, because there is no way to unwrap the block half without guessing at
  // the rest, and guessing is what this module refuses to do.
  const inside = range.commonAncestorContainer;
  const pre = (inside.nodeType === 1 ? (inside as Element) : inside.parentElement)?.closest('pre') ?? null;
  const plain = selection.toString();
  const unwrappable = pre && within.contains(pre) && !taggedAsCode(pre);
  e.clipboardData.setData('text/plain', unwrappable ? unwrapWrappedProse(plain) : plain);
  e.preventDefault();
}
