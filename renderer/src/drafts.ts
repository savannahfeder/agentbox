// PURE. Where a founder's unsent words live, and what happens to them when a
// send is taken back.
//
// The composer DELETED the draft the instant Send was pressed, on the reasoning
// that a sent message is no longer a draft. True for a send that stands, and
// wrong for the three seconds the app deliberately holds every send open: Z inside
// the grace window cancelled a write that had not happened yet, and there was
// nothing left anywhere in the app to hand back, so the user's words were gone for
// good. The post-commit withdraw was worse: it overwrites the answer in the
// ledger too, so the only surviving copy destroyed itself.
//
// So the rule this module exists to hold: SENDING TAKES THE WORDS, AND UNDOING
// GIVES THEM BACK. The key is the same one the composer reads on open, which is
// what makes a restored message simply be there, in the reply box, where she
// left it.
//
// closing it lost her PASTED IMAGES. The words came back because they were
// written here on every keystroke; the images were held only in the composer's
// own React state, which dies with the box, so a screenshot she pasted and then
// closed the box on was gone with nothing to say it had ever existed. Same
// class of loss, one level down.
//
// A draft is therefore WORDS AND IMAGES, and both survive the box.
//
// They are kept under two keys rather than one object, deliberately. The words
// stay at `zero.draft.<thread>` as the plain string they have always been, so
// every draft already sitting in her localStorage today opens unchanged after
// this ships and nothing has to be migrated; the images ride alongside at
// `zero.draftimg.<thread>` as JSON. Nothing she can type into the box can be
// mistaken for the image record, because the two never share a key.

export interface ItemRef { product: string; id: string }

// `DraftAttachment` and the size budget are declared ONCE, further down, with
// the new task card's draft. The reply box and the card are two boxes she uses
// side by side, and they must not disagree about what a staged file is, about
// how much of it fits, or about what they say when it does not ( merged first,
// 08-16; this branch collapsed the duplicates on the way in).

// Just enough of the Storage interface to be handed a fake in a test.
export interface DraftStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const backing = (store?: DraftStore): DraftStore =>
  store ?? ((globalThis as unknown as { localStorage: DraftStore }).localStorage);

/** One draft per thread, and the composer opens whatever it finds here. */
export function draftKey(item: ItemRef): string {
  return `zero.draft.${item.product}:${item.id}`;
}

export function readDraft(item: ItemRef, store?: DraftStore): string {
  return backing(store).getItem(draftKey(item)) ?? '';
}

/** Empty is not a draft: it removes the key rather than storing a blank one. */
export function saveDraft(item: ItemRef, text: string, store?: DraftStore): void {
  const s = backing(store);
  if (text) s.setItem(draftKey(item), text);
  else s.removeItem(draftKey(item));
}

export function clearDraft(item: ItemRef, store?: DraftStore): void {
  const s = backing(store);
  s.removeItem(draftKey(item));
  s.removeItem(draftImagesKey(item));
}

/* ------------------------------ the images ------------------------------- */

/** The images of the same draft, beside the words and never mixed into them. */
export function draftImagesKey(item: ItemRef): string {
  return `zero.draftimg.${item.product}:${item.id}`;
}

export function readDraftAttachments(item: ItemRef, store?: DraftStore): DraftAttachment[] {
  const raw = backing(store).getItem(draftImagesKey(item));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything that is not a usable attachment is dropped rather than handed to
    // the composer: a thumbnail with no bytes and no path renders as a broken
    // image, which reads as the app having damaged her paste.
    return parsed
      .filter((a) => a && typeof a === 'object' && typeof a.name === 'string' && (a.dataBase64 || a.srcPath))
      .map((a) => ({ name: a.name, dataBase64: a.dataBase64, srcPath: a.srcPath, image: !!a.image }));
  } catch {
    return [];
  }
}

/**
 * Keep this thread's staged images, images last.
 *
 * Returns what was actually stored and what would not go in, because the box
 * says the second part out loud. An image that vanished without a word is
 * indistinguishable from the app losing it, which is the whole bug.
 *
 * Bytes come off the END, one at a time, until the rest fits: the images she
 * has been looking at longest are the ones that survive, and a store that
 * refuses the write (quota, private mode) degrades to fewer images rather than
 * to none. Attachments carrying only a path cost nothing and are never the ones
 * that go. Same rule and same shape as the new task card's own draft
 * (`saveComposeDraft`), because they are the same act.
 *
 * The words are written under a different key by a different call, and nothing
 * here can take them down: this never throws out of the keystroke that saved
 * them.
 */
export function saveDraftAttachments(
  item: ItemRef,
  attachments: DraftAttachment[],
  store?: DraftStore,
): { kept: DraftAttachment[]; dropped: DraftAttachment[] } {
  const s = backing(store);
  let kept = (attachments ?? []).slice();
  const dropped: DraftAttachment[] = [];
  const remove = () => {
    const last = kept.map((a) => !!a.dataBase64).lastIndexOf(true);
    if (last < 0) return false;
    dropped.unshift(kept[last]);
    kept = kept.filter((_, i) => i !== last);
    return true;
  };
  for (;;) {
    if (!kept.length) {
      try { s.removeItem(draftImagesKey(item)); } catch { /* nothing to undo */ }
      return { kept, dropped };
    }
    const body = JSON.stringify(kept);
    if (body.length <= COMPOSE_DRAFT_MAX_BYTES) {
      try { s.setItem(draftImagesKey(item), body); return { kept, dropped }; } catch { /* try smaller */ }
    }
    // Nothing left that weighs anything, and it still will not go in: the paths
    // cost nothing, so the store is refusing everything. Nothing was kept, and
    // saying so beats promising a restore that cannot happen.
    if (!remove()) {
      try { s.removeItem(draftImagesKey(item)); } catch { /* nothing to undo */ }
      return { kept: [], dropped };
    }
  }
}

/**
 * Is there a conversation in progress on this thread?
 *
 * Images alone are a draft. The list opens the reply box on a draft, and a
 * thread she pasted a screenshot into without typing a word is exactly as much
 * of an unfinished message as one with text typed into it.
 */
export function hasDraft(item: ItemRef, store?: DraftStore): boolean {
  return !!readDraft(item, store).trim() || readDraftAttachments(item, store).length > 0;
}

/**
 * Undo of a send: her draft goes back where she left it, WORDS AND IMAGES.
 *
 * Returns whether anything actually came back, because the caller says so out
 * loud and must not promise it when there was nothing to return.
 *
 * An undo hands back what was taken; it never overwrites what is there now. If
 * she has started a new draft on the same thread since sending, that newer one
 * wins and the restore declines, because silently replacing live text with
 * older text is the same class of loss this whole module exists to prevent.
 * Images count as that live draft too: a screenshot she has pasted since is
 * exactly as much of a message as a sentence she has typed since.
 *
 * The old comment here argued the opposite, wrongly: it said images
 * needed nothing, because a send had already written them into the product's
 * attachments dir and put their markdown inside the words, so the paragraph
 * handed back carried them. It carried them as
 * `![pasted-3347.png](attachments/mt0reku0-pasted-3347.png)`, typed into her
 * reply box in place of the thumbnail she pasted. That is not the draft she
 * left, it is a link she now has to delete by hand, and it reads as the app
 * having mangled her screenshot.
 *
 * So the caller hands back the two things it took, separately: the words as
 * typed WITHOUT the markdown the send appended, and the staged attachments
 * themselves. The box then opens on what it looked like before Send. The
 * staged files are still on disk (main/ipc.mjs copies out of `.staging`, never
 * moves), so the thumbnails still draw.
 *
 * One consequence, stated rather than hidden: a withdrawn send leaves its copy
 * in the product's attachments dir, and sending again writes a second one. An
 * unreferenced file costs nothing and is invisible; putting her screenshot
 * back is the point.
 */
/**
 * What a send took, kept so undo can hand exactly it back: the words as typed
 * BEFORE the send appended any attachment markdown, and the staged files as
 * they were in the box. Never the joined body that went to the agent.
 */
export interface SentDraft {
  words: string;
  attachments: DraftAttachment[];
}

export function restoreDraft(
  item: ItemRef,
  text: string,
  attachments: DraftAttachment[] = [],
  store?: DraftStore,
): boolean {
  const words = String(text ?? '').trim();
  const images = (attachments ?? []).filter((a) => a && !!a.name && (!!a.dataBase64 || !!a.srcPath));
  if (!words && !images.length) return false;
  if (readDraft(item, store).trim() || readDraftAttachments(item, store).length) return false;
  if (words) saveDraft(item, words, store);
  if (images.length) saveDraftAttachments(item, images, store);
  return true;
}

// A rejected live send may return after she has started typing again. Preserve
// both instead of overwriting her new work or silently discarding the failure.
export function restoreFailedDraft(item: ItemRef, text: string, attachments: DraftAttachment[] = [], store?: DraftStore): void {
  const existing = readDraft(item, store);
  saveDraft(item, [existing, text.trim()].filter(Boolean).join('\n\n'), store);
  saveDraftAttachments(item, [...readDraftAttachments(item, store), ...attachments], store);
  if (!store && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('zero:reply-restored', { detail: draftKey(item) }));
}

// ---------------------------------------------------------------------------
// THE NEW TASK CARD'S DRAFT
//
// The reply box above kept the words and lost her pasted images. The new task
// card was worse: it kept NOTHING, so closing it by accident — Escape, a click
// on the backdrop, a reload — took the whole sentence with it. `Compose.tsx`
// opened on `useState('')` every single time.
//
// There is one card, not one per thread, so this is one key rather than a keyed
// family. It holds everything the card is carrying: the words, the pasted
// images, the priority tag and the clock. That scope is deliberate, because
// coming back to half your card is its own annoyance. The PROJECT is
// not in here because it is already durable in its own right: picking one
// writes `zero.lastProduct` the moment she clicks it, and a second copy of the
// same fact is a second thing that can disagree.
//
// SIZE. Pasted screenshots are carried as base64 bytes, and localStorage is a
// few megabytes for the whole app. So the images are budgeted, and if the
// budget or the quota is hit, THE WORDS STILL LAND: whatever cannot be kept is
// dropped from the images, never from the sentence, and the count of what went
// is stored so the card can say so out loud. A draft that silently comes back
// short is the failure this module exists to prevent, one level down.
// ---------------------------------------------------------------------------

// Structurally `PendingAttachment` (../attachments.ts). Written out rather than
// imported so this module stays pure and has no view of the DOM.
export interface DraftAttachment {
  name: string;
  dataBase64?: string;
  srcPath?: string;
  image: boolean;
}

export interface ComposeDraft {
  text: string;
  attachments: DraftAttachment[];
  /** A PriorityId, or null for untagged. Kept as a string so this stays pure. */
  priority: string | null;
  /** A WhenValue: a moment to start at, or a rule, never both. */
  when: { runAt: number; repeat: unknown };
  /** Images that did not fit, so the card can say so instead of coming back short. */
  dropped: number;
}

export const COMPOSE_DRAFT_KEY = 'zero.draft.compose';

/** How much of the store one unsent card may take, serialized. */
export const COMPOSE_DRAFT_MAX_BYTES = 3_000_000;

export const EMPTY_COMPOSE_DRAFT: ComposeDraft = {
  text: '', attachments: [], priority: null, when: { runAt: 0, repeat: null }, dropped: 0,
};

const attachmentOf = (raw: unknown): DraftAttachment | null => {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const name = typeof a.name === 'string' ? a.name : '';
  if (!name) return null;
  const bytes = typeof a.dataBase64 === 'string' ? a.dataBase64 : undefined;
  const src = typeof a.srcPath === 'string' ? a.srcPath : undefined;
  if (!bytes && !src) return null;
  return { name, ...(bytes ? { dataBase64: bytes } : {}), ...(src ? { srcPath: src } : {}), image: !!a.image };
};

/**
 * What the card opens with.
 *
 * Anything unreadable reads as no draft rather than throwing: a card that
 * refuses to open because of a bad string in storage is worse than a card that
 * opens empty, and the user has no way to clear it.
 */
export function readComposeDraft(store?: DraftStore): ComposeDraft {
  let raw: string | null = null;
  try { raw = backing(store).getItem(COMPOSE_DRAFT_KEY); } catch { return { ...EMPTY_COMPOSE_DRAFT }; }
  if (!raw) return { ...EMPTY_COMPOSE_DRAFT };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ...EMPTY_COMPOSE_DRAFT }; }
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY_COMPOSE_DRAFT };
  const d = parsed as Record<string, unknown>;
  const when = (d.when && typeof d.when === 'object' ? d.when : {}) as Record<string, unknown>;
  return {
    text: typeof d.text === 'string' ? d.text : '',
    attachments: (Array.isArray(d.attachments) ? d.attachments : []).map(attachmentOf).filter((a): a is DraftAttachment => !!a),
    priority: typeof d.priority === 'string' ? d.priority : null,
    when: { runAt: typeof when.runAt === 'number' ? when.runAt : 0, repeat: when.repeat ?? null },
    dropped: typeof d.dropped === 'number' && d.dropped > 0 ? d.dropped : 0,
  };
}

/** Nothing typed, nothing pasted and nothing set is not a draft. */
export function composeDraftIsEmpty(d: ComposeDraft): boolean {
  return !d.text.trim() && !d.attachments.length && !d.priority
    && !d.when.runAt && !d.when.repeat;
}

/**
 * Write the card down, images last.
 *
 * Returns the draft as it was actually stored, which is not always the one
 * handed in: image bytes come off the end until the whole thing fits, and each
 * one that goes is counted. The caller shows that count, because an image that
 * vanished without a word is indistinguishable from the app losing it.
 */
export function saveComposeDraft(draft: ComposeDraft, store?: DraftStore): ComposeDraft {
  const s = backing(store);
  if (composeDraftIsEmpty(draft)) {
    try { s.removeItem(COMPOSE_DRAFT_KEY); } catch { /* nothing to undo */ }
    return { ...EMPTY_COMPOSE_DRAFT };
  }
  // Attachments carrying only a path cost nothing, so they are never the ones
  // that go. Bytes come off the end (the newest paste) so the images she has
  // been looking at longest are the ones that survive.
  let kept = draft.attachments.slice();
  let dropped = 0;
  const tryWrite = (): ComposeDraft | null => {
    const candidate: ComposeDraft = { ...draft, attachments: kept, dropped };
    const body = JSON.stringify(candidate);
    if (body.length > COMPOSE_DRAFT_MAX_BYTES) return null;
    try { s.setItem(COMPOSE_DRAFT_KEY, body); } catch { return null; }
    return candidate;
  };
  for (;;) {
    const written = tryWrite();
    if (written) return written;
    const lastBytes = kept.map((a) => !!a.dataBase64).lastIndexOf(true);
    if (lastBytes < 0) break;
    kept = kept.filter((_, i) => i !== lastBytes);
    dropped += 1;
  }
  // Even with no image bytes left it would not go in. The words are the thing
  // that must not be lost, so they go in alone.
  const bare: ComposeDraft = { ...draft, attachments: kept, dropped };
  try { s.setItem(COMPOSE_DRAFT_KEY, JSON.stringify(bare)); } catch { return bare; }
  return bare;
}

export function clearComposeDraft(store?: DraftStore): void {
  try { backing(store).removeItem(COMPOSE_DRAFT_KEY); } catch { /* nothing to undo */ }
}

/**
 * Undo of a NEW TASK: the whole card goes back, exactly as she sent it.
 *
 * Both halves of this were broken. Sending was the one action in the app that put
 * nothing on the undo pile, so Z reached past it to whatever was underneath —
 * an archive from ten minutes earlier, a reply out of a thread she was not even
 * looking at — and the card had already thrown the user's words away. The only
 * way to add a forgotten sentence was to write the whole task again, which is
 * how the same title ended up in the store twice inside a minute.
 *
 * Same rule as `restoreDraft` one screen up, for the same reason: an undo hands
 * back what was taken and NEVER overwrites what is there now. If she has
 * started a new card since sending, that newer one wins and this declines,
 * because silently replacing live words with older words is the loss this whole
 * module exists to prevent.
 *
 * The whole card, not just the sentence: the priority she tagged and the clock
 * she set are as much a part of the message as the words, and a task that
 * comes back untagged is one she has to notice and re-tag.
 *
 * Returns whether anything actually came back, because the caller says so out
 * loud and must not promise a restore that did not happen.
 */
export function restoreComposeDraft(draft: ComposeDraft, store?: DraftStore): boolean {
  if (!draft || composeDraftIsEmpty(draft)) return false;
  if (!composeDraftIsEmpty(readComposeDraft(store))) return false;
  saveComposeDraft(draft, store);
  return true;
}
