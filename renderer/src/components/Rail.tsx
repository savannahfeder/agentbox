// The right rail: for the selected item's product, its name, its description,
// and the other rows of hers open on it. The purpose is re-orientation:
// remembering where that product is at.
//
// IT USED TO END WITH WHAT THE PRODUCT HAD MADE: the newest five artifacts and
// a "see everything →" into the made screen.
//
// THERE IS NO AGENTS SCREEN, EVER, and this section is not a door to one: the
// click opens that session's own card, which is already in her inbox.
//
// IT TAKES THE PLACE OF "Also open" rather than sitting under it, because this
// panel has ONE section and because "Open" is one of the vague words the app
// avoids. What it listed was the other rows of hers
// on this product, which the inbox is already showing her.
//
// THE LIST IS THIS PRODUCT'S, and it was machine-wide until 2026-08-20. The
// argument for the whole machine was a measurement: hardly any live session
// matched a product, because a product claims a session only when its
// `repoPath` resolves exactly to that session's cwd, and most products carry
// no repoPath at all. That count was taken with the app's OWN workers
// excluded, and they are not unmatched: the supervisor knows the product of
// every session it spawns. So the heading was true of nothing: the panel under
// "the app" could list rows that were terminals sitting in other repo folders.
//
// IT USED TO CARRY THE NUMBERS TOO: a headline metric, four measured-or-not
// rows, and a "Next move" line, all folded out of `dashboard.jsonl`.
//
// The reason is worth keeping, because it is not a taste call and it decides
// when they come back: NOTHING FEEDS THEM YET. No product here is connected to
// analytics or to payments, so every row printed the word "unmeasured" beside
// an instruction to go connect something. Four of those and a "Not recorded
// yet." is most of the rail's height spent saying the rail has nothing to say.
// The earlier argument for showing them was about a product that HAS a
// connector to point at; there is no such screen to send anyone to yet.

// AND THE SPACE UNDER ALL OF IT IS NOW HERS TO TYPE IN.
//
// THE NOTE IS THE TEXT UNDER THE PRODUCT'S NAME, and that is the one placement
// decision in this file.
//
// So there is no `.rail-oneliner` any more. The description the panel used to
// print under the name was the one piece of text in here that could not be
// edited, and it is the piece that most needed to be, so the note starts where
// it started and the description is what the note says on a product she has
// not written on yet. The agents move under it.
//
// The note still takes everything left over, so the empty space is still a
// click target that puts the caret in the note's own text; it is now between
// the note and the agents rather than below both. The drawing is
// `RailNote.tsx`.
//
// It comes off in one line if it has to.

import { useEffect, useState } from 'react';
import type { Product, WorkItem } from '../types';
import { api } from '../api';
import { agoQuiet } from '../format';
import { ProductMark } from './ProductMark';
import { RailNote } from './RailNote';

// ONE ROW, WHICHEVER IT CAME FROM. A task of hers and a session of her own are
// the same object here — a sentence, a clock and somewhere to go — so the panel
// cannot draw two kinds of row or order them by two rules. Which rows exist is
// decided in App.tsx, where the lists already live; this only draws them.
export interface RailRow {
  key: string;
  line: string;
  at: number;
  open: () => void;
}

// Only the one-liner is read now, and it is no longer drawn as a line of its
// own: it is what the note says on a product she has never written on. The fold
// still returns the rest; the rail simply asks it for the description, which is
// the freshest copy of it (it comes from `dashboard.jsonl`, which the agents
// write, rather than from the product record, which they mostly do not).
interface RailData {
  oneLiner?: string | null;
}

// THE PROJECT'S NAME AND ITS MARK, BOTH CHANGED WHERE THEY ARE DRAWN.
//
// So it is here, above the note, and it obeys the note's own law rather than a
// settings row's (see RailNote. no box, no border, no save button, no saved-at
// line. The panel is the wall, not the object. A name that drew itself as a
// text field would be the only outlined thing in the column, and the note
// directly under it has spent four rounds earning the opposite.
//
// ALWAYS EDITABLE, NOT CLICK-TO-EDIT, and that is the consistency argument: the
// note below it is always editable, so a name that needed unlocking first would
// be the odd one out in a two-element panel.
//
// IT SAVES ON BLUR AND ON ENTER. Not as she types: the name is on the rail, the
// row bylines, the composer's picker and every ⌘K row, so a write per keystroke
// is the whole window redrawing under her hands. Escape puts it back.
function RailHead({ product, onNotice }: { product: Product; onNotice: (text: string) => void }) {
  const [draft, setDraft] = useState(product.name);
  const [editing, setEditing] = useState(false);

  // The name can change under her: another session renames it, or she renames it
  // in Settings with this panel on screen. Her own half-typed draft outranks
  // that, which is the whole reason this is not simply `value={product.name}`.
  useEffect(() => { if (!editing) setDraft(product.name); }, [product.name, editing]);

  const commit = async () => {
    setEditing(false);
    const next = draft.trim();
    // Nothing to say when the same name was typed back, or cleared it. Both keep
    // the name the project already has; an empty one is refused by the main
    // process too, because a nameless project is a blank row in every list.
    if (!next || next === product.name) { setDraft(product.name); return; }
    const out = await api.renameProject({ product: product.slug, name: next });
    if (!out.ok) { setDraft(product.name); onNotice(out.error ?? 'That name could not be saved.'); }
  };

  return (
    <div className="rail-head">
      <button
        type="button"
        className="rail-mark"
        title={product.logo ? 'Change this project’s picture' : 'Give this project a picture'}
        aria-label={product.logo ? `Change the picture for ${product.name}` : `Give ${product.name} a picture`}
        onClick={async () => {
          const out = await api.pickProjectIcon({ product: product.slug });
          if (!out.ok) onNotice(out.error ?? 'That picture could not be used.');
        }}
      >
        <ProductMark src={product.logo} name={product.name} />
      </button>
      <input
        className="rail-product"
        value={draft}
        aria-label={`Name for ${product.name}`}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Stopped here, or the list underneath reads these as its own keys and
          // typing a name starts opening tasks.
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { e.preventDefault(); setDraft(product.name); setEditing(false); (e.target as HTMLInputElement).blur(); }
        }}
      />
    </div>
  );
}

export function Rail({ item, products, rows, now, onNotice }: {
  item: WorkItem | null;
  products: Product[];
  rows: RailRow[];
  now: number;
  onNotice: (text: string) => void;
}) {
  const [data, setData] = useState<RailData | null>(null);
  const slug = item?.product ?? null;
  const product = products.find((p) => p.slug === slug) ?? null;

  useEffect(() => {
    let alive = true;
    if (slug) api.dashboard(slug).then((d) => { if (alive) setData(d); });
    else setData(null);
    return () => { alive = false; };
  }, [slug, item?.updatedAt]);

  if (!product) return <aside className="rail rail-empty" />;

  return (
    <aside className="rail">
      <RailHead product={product} onNotice={onNotice} />

      <RailNote
        product={product.slug}
        oneLiner={data?.oneLiner ?? product.oneLiner ?? null}
        onNotice={onNotice}
      />

      <ActiveAgents slug={product.slug} rows={rows} now={now} />

      {product.repoPath && <div className="rail-repo">{product.repoPath.replace(/^\/Users\/[^/]+/, '~')}</div>}
    </aside>
  );
}

// EVERYTHING ON THIS PRODUCT THAT IS NOT CLOSED, one line each, with the clock
// on the right. So the rows are her work items in those three states
// (`belongsOnTheRail`, list-rules.ts) together with the sessions she started
// herself in a terminal in this product's folder (`onTheRail`,
// shared/agents.mjs), which have no work item to be counted by. Both sets are
// gathered in App.tsx.
//
// • No dot, and no mark of any kind. Ten ways of marking a live row were drawn
// and none of them was kept. • No count. Counts on a glance surface are out by
// design rule. • No fade.
// Five rows are out and one plain line opens the rest. The line carries no
// number, because a count on a glance surface is out by design rule, which
// is the whole reason "+3 more" is still banned while the fold is not. •
// Nothing animates.
//
// is false of the quiet ones. It keeps `.rail-section-label` untouched — same
// size, same weight, same faint ink — because bold capitals came out of this
// panel on purpose, and because with the rows two steps greyer
// the heading is now the strongest thing in the section without moving at all.
// That relationship is `--agent-ink` in `styles.css`, and it is walked from the
// app's own greys, never chosen.
//
// AND IT IS A SHORT LIST, five rows with a line underneath. Three ways of
// quieting a nineteen-row panel that was taking 586 pixels of an 801 pixel
// sidebar were compared, and this one was picked over a drawer that hid the
// whole section behind its heading and over the two combined. THE OTHER TWO
// CAME OUT OF THIS FILE THE SAME SESSION and they do not come back; their code
// is kept verbatim in `decisions.md` under 08-20 if anyone ever needs to read
// what was rejected. Nothing here is switchable: anything still switchable is
// something that has to be decided again.
//
// The section is never empty and never tall. Five rows is 195 pixels against
// the 586 before. "Show the rest" opens
// the lot and turns into "Show fewer", and it is only drawn when there is
// actually a rest to show, so a five-row day never grows a line that does
// nothing. What is open is not remembered between launches: the quiet state is
// the chosen one, so that is the one the panel starts in every time.
//
// AND THE WHOLE SECTION CLOSES NOW. What decides how it is built is that
// closing it means putting it away, not peeking at it, so unlike "Show the
// rest", THIS ONE IS REMEMBERED. Closing a
// section that reopens itself every launch is not closing it.
//
// It is remembered PER PRODUCT, in localStorage, because the panel is per
// product and the reason to close this on one product (rows already known
// about) is not a reason to close it on a product she is not
// working in today.
//
// THE HEADING IS THE CONTROL. There is no second glyph, no button beside the
// words and no row of icons: the label she already reads is the thing she
// clicks, and one caret sits after it saying which way it goes. The caret does
// not spin, because nothing in this app animates; it is one character that
// swaps. A closed section keeps its heading and loses everything under it, so
// the panel never forgets the section exists.
//
// The drawer that hid this section behind its own heading was REJECTED on
// 2026-08-20 and this is not that coming back. That drawer was the app deciding
// the section starts hidden and she has to open it to see her agents; this
// starts open, exactly as she left it, and closes only when she closes it. The
// distinction is who chose.
const SHORT = 5;

// One key per product. Nothing else in the app writes localStorage under this
// prefix, and an unreadable or absent value means open, which is the state the
// panel has always started in.
const CLOSED_KEY = (slug: string) => `rail.agents.closed.${slug}`;

function ActiveAgents({ slug, rows, now }: {
  slug: string;
  rows: RailRow[];
  now: number;
}) {
  const [more, setMore] = useState(false);
  // Read on the first render for this product rather than in an effect, so a
  // section she closed never flashes open on the way to being closed.
  const [closed, setClosed] = useState(() => readClosed(slug));
  useEffect(() => { setClosed(readClosed(slug)); setMore(false); }, [slug]);

  if (!rows.length) return null;

  const toggle = () => {
    const next = !closed;
    setClosed(next);
    try {
      if (next) window.localStorage.setItem(CLOSED_KEY(slug), '1');
      else window.localStorage.removeItem(CLOSED_KEY(slug));
    } catch { /* a store that will not write is not worth a word to her here */ }
  };

  const list = more ? rows : rows.slice(0, SHORT);
  return (
    <div className="rail-section">
      <button
        className="rail-section-label rail-section-toggle"
        onClick={toggle}
        aria-expanded={!closed}
      >
        <span>Active agents</span>
        <span className={`rail-section-caret${closed ? ' rail-section-caret-closed' : ''}`} aria-hidden="true" />
      </button>
      {!closed && list.map((r) => (
        <button key={r.key} className="rail-agent" onClick={r.open}>
          <span className="rail-agent-said">{r.line}</span>
          <span className="rail-agent-when">{agoQuiet(r.at, now)}</span>
        </button>
      ))}
      {!closed && rows.length > SHORT && (
        <button className="rail-more" onClick={() => setMore(!more)}>
          {more ? 'Show fewer' : 'Show the rest'}
        </button>
      )}
    </div>
  );
}

function readClosed(slug: string): boolean {
  try { return window.localStorage.getItem(CLOSED_KEY(slug)) === '1'; } catch { return false; }
}
