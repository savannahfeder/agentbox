import { DOC_SCHEMES, isScheme } from './schemes.mts';

/** A page beside the notes sidebar asks for this; the app cannot read a selection inside another origin. */
export function wantsSelectedWords(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isScheme(DOC_SCHEMES, parsed.protocol) && parsed.searchParams.get('agentbox-notes') === '1';
  } catch { return false; }
}

type Box = { top: number; bottom: number; left: number; right: number };

interface WordsSelection {
  isCollapsed: boolean;
  rangeCount: number;
  toString(): string;
  getRangeAt(i: number): { getClientRects(): ArrayLike<Box & { width: number }>; getBoundingClientRect(): Box };
  removeAllRanges(): void;
}

interface WordsPage {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  getSelection(): WordsSelection | null;
  requestAnimationFrame(callback: () => void): number;
  addEventListener(type: string, listener: (event: { source?: unknown; data?: { type?: string } }) => void, options?: boolean): void;
}

/** Runs in the page's own origin. Only the selected words and where they sit leave it. */
export function reportSelectedWords(page: WordsPage): void {
  const box = (r: Box) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
  // The inbox's origin is opaque to the page, so '*' is the only target that reaches it.
  // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
  const say = (message: unknown) => page.parent.postMessage(message, '*');
  const none = () => say({ type: 'agentbox-selected-words', words: '' });
  const read = () => {
    const sel = page.getSelection();
    const words = sel && !sel.isCollapsed && sel.rangeCount ? sel.toString() : '';
    if (!sel || !words.trim()) { none(); return; }
    const range = sel.getRangeAt(0);
    const all = range.getBoundingClientRect();
    const first = Array.from(range.getClientRects()).find((r) => r.width > 0) ?? all;
    say({ type: 'agentbox-selected-words', words, first: box(first), all: box(all) });
  };
  const later = () => { page.requestAnimationFrame(read); };
  page.addEventListener('mousedown', none, true);
  page.addEventListener('mouseup', later, true);
  page.addEventListener('keyup', later, true);
  page.addEventListener('message', (e) => {
    if (e.source === page.parent && e.data?.type === 'agentbox-clear-selection') page.getSelection()?.removeAllRanges();
  });
}

export const SELECTED_WORDS_SCRIPT = `(${reportSelectedWords.toString()})(window)`;
