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
import { HOLDS, STATUS_MAX, holdEnds, holdsUntil, liveStatus } from '../../../shared/team-status.mjs';

/** What a person is saying right now, or null. Everything here goes through
 *  it, so a status disappears on this Mac's own clock the moment it runs out,
 *  without waiting for the writer's Mac to be awake and clear it. */
export const saying = (person: Person | null | undefined, now: number) => liveStatus(person?.status, now);

/** What the hover card says: who they are, and what they said. */
function FaceCardBody({ person, me, now }: { person: Person; me: boolean; now: number }) {
  const said = saying(person, now);
  const held = holdsUntil(said?.until, now);
  return <>
    <span className="tm-face-card-who">{me ? 'You' : person.name}</span>
    {said
      ? <span className="tm-face-card-said">{said.text}{held && <span className="tm-status-held">{held}</span>}</span>
      : <span className="tm-face-card-said nothing">{me ? 'Say what you are up to' : 'Nothing said'}</span>}
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

/** Writing one: the line, and how long it holds. Saying nothing clears it. */
export function StatusComposer({ person, now, onDone }: { person: Person; now: number; onDone: () => void }) {
  const said = saying(person, now);
  const [text, setText] = useState(said?.text ?? '');
  // Reopening shows the hold they actually picked, not a guess: the one whose
  // end is the time stored on them. Only "today" and "tomorrow" can collide,
  // and never on the same day, so the first match is the right one.
  const [hold, setHold] = useState<string>(
    said ? (HOLDS.find((h) => holdEnds(h.id, now) === said.until)?.id ?? 'today') : 'today',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { field.current?.focus(); }, []);

  const save = async () => {
    setBusy(true); setError(null);
    const out = await api.teamStatus({ text, hold });
    setBusy(false);
    if (out.ok) onDone(); else setError(out.error ?? 'That did not save.');
  };

  return <div className="tm-status-write">
    <input
      ref={field} className="tm-status-field" maxLength={STATUS_MAX} placeholder="In meetings until Thursday"
      value={text} onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') onDone(); }}
    />
    <div className="tm-seg tm-status-holds">
      {HOLDS.map((h) => <button key={h.id} className={hold === h.id ? 'on' : ''} onClick={() => setHold(h.id)}>{h.label}</button>)}
    </div>
    <button className="tm-btn" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
    {error && <div className="tm-status-error">{error}</div>}
  </div>;
}

/** The line under your name in your own row at the foot of the sidebar.
 *
 *  IT SITS WHERE YOUR EMAIL USED TO. Her words, 2026-10-02: the first attempt
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
export function SidebarStatus({ me, now, collapsed }: { me: Person; now: number; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const said = saying(me, now);
  const held = holdsUntil(said?.until, now);
  if (collapsed) return null;
  return <>
    <button type="button" className={`th-me-status${said ? '' : ' nothing'}`} aria-expanded={open}
      aria-label="Say what you are up to" title="Say what you are up to" onClick={() => setOpen(!open)}>
      <span className="th-me-status-ink">{said ? `${said.text}${held ? ` \u00b7 ${held}` : ''}` : 'Say what you are up to'}</span>
    </button>
    {open && <div className="th-me-pop">
      <div className="th-me-pop-head">What are you up to?</div>
      <StatusComposer person={me} now={now} onDone={() => setOpen(false)} />
    </div>}
  </>;
}
