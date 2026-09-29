// PURE. The documents a message points at, the ones worth showing whole.
//
// The preview frame was never broken. It read `item.body` and nothing else, and
// the body stopped being where a file gets named. Two things moved it: a card
// the USER wrote has a body no agent can rewrite, so the only place a worker can put
// a path is the result or the checkpoint; and Focus renders the body only when
// there is neither of those. Counted across a real store, the share of tasks
// that named a document and got a preview fell by about half within a week.
//
// So the manifest is the whole message, exactly as the attachment row already
// reads it. The order is newest first, because the thing a worker just made is
// the thing she opened the card for.
import { referencedFiles } from './referenced-files';

// ONLY SOMETHING TO LOOK AT IS SHOWN WHOLE, ANYWHERE.
//
// Until then every page or markdown file a message named, other than our own
// bookkeeping, was opened beside the card AND framed under the message, so a
// report came at her three times: the words, the frame, the pane. Measured on
// a real store, by the words alone (the run's trace adds more): the pane opened
// itself on about a third of the rows an agent had written on, and on most of
// those it landed first on a page of words rather than a picture: html pages
// outside designs, reports and markdown files. Under this rule it opens only on
// the rows that name a drawing or a demo page, about half as many, and the
// frame under the message follows the same count.
//
// So two kinds open on their own. A design: an html page under a designs or
// demos folder, which is where a drawing or a page built to be looked at lives
// (write_document says designs/; a run's demonstration of built work says
// demos/). And a change: the `.change` file a run writes for the code it
// touched, which is the "review code" case. A report, a spec and a markdown
// document stay as chips at the foot of the card and open on a click, as they
// always did. An app at a port is an address, not a file, and nothing here
// opens one yet. What used to belong in a report belongs in the message now,
// which is briefs/writing-rules.md's half of this.
const DESIGN = /(^|\/)(designs?|demos?)\/[^?#]*\.html?$/i;
const CHANGE = /\.change$/i;

/** Is this a page made to be looked at, the one kind of document that frames under a message. */
export function isDesign(path: string | undefined | null): boolean {
  return DESIGN.test(String(path ?? '').split(/[?#]/)[0]);
}

/** Does this file open beside the card by itself: a design, or a change to review. */
export function opensOnItsOwn(path: string | undefined | null): boolean {
  const clean = String(path ?? '').split(/[?#]/)[0];
  return DESIGN.test(clean) || CHANGE.test(clean);
}

/**
 * Every drawing in this message that should be shown whole, newest part first.
 *
 * `dir` is this product's own folder. Pass it and a path a worker wrote out in
 * full from the root counts too, which is the difference between her clicking
 * the page and reading its address.
 */
export function embeddedDocuments(item: {
  result?: string | null;
  note?: string | null;
  body?: string | null;
  answer?: string | null;
}, dir: string | null = null): string[] {
  return referencedFiles(item.result, item.note, item.body, item.answer, { dir })
    .filter(isDesign);
}

// THE ONE DOCUMENT THE CARD IS ABOUT, opened beside the message on its own.
//
// The obvious rule is to open the first document the message names, and the
// obvious rule is wrong. Counted across the cards of a real store: of those
// that name a document this pane can open and that is really on disk, opening
// the first one lands on STATE.md or decisions.md about 40% of the time. Those
// are the files WE keep, named in almost every checkpoint a worker writes, and
// nobody opens a card to read one. Skipping them lands on a document a worker
// actually made on about four in five; the rest name only bookkeeping and the
// pane stays shut, exactly as it does today.
//
// A further refinement, preferring a file whose path carries the card's own id,
// moved only about 2% and is not worth a rule nobody can predict.
//
// AND NOW ONLY A DESIGN OPENS AT ALL, see `isDesign` above. The
// bookkeeping list is kept because a design folder can hold a readme too.
const BOOKKEEPING = new Set([
  'state.md', 'decisions.md', 'notes.md', 'instructions.md',
  'memory.md', 'claude.md', 'readme.md',
]);

/** Is this one of the files we keep for ourselves rather than one made for the user. */
export function isBookkeeping(path: string): boolean {
  const name = String(path ?? '').split(/[?#]/)[0].split('/').pop() ?? '';
  return BOOKKEEPING.has(name.toLowerCase());
}

/**
 * Every design this card could open on its own, best first.
 *
 * The order is the ATTACHMENT ROW'S OWN (Attached, in Focus.tsx): what the
 * message NAMED first and in its own order, because a worker who took the
 * trouble to point at a file was pointing at the one that matters, then what
 * the run merely MADE.
 *
 * Pass `made` from filesFromRuns. Leaving it out asks only what the words say.
 */
export function documentCandidates(item: {
  result?: string | null;
  note?: string | null;
  body?: string | null;
  answer?: string | null;
}, made: string[] = [], dir: string | null = null): string[] {
  const keep = (path: string) => opensOnItsOwn(path) && !isBookkeeping(path);
  const named = referencedFiles(item.result, item.note, item.body, item.answer, { dir }).filter(keep);
  const seen = new Set(named.map((p) => p.toLowerCase()));
  return [...named, ...made.filter((p) => keep(p) && !seen.has(p.toLowerCase()))];
}

/**
 * The design or change to open on its own when she opens this card, or null
 * when the card has none. A card that names only words keeps the whole window
 * for them.
 */
export function mainDocument(item: {
  result?: string | null;
  note?: string | null;
  body?: string | null;
  answer?: string | null;
}, made: string[] = [], dir: string | null = null): string | null {
  return documentCandidates(item, made, dir)[0] ?? null;
}
