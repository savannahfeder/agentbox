// A LETTER TYPED WITH NO BOX UNDER IT IS STILL TYPING when it comes straight
// after typing in a box, or while a box is opening. Single letters are
// shortcuts on the list and in a thread (E closes, L puts off, J and K move),
// so a box losing the caret mid-sentence, or opening a beat after the first
// letters arrive, used to turn a sentence into a string of commands.

/** A letter this soon after the last one typed into a box is more of the same. */
export const STILL_TYPING_MS = 1500;
/** Two different letters this close together with no box under them are a sentence, not shortcuts. */
export const BURST_MS = 250;
/** How long a box that was asked for may take to mount and take the caret. */
export const OPENING_MS = 1500;
/** The boxes that open on a key or a press: the reply dock, the new thread card, search, ⌘K. */
export const BOXES = { reply: '.dock-input', compose: '.tc-text', search: '.search-q', palette: '.palette-input' } as const;
export type BoxKind = keyof typeof BOXES;

export type StrayCall = 'shortcut' | 'back-to-box' | 'into-opening-box' | 'drop';

export class StrayLetters {
  typedAt = -Infinity;
  openedAt = -Infinity;
  openingBox: BoxKind | null = null;
  looseAt = -Infinity;
  looseKey = '';
  inBurst = false;

  typed(now: number) { this.typedAt = now; }
  opening(box: BoxKind, now: number) { this.openedAt = now; this.openingBox = box; }
  /** Escape, a press or ⌘↵: the person chose to leave the box. */
  reset() { this.typedAt = -Infinity; this.openedAt = -Infinity; this.looseAt = -Infinity; }

  decide({ key, inInput, chord, now, boxThere, openingThere }: {
    key: string; inInput: boolean; chord: boolean; now: number;
    /** The box last typed in is still on screen. */
    boxThere: boolean;
    /** The box that is opening is on screen. */
    openingThere: boolean;
  }): StrayCall {
    if (inInput || chord || key.length !== 1) return 'shortcut';
    if (now - this.openedAt < OPENING_MS) return openingThere ? 'into-opening-box' : 'drop';
    if (now - this.typedAt < STILL_TYPING_MS) return boxThere ? 'back-to-box' : 'drop';
    // Only the first letter of loose typing can still act; the rest of the burst is dropped.
    this.inBurst = now - this.looseAt < BURST_MS && (this.inBurst || key.toLowerCase() !== this.looseKey);
    this.looseAt = now;
    this.looseKey = key.toLowerCase();
    return this.inBurst ? 'drop' : 'shortcut';
  }
}

export const strayLetters = new StrayLetters();

const editable = (el: EventTarget | null): el is HTMLElement => {
  const h = el as HTMLElement | null;
  return !!h && (h.tagName === 'TEXTAREA' || h.tagName === 'INPUT' || !!h.isContentEditable);
};
const shown = (el: HTMLElement | null): el is HTMLElement => !!el && el.isConnected && el.getClientRects().length > 0;
// A chat's box is an editor: the keys go to the editable page inside `.dock-input`.
const kindOf = (el: HTMLElement) => (Object.keys(BOXES) as BoxKind[]).find((k) => el.matches(BOXES[k]) || !!el.closest?.(BOXES[k])) ?? null;

/** Ahead of every other key listener, so no shortcut sees a letter that is typing. */
export function installStrayLetters(win: Window = window) {
  let lastBox: HTMLElement | null = null;
  // A re-render can swap the box for a new one of the same kind.
  const typedBox = () => {
    if (shown(lastBox)) return lastBox;
    const kind = lastBox && kindOf(lastBox);
    const again = kind ? win.document.querySelector<HTMLElement>(BOXES[kind]) : null;
    return shown(again) ? again : null;
  };
  const onKey = (e: KeyboardEvent) => {
    const now = Date.now();
    const chord = e.metaKey || e.ctrlKey || e.altKey;
    if (e.key === 'Escape') { strayLetters.reset(); return; }
    // A table's key box takes arrows and Enter for the table; a letter pressed in it is handed on to the app, not typed.
    if ((e.target as HTMLElement | null)?.dataset?.keysOnly !== undefined) return;
    if (editable(e.target)) {
      // Plain Enter is a new line in a brief; ⌘↵ sends, so the next letter starts something new.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { strayLetters.reset(); return; }
      if (!chord && e.key.length === 1) { strayLetters.typed(now); lastBox = e.target; }
      return;
    }
    const box = typedBox();
    const kind = strayLetters.openingBox;
    const opening = kind ? win.document.querySelector<HTMLElement>(BOXES[kind]) : null;
    const call = strayLetters.decide({ key: e.key, inInput: false, chord, now, boxThere: !!box, openingThere: shown(opening) });
    if (call === 'shortcut') return;
    // Focus moved inside keydown takes the letter with it, so it lands in the box.
    e.stopImmediatePropagation();
    if (call === 'drop') { e.preventDefault(); return; }
    const to = call === 'back-to-box' ? box! : opening!;
    to.focus();
    // A box drawn again holds the words but no caret, and focus() leaves it at their start.
    const field = to as HTMLElement & { value?: string; setSelectionRange?: (a: number, b: number) => void };
    if (call === 'back-to-box' && to !== lastBox && typeof field.value === 'string') field.setSelectionRange?.(field.value.length, field.value.length);
    strayLetters.typed(now);
    lastBox = to;
  };
  const onPress = () => strayLetters.reset();
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('pointerdown', onPress, true);
  return () => { win.removeEventListener('keydown', onKey, true); win.removeEventListener('pointerdown', onPress, true); };
}
