// A STATUS LINE YOU WRITE YOURSELF, in the window.
//
// The founder, 2026-10-01: "If I'm going to spend a day or a few days in
// meetings, I don't want the board to make it seem like I'm not doing any
// work." Four of six people interviewed asked for the same thing.
//
// WHERE IT IS DRAWN, AND WHY IT IS NOT WHERE IT WAS DRAWN FIRST. Two
// placements were photographed and one was picked, but both of the pages they
// used were deleted while this was being built: the Team board went in
// w-05ff3d1438 (whose threads you see is picked on the Inbox now) and the row
// of face chips went in w-57034cf3c0 ("clutter on the one row that has to
// stay quiet"). The band above the task rows was turned down before that: "I
// don't like it interrupting your inbox because that's pretty rough."
//
// So it lives in the two places that survived:
//   - your own row at the foot of the sidebar, which is where you write it;
//   - a card on hovering a face, which the inbox rows still draw.
//
// Hover came from her: "I presumed that if I hovered over or clicked on them,
// it would show something." The card shows for EVERY face, not only the ones
// with a status, because a hover that sometimes does nothing is worse than no
// hover at all.
//
// The rules (what reads as live, the words, how long a hold lasts) are in
// shared/team-status.mjs, because the main process clears a lapsed one and
// has to agree with what is drawn here.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Person } from '../types';
import { api } from '../api';
import { STATUS_MAX, holdsUntil, liveStatus } from '../../../shared/team-status.mjs';
import { UNTIL_PRESETS, endOf, readUntil, untilWords, type StatusEnd } from './status-until';

/** What a person is saying right now, or null. Everything here goes through
 *  it, so a status disappears on this Mac's own clock the moment it runs out,
 *  without waiting for the writer's Mac to be awake and clear it. */
export const saying = (person: Person | null | undefined, now: number) => liveStatus(person?.status, now);

/** What your own status is called where nothing is said yet: the row in your
 *  account menu, and the card on your own face. */
export const STATUS_PROMPT = 'Set a status';

/** What the hover card says: who they are, and what they said. */
function FaceCardBody({ person, me, now }: { person: Person; me: boolean; now: number }) {
  const said = saying(person, now);
  const held = holdsUntil(said?.until, now);
  return <>
    <span className="tm-face-card-who">{me ? 'You' : person.name}</span>
    {said
      ? <span className="tm-face-card-said">{said.text}{held && <span className="tm-status-held">{held}</span>}</span>
      : <span className="tm-face-card-said nothing">{me ? STATUS_PROMPT : 'Nothing said'}</span>}
  </>;
}

/** A face that says what that person is up to when the pointer is on it.
 *  Wraps whatever the row already drew, so no row has to know about statuses.
 *
 *  THE CARD IS DRAWN ON THE BODY, NOT IN THE ROW. An inbox row clips what
 *  overflows it, so a card positioned inside one is laid out correctly and
 *  then painted away to nothing: measured 2026-10-01, a card 228 by 59 at the
 *  right coordinates and invisible in the screenshot. It is placed against
 *  the face's own rectangle instead, and sits above the row rather than
 *  below it when there is no room underneath. */
export function FaceHover({ person, me, now, children }: { person: Person | null; me: boolean; now: number; children: React.ReactNode }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);

  const show = () => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.bottom + 8;
    setAt({ left: Math.round(r.left), top: Math.round(below + 120 > window.innerHeight ? r.top - 8 - 120 : below) });
  };

  if (!person) return <>{children}</>;
  return <span className="tm-face-hover" ref={wrap} onMouseEnter={show} onMouseLeave={() => setAt(null)}>
    {children}
    {at && createPortal(
      <span className="tm-face-card" style={{ left: at.left, top: at.top }}>
        <FaceCardBody person={person} me={me} now={now} />
      </span>,
      document.body,
    )}
  </span>;
}

/** Writing one, AS ONE SENTENCE: "I'm in meetings until the end of today."
 *
 *  The box this replaces was a field, four uppercase hold buttons and Save,
 *  and it "looks a little unattractive, does not match our UI patterns, and is
 *  a little hard to understand" (2026-10-04). Of three redesigns this one was
 *  picked: the new-thread composer's own pattern, prose with the parts you
 *  change underlined. What you are up to is typed straight into the sentence;
 *  when it ends is a word that opens the composer's time menu, presets and a
 *  box for any time you like. Enter saves, Escape leaves, saying nothing
 *  clears it. */
export function StatusComposer({ person, now, onDone }: { person: Person; now: number; onDone: () => void }) {
  const said = saying(person, now);
  const [text, setText] = useState(said?.text ?? '');
  // Reopening starts on the end already chosen, never a guess (endOf).
  const [end, setEnd] = useState<StatusEnd>(() => endOf(said, now));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // WHAT YOU TYPE IS PART OF THE SENTENCE, not a box inside it: an editable
  // span wraps with the words around it and carries the composer's dotted
  // underline on every line. An input did neither: a long status scrolled
  // sideways on a line of its own, and a short one left a gap before "until".
  const field = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.textContent = said?.text ?? '';
    el.focus();
    // The caret goes after what is already said, so it can be added to.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges(); sel?.addRange(range);
  }, []);
  const typed = (el: HTMLSpanElement) => {
    const raw = (el.textContent ?? '').replace(/\s+/g, ' ');
    if (raw.length <= STATUS_MAX) { setText(raw); return; }
    // Past the limit the extra is cut where it was typed, and the caret
    // stays at the end, so the line never silently holds more than is saved.
    el.textContent = raw.slice(0, STATUS_MAX);
    const range = document.createRange();
    range.selectNodeContents(el); range.collapse(false);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    setText(el.textContent);
  };

  const save = async (clear = false) => {
    if (busy) return;
    setBusy(true); setError(null);
    const out = await api.teamStatus(clear
      ? { text: '', hold: 'open' }
      : { text, hold: end.hold ?? 'open', ...(end.until !== undefined ? { until: end.until } : {}) });
    setBusy(false);
    if (out.ok) onDone(); else setError(out.error ?? 'That did not save.');
  };

  return <div className="tm-status-write">
    <div className="tm-status-sentence">
      I'm <span
        ref={field} className="tm-status-what" contentEditable="plaintext-only" suppressContentEditableWarning
        role="textbox" aria-label="What you are up to" data-placeholder="in meetings" spellCheck={false}
        onInput={(e) => typed(e.currentTarget)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
      /> until <span className="when-wrap tm-status-until">
        <button type="button" className={`compose-word${picking ? ' open' : ''}`} aria-haspopup="menu" aria-expanded={picking}
          onClick={() => setPicking(!picking)}>{untilWords(end, now)}</button>
        {picking && <UntilMenu end={end} now={now} onClose={() => setPicking(false)}
          onPick={(next) => { setEnd(next); setPicking(false); field.current?.focus(); }} />}
      </span>.
    </div>
    <div className="tm-status-keys">
      <span><kbd>↵</kbd> save</span><span><kbd>esc</kbd> cancel</span>
      {said && <button type="button" className="tm-status-clear" disabled={busy} onClick={() => void save(true)}>Clear status</button>}
    </div>
    {error && <div className="tm-status-error">{error}</div>}
  </div>;
}

const upper = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** When it ends: the four presets, and a box that takes any time in words,
 *  drawn with the composer's When menu classes so the two read as one control.
 *  A phrase it can read becomes the top row with its moment on the right; one
 *  it cannot is refused out loud ("not a time"), never guessed. */
function UntilMenu({ end, now, onPick, onClose }: { end: StatusEnd; now: number; onPick: (end: StatusEnd) => void; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const phrase = typed.trim();
  const read = readUntil(phrase, now);
  const presets = UNTIL_PRESETS.filter((p) => !phrase || p.words.toLowerCase().includes(phrase.toLowerCase()));
  return <span className="when-menu" role="menu" aria-label="When it ends">
    {read && <button type="button" role="menuitem" className="when-row" onClick={() => onPick({ until: read.until })}>
      <span className="when-row-label">{upper(phrase)}</span><span className="when-row-hint">{read.label}</span>
    </button>}
    {presets.map((p) => <button key={p.hold} type="button" role="menuitem" className={`when-row${end.hold === p.hold ? ' on' : ''}`} onClick={() => onPick({ hold: p.hold })}>
      <span className="when-row-label">{upper(p.words)}</span>
    </button>)}
    {phrase && !read && !presets.length && <span className="when-row empty"><span className="when-row-label">not a time</span></span>}
    <span className="when-type-row">
      <input ref={box} className="when-type" value={typed} placeholder="or type: friday 5pm, in 3 days, oct 12" aria-label="Any time"
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          // Escape and Enter belong to this menu, not to the account menu
          // around it, which would otherwise close everything.
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
          if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            if (read) onPick({ until: read.until }); else if (phrase && presets[0]) onPick({ hold: presets[0].hold });
          }
        }} />
    </span>
  </span>;
}
// THE LINE UNDER YOUR NAME IN THE SIDEBAR IS GONE (w-a09476712f, 2026-10-04):
// "I wasn't a fan of the 'Say what you're up to' line being visible in the
// bottom-left corner at all times." Your email is back in that row, and the
// status is one row of your account menu (account-menu.tsx), which opens the
// composer above. What it replaced, for whoever weighs bringing it back:
/*  IT SAT WHERE YOUR EMAIL USED TO. Her words, 2026-10-02: the first attempt
 *  "takes up space", "makes everything move" and looks "pretty wonky". It did
 *  all three, because it was a THIRD line: the row is a fixed height until a
 *  status forces it open, so the corner jumped the moment you wrote one and
 *  jumped back when it lapsed. Taking the email's place instead costs nothing
 *  and moves nothing — the row is the same two lines it always was. Your email
 *  is still on Settings → Team ("Signed in as ..."), which is where this row
 *  already takes you when you click your name.
 *
 *  THE WAY IN IS A DOTTED UNDERLINE ON HOVER, not an icon. A pencil at the
 *  row's right edge was drawn first and she turned it down: it overlapped the
 *  pane beside the sidebar, and "I'm not sure I like that approach". The
 *  dotted underline is the app's own sign for a value you can change
 *  (.compose-word, and the thread composer's clauses). It is text-decoration
 *  and never border-bottom: a border plus padding makes the box taller than
 *  its neighbours and a centred flex row then lifts the text off the
 *  baseline, which is the 1px stagger styles.css warns about. */
