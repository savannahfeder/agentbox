// The first run as drawn. The logic with no window in it is in ../onboarding.ts.
// The setup screens (welcome, folder, name) are their own surface over an empty
// app. The example task is not a screen. It is the real app with one ringed
// sentence beside the part being taught, so every tether is measured off the
// app's own rectangles, live, and again when the window changes size.

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TeamContext } from '../team/people';
import {
  ALSO, ANCHOR, BOUNDS, BREATHE_AFTER_MS, COACHED, COPY, FLOOR, FLOOR_OF, TEAM_TAB_NAMES, TEXT_MAX, TEXT_MIN, teamTab,
  HELD_EVENTS, LINE_H, NOT_THE_APP, SLAB_OF, TEXT_GAP, UNDER,
  anyAgents, clearOf, finishCard, forgetAgentsWhileLookingAgain, gateRows,
  forgetFoldersWhileLookingAgain, keepSecondRead, keyName, keyToken, padFor,
  practising, pressAtWrongRow, pressCounts, readAgentsAgain, roomFor, strayClick,
  swallowPress, walkProjects, wrongPress,
  coach, nextStep, nextTab, recentFolders, ring, runOf, shortPath, stepBack,
  type AgentFile, type Coach, type FirstRun, type Rect, type RecentFolder, type Step,
} from '../onboarding';
import { type AgentFolder, type Project, type SessionThread } from '../agent-import-card';
import { ImportAgents } from './ImportAgents';
import FolderPicker from './FolderPicker';
import { PRACTICE_NAME, PRACTICE_ROWS, PRACTICE_TASK } from '../../../shared/first-run-practice.mjs';
import { AppMark } from './AppMark';
import { SidebarIcon } from './SidebarIcon';
import { AskList, PlanQuestion, PlanSetupCard } from './PlanSetup';
import { afterCheck, type EngineSetupState, type Plan } from '../plan-setup';
import { NAME, Name } from '../../../shared/product-name.mjs';
import { foundOnThisComputer, type RunsOn } from '../../../shared/runs-on.mjs';
import { chord, sayKeys } from '../this-keyboard';

/** What the walk knows about each coding agent on this computer. */
type Readings = Array<Pick<EngineSetupState, 'engine' | 'found' | 'signedIn'>>;

/** The same folder glyph the setup card draws. */
function FolderGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** The folder screen's last row, which opens the Mac chooser. */
function PlusGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** The folder screen's way past, for somebody with no folder. */
function SkipGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" />
    </svg>
  );
}


/**
 * The quiet way out of the walk: one dim word in the practice strip, with no
 * key cap so it never competes with the card's key. It shows only on the
 * `practising` beats, and never without Claude Code, because the app holds the
 * inbox shut then and leaving would change nothing.
 *
 * The card it opens is focused on leaving, since the person already pressed
 * Skip. Escape only closes the card. The listener is capture phase and stops
 * the event, so App.tsx's own Escape handlers do not also close a task or a
 * palette. Return works here because `pressCounts` treats a press inside this
 * card as a press at the card, not at the walk. */
export function WayOut({ run, blocked, onLeave }: {
  run: { step: Step; practice: string | null } | null;
  /** Claude Code is missing, so there is nothing to be let out into. */
  blocked?: boolean;
  onLeave: () => void;
}) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return undefined;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setAsking(false);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [asking]);
  if (blocked || !practising(run)) return null;
  return (
    <>
      <button type="button" className="fr-out" onClick={() => setAsking(true)}>
        {COPY.leave}
      </button>
      {asking && (
        <div className="fr-stay-scrim" role="dialog" aria-modal="true" aria-label={COPY.leaveHead}>
          <div className="fr-stay">
            <div className="fr-stay-head">{COPY.leaveHead}</div>
            <div className="fr-stay-line">{sayKeys(COPY.leaveLine)}</div>
            <div className="fr-stay-row">
              <button type="button" className="fr-stay-go" autoFocus onClick={onLeave}>
                {COPY.leaveGo}
              </button>
              <button type="button" className="fr-stay-keep" onClick={() => setAsking(false)}>
                {COPY.leaveStay}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// THE DOTS ARE GONE, AND THEY ARE NOT COMING BACK. The walk used to count
// its beats with a row of dots at the foot. Two people asked what they were;
// people not understanding a thing is not a labelling problem, so the dots
// went rather than gaining a tooltip.

/**
 * The rectangle of the thing, not its box. An element with its own text is
 * measured whole. An element that only holds others, like the full-width
 * `.focus-actions` row, is measured by the run of its children. */
function anchorOf(el: Element): Rect | null {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const box = { x: r.left, y: r.top, w: r.width, h: r.height };
  const ownWords = [...el.childNodes].some(
    (n) => n.nodeType === 3 && (n.nodeValue ?? '').trim() !== '',
  );
  if (ownWords) return box;
  return runOf(box, [...el.children].map((k) => {
    const b = k.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, position: getComputedStyle(k).position };
  }));
}

/**
 * The in-flow siblings of the ringed element, measured like `anchorOf`, so the
 * ring's padding can stop halfway to its neighbours in a tight row of buttons. */
function neighboursOf(el: Element): Rect[] {
  const parent = el.parentElement;
  if (!parent) return [];
  return [...parent.children]
    .filter((k) => k !== el && getComputedStyle(k).position === 'static')
    .map((k) => anchorOf(k))
    .filter((r): r is Rect => r !== null);
}

/**
 * The first element under the point that has text of its own, ignoring the
 * walk's own ring, tether and way out, and the thing being pointed at, since a
 * sentence may sit under the row it is about. */
function inkAt(x: number, y: number, mine: Element | null): DOMRect | null {
  const stack = typeof document.elementsFromPoint === 'function'
    ? document.elementsFromPoint(x, y)
    : [document.elementFromPoint(x, y)].filter(Boolean) as Element[];
  for (const el of stack) {
    if (el.closest('.fr-tether, .fr-ring, .fr-out')) continue;
    if (mine && (el === mine || mine.contains(el) || el.contains(mine))) continue;
    const words = [...el.childNodes].some(
      (n) => n.nodeType === 3 && (n.nodeValue ?? '').trim() !== '',
    );
    if (words) return el.getBoundingClientRect();
  }
  return null;
}

function firstOf(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * One key cap, with the key's name inside it when the glyph does not say it
 * (`keyName` in onboarding.ts decides which). Every cap in the walk is drawn
 * here so they all look the same, and every one is in the glyphs the keyboard
 * in front of it has: ⌘↵ on a Mac, Ctrl+Enter where there is no ⌘. */
export function Cap({ cap, className }: { cap: string; className?: string }) {
  const shown = chord(cap);
  const name = keyName(shown);
  return (
    <kbd className={className}>
      {shown}
      {name ? <span className="fr-cap-word">{name}</span> : null}
    </kbd>
  );
}

/**
 * The coaching card. The quiet line says where you are and the loud line says
 * the one key to press. */
function Card({ say, beat, pointed, knock = 0, onNext, onSkip }: {
  say: Coach;
  /** Next on the look-around cards. ↵ does the same and never reaches the app,
   * where it would open the selected row. */
  onNext?: () => void;
  /** The quiet way past this one card, drawn on every coaching card. */
  onSkip?: () => void;
  /** Stray clicks answered on this beat, from `Ringed`. Added to the same
   * counter a wrong key bumps, so both get the same pulse. */
  knock?: number;
  /** The rows this beat's key is right for, and the row the keys would land
   * on. The right key at the wrong row is answered as a wrong key
   * (see `pressAtWrongRow`). */
  beat?: string[];
  pointed?: string | null;
}) {
  // A wrong press pulses the cap, and an untouched cap starts breathing after
  // a while. The rules are in onboarding.ts.
  const [wrong, setWrong] = useState(0);
  const [breathe, setBreathe] = useState(false);
  // A ref, not an effect dependency: the pointed row changes whenever the mouse
  // crosses a row, and re-registering the listener would restart the breathing
  // clock.
  const aim = useRef<{ beat: string[]; pointed: string | null }>({ beat: [], pointed: null });
  aim.current = { beat: beat ?? [], pointed: pointed ?? null };
  const next = useRef(onNext);
  next.current = onNext;
  // On an any-key card, any key or a click in the palette moves on, and the
  // event is stopped so no command runs by accident. This is registered before
  // the field rule below because on the ⌘K beat the cursor is in the palette's
  // search field.
  useEffect(() => {
    if (!say.anyKey) return;
    const move = (e: Event) => {
      if (!next.current) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      next.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['Meta', 'Shift', 'Alt', 'Control', 'CapsLock'].includes(e.key)) return;
      move(e);
    };
    const onPoint = (e: Event) => {
      const el = e.target as Element | null;
      if (el && typeof el.closest === 'function' && el.closest('.modal.palette')) move(e);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPoint, true);
    window.addEventListener('click', onPoint, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPoint, true);
      window.removeEventListener('click', onPoint, true);
    };
  }, [say.anyKey]);
  useEffect(() => {
    setWrong(0);
    setBreathe(false);
    if (!say.key) return;
    let live = true;
    // The breathing clock restarts on every press, right or wrong.
    let idle = setTimeout(() => { if (live) setBreathe(true); }, BREATHE_AFTER_MS);
    const on = (e: KeyboardEvent) => {
      if (!pressCounts(e.target)) return;
      if (keyToken(e) === null) return;
      setBreathe(false);
      clearTimeout(idle);
      idle = setTimeout(() => { if (live) setBreathe(true); }, BREATHE_AFTER_MS);
      if (say.next && keyToken(e) === say.key && next.current) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        next.current();
        return;
      }
      // A wrong press pulses the cap and is stopped before the app sees it, and
      // so is the right key aimed at the wrong row. The listener is capture
      // phase so it runs before the app's window handlers whatever the
      // registration order. `swallowPress` in onboarding.ts decides what is
      // stopped.
      if (keyToken(e) === say.key && pressAtWrongRow(aim.current.beat, aim.current.pointed)) {
        setWrong((n) => n + 1);
        if (pressCounts(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (!wrongPress(say.key, e)) return;
      // A beat's second key, like E beside R, is not a wrong press.
      if (say.alt && keyToken(e) === say.alt) return;
      setWrong((n) => n + 1);
      if (swallowPress(say.key, e, e.target)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', on, true);
    return () => { live = false; clearTimeout(idle); window.removeEventListener('keydown', on, true); };
  }, [say.key, say.next]);
  // Wrong keys and stray clicks share one count. It keys the cap, so each one
  // replays the pulse, where a class toggled off and on in one frame is never
  // drawn.
  const pulse = wrong + knock;
  return (
    <>
      {/* Not drawn when empty, because an empty span still takes a line. */}
      {say.quiet ? <span className="fr-quiet">{say.quiet}</span> : null}
      <span className={say.quiet ? 'fr-loud' : 'fr-loud fr-alone'}>
        {say.lead}
        {say.key && !say.next && (
          <Cap
            key={pulse}
            cap={say.key}
            className={`${pulse ? 'fr-wrong' : ''}${breathe ? ' fr-breathe' : ''}`.trim() || undefined}
          />
        )}
        {say.tail}
      </span>
      {/* On look-around cards the cap sits on the Next button, so the key and
          the click read as one control. */}
      {say.next && onNext ? (
        <button type="button" className="fr-next" onClick={onNext}>
          Next
          {say.key && (
            <Cap
              key={pulse}
              cap={say.key}
              className={`${pulse ? 'fr-wrong' : ''}${breathe ? ' fr-breathe' : ''}`.trim() || undefined}
            />
          )}
        </button>
      ) : null}
      {say.caps && say.key ? <Lights of={say.caps} cap={say.key} left={beat?.length} /> : null}
      {onSkip ? <button type="button" className="fr-skip-step" onClick={onSkip}>Skip this step</button> : null}
    </>
  );
}

/**
 * Progress dots that count the beat's rows still in the inbox, not key
 * presses, so they never disagree with the screen. `left` is `beat.length`
 * from the app. Counting every `.list-pane .row` is only a fallback, because
 * the list holds rows the beat is not about. With no `left` it polls every
 * 200ms, since nothing tells this component a row went. */
function Lights({ of, cap, left: given }: { of: number; cap: string; left?: number }) {
  const [seen, setSeen] = useState(of);
  useEffect(() => {
    if (given !== undefined) return;
    const read = () => setSeen(document.querySelectorAll('.list-pane .row').length);
    read();
    const t = setInterval(read, 200);
    return () => clearInterval(t);
  }, [given]);
  const left = given ?? seen;
  const lit = Math.max(0, Math.min(of, of - left));
  return (
    <span className="fr-lights" aria-hidden="true" data-key={cap}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < lit ? 'fr-dot fr-lit' : 'fr-dot'} />
      ))}
    </span>
  );
}

/**
 * Lifts a placed card by its real, measured height when it hangs off the
 * bottom of the window or, for a card placed above its ring, onto the ringed
 * thing. `ring` only estimates card height, so this runs once the card is on
 * the screen. */
function lift(card: HTMLElement | null, geo: { ring: { y: number }; below: boolean } | null = null): number {
  if (!card) return 0;
  card.style.removeProperty('--fr-lift');
  const box = card.getBoundingClientRect();
  const off = Math.round(box.bottom - window.innerHeight + FLOOR);
  const onto = geo && !geo.below ? Math.round(box.bottom - (geo.ring.y - TEXT_GAP)) : 0;
  const over = Math.max(off, onto);
  if (over <= 0) return 0;
  // Never off the top. A card with nowhere to go loses its bottom instead,
  // which keeps the line with the key.
  const up = Math.min(over, Math.max(0, box.top - FLOOR));
  if (up <= 0) return 0;
  card.style.setProperty('--fr-lift', `${-up}px`);
  return up;
}

/** Puts back a list that an older build shifted down to make room for the
 * card. It runs on every placement and on unmount. */
function clearRoom(): void {
  for (const el of document.querySelectorAll('[data-fr-room]')) el.removeAttribute('data-fr-room');
  const pane = document.querySelector('.list-pane') as HTMLElement | null;
  pane?.style.removeProperty('--fr-room');
}

/**
 * Where a card beside its ring starts: past the right edge of the bar `sel`,
 * or of the ring if that is further, plus a gap. Reading the bar keeps the
 * card in one place across every press of the tab tour. */
function besideLeft(geo: { ring: { x: number; w: number } }, sel = '.tabs'): number {
  const all = [...document.querySelectorAll(sel)];
  const bar = all.length ? all[all.length - 1].getBoundingClientRect().right : 0;
  return Math.round(Math.max(geo.ring.x + geo.ring.w + 10, bar) + 26);
}

/**
 * Pushes a placed card down until it clears anything bordered just above it
 * (`FLOOR_OF`) by `FLOOR`. It only looks at gaps of -40 to 200px, so a card
 * lying fully over a row is left alone rather than pushed further into the
 * list. */
function settle(card: HTMLElement | null): number {
  if (!card) return 0;
  card.style.removeProperty('--fr-drop');
  const gap = () => {
    const b = card.getBoundingClientRect();
    let d: number | null = null;
    for (const el of document.querySelectorAll(FLOOR_OF)) {
      const e = el.getBoundingClientRect();
      if (e.width < 8 || e.height < 8) continue;
      if (!(b.left < e.right && b.right > e.left)) continue;
      const g = Math.round(b.top - e.bottom);
      if (g >= -40 && g < 200 && (d === null || g < d)) d = g;
    }
    return d;
  };
  const before = gap();
  if (before === null || before >= FLOOR) return 0;
  const drop = FLOOR - before;
  card.style.setProperty('--fr-drop', `${drop}px`);
  return drop;
}

/**
 * The dimming veil, with a soft elliptical hole on the ring. An ellipse,
 * because a circle wide enough for a list row is wider than the window. A
 * stray click deepens it briefly, so the eye goes back to the ringed thing. */
function Veil({ box, knocked = '' }: {
  box: { x: number; y: number; w: number; h: number } | null;
  /** ' fr-knock' while a stray click is being answered, otherwise empty. A
   * class, not a count, because the caller already keys this on the count. */
  knocked?: string;
}) {
  if (!box) return <div className={`fr-veil${knocked}`} aria-hidden="true" />;
  const cx = Math.round(box.x + box.w / 2), cy = Math.round(box.y + box.h / 2);
  const rx = Math.round(box.w / 2 + 26), ry = Math.round(box.h / 2 + 26);
  const mask = `radial-gradient(${rx + 150}px ${ry + 150}px at ${cx}px ${cy}px,`
    + ` rgba(0,0,0,0) 0%, rgba(0,0,0,0) ${Math.round((100 * rx) / (rx + 150))}%, rgba(0,0,0,1) 100%)`;
  return (
    <div
      className={`fr-veil${knocked}`}
      style={{ WebkitMaskImage: mask, maskImage: mask } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}

/** How long a beat may have nothing to point at before its card is printed anyway. */
const ADRIFT_MS = 900;

/** The top of the list, under the team layout's tabs when they are drawn. */
function adriftAt(): { x: number; y: number; w: number } {
  const pane = document.querySelector('.list-pane') ?? document.querySelector('.body');
  const r = pane ? pane.getBoundingClientRect() : null;
  const bar = document.querySelector('.th-bar');
  const head = bar ? bar.getBoundingClientRect().bottom + 28 : (r && r.height > 0 ? r.top + 48 : 120);
  // Below the last row when there is room, so the card does not cover threads.
  const rows = document.querySelector('.list-pane .list');
  const under = rows ? rows.getBoundingClientRect().bottom + 28 : 0;
  const top = under > head && under < window.innerHeight - 200 ? under : head;
  const left = r && r.width > 0 ? r.left + 40 : 80;
  const right = r && r.width > 0 ? r.right : window.innerWidth;
  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(Math.max(TEXT_MIN, Math.min(TEXT_MAX + 120, right - left - 40))),
  };
}

function Ringed({
  selector, boundsSel, underSel, makesRoom, say, beside, besideRing, besideOf, beat, pointed,
  hold, also, onNext, onSkip,
}: {
  selector: string[]; boundsSel?: string; underSel?: string; say: Coach;
  /** The look around's Next. See `Card`. */
  onNext?: () => void;
  /** The quiet "Skip this step". See `Card`. */
  onSkip?: () => void;
  /** Set on beats that ring one row out of a stack. It overrides `underSel`,
   * so the card stays by its ring instead of dropping below the stack. */
  makesRoom?: boolean;
  beside?: boolean;
  /** Stand the card off the ring rather than off a bar of controls. */
  besideRing?: boolean;
  /** The bar of controls to clear when it is not the tabs. See `besideLeft`. */
  besideOf?: string;
  /** Passed through to `Card`, which answers the press. */
  beat?: string[]; pointed?: string | null;
  /** Hold the app to this beat. True exactly when `practising`. */
  hold?: boolean;
  /** The second thing this beat is about, when its card names one. `ALSO`. */
  also?: string[];
}) {
  const [geo, setGeo] = useState<ReturnType<typeof ring> | null>(null);
  // Where the card goes when the thing it points at is not on the screen.
  const [adrift, setAdrift] = useState<{ x: number; y: number; w: number } | null>(null);
  const lostAt = useRef<number | null>(null);
  const cardRef = useRef<HTMLParagraphElement>(null);
  // Stray clicks answered on this beat. A count, not a flag, because the count
  // keys the element: two quick clicks remount it twice, where a class toggled
  // off and on in one frame is never drawn.
  const [knock, setKnock] = useState(0);
  useEffect(() => { setKnock(0); }, [selector.join('|')]);

  useLayoutEffect(() => {
    let live = true;
    // A beat with nothing to point at still prints its card, with no ring,
    // after ADRIFT_MS, unless something is open over the app.
    const lost = () => {
      setGeo(null);
      if (document.querySelector('.modal-backdrop')) { lostAt.current = null; setAdrift(null); return; }
      const t = Date.now();
      if (lostAt.current === null) lostAt.current = t;
      if (t - lostAt.current >= ADRIFT_MS) setAdrift(adriftAt());
    };
    const measure = () => {
      if (!live) return;
      const el = firstOf(selector);
      if (!el) { lost(); return; }
      // The walk draws above any modal, so while one is open it draws only if
      // its target is inside that modal, and otherwise waits.
      const over = [...document.querySelectorAll(".modal-backdrop")];
      if (over.length && !over.some((o) => o.contains(el))) { lostAt.current = null; setAdrift(null); setGeo(null); return; }
      const box = anchorOf(el);
      if (!box) { lost(); return; }
      lostAt.current = null;
      setAdrift(null);
      const b = boundsSel ? document.querySelector(boundsSel) : null;
      const br = b ? b.getBoundingClientRect() : null;
      const view = { w: window.innerWidth, h: window.innerHeight };
      const room = roomFor(box, neighboursOf(el));
      const g = ring(box, { left: br ? br.left : 0, right: br ? br.right : view.w }, view, room);
      // With `underSel`, the card drops below that whole element so it does not
      // cover the rows under the ringed one.
      const under = underSel && !makesRoom ? document.querySelector(underSel) : null;
      if (under) g.text.y = Math.round(under.getBoundingClientRect().bottom + padFor(box) + TEXT_GAP);
      // Step the card down off any text already there. It probes three points
      // across the first line, since a short title can miss the middle one, and
      // tries four times so it can walk past a stack of rows.
      if (g.below && !under && !makesRoom) {
        for (let i = 0; i < 4; i += 1) {
          const xs = [g.text.x + 4, g.text.x + Math.min(g.text.w, 300) / 2, g.text.x + Math.min(g.text.w, 300) - 4];
          const hits = xs
            .map((x) => inkAt(x, g.text.y + LINE_H / 2, el))
            .filter(Boolean) as DOMRect[];
          if (!hits.length) break;
          const moved = clearOf(g.text.y, LINE_H, hits, view);
          if (moved === g.text.y) break;
          g.text.y = moved;
        }
      }
      setGeo(g);
      // The card floats over the rows below its ring. The list never moves.
      clearRoom();
    };
    measure();
    // The target moves (the compose card grows as she types), so it is
    // re-measured on a timer until the step ends.
    const t = setInterval(measure, 200);
    window.addEventListener('resize', measure);
    return () => { live = false; clearInterval(t); window.removeEventListener('resize', measure); };
  }, [selector.join('|'), boundsSel, underSel, makesRoom]);

  useLayoutEffect(() => {
    clearRoom();
  });
  useLayoutEffect(() => () => clearRoom(), []);

  // A ref, so the click listener below is registered once per beat rather
  // than every time `geo` is re-measured.
  const drawn = useRef(false);
  drawn.current = !!geo;

  // Stray clicks are held in the capture phase on the window, the way a wrong
  // key is. Nothing is held while no ring is drawn, since there would be
  // nothing to send the eye back to. A look-around card holds every click on
  // the app, because its ring is something to look at, and only its Next
  // moves on.
  const lookOnly = useRef(false);
  lookOnly.current = !!say.next;
  useEffect(() => {
    if (!hold) return undefined;
    const on = (e: Event) => {
      if (!drawn.current) return;
      const el = e.target as Element | null;
      const live = [
        firstOf(selector),
        ...(also ?? []).flatMap((s) => [...document.querySelectorAll(s)]),
      ];
      const stray = lookOnly.current
        ? !!el && typeof el.closest === 'function' && !el.closest(NOT_THE_APP) && pressCounts(el)
        : strayClick(e.target, live);
      if (!stray) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      // One mouse press arrives as several HELD_EVENTS. All are stopped, and
      // only the click is answered.
      if (e.type === 'click') {
        e.preventDefault();
        setKnock((n) => n + 1);
      }
    };
    for (const t of HELD_EVENTS) window.addEventListener(t, on, true);
    return () => { for (const t of HELD_EVENTS) window.removeEventListener(t, on, true); };
  }, [hold, selector.join('|'), (also ?? []).join('|')]);

  // Runs after every render, because it needs the card's real height.
  useLayoutEffect(() => { settle(cardRef.current); lift(cardRef.current, geo); });

  // A card with no ring dims the whole window, so its words do not sit on top
  // of the app at full strength.
  if (!geo) {
    if (!adrift) return null;
    return (
      <>
        <Veil box={null} />
        <p
          ref={cardRef}
          className="fr-tether fr-adrift"
          style={{ left: adrift.x, top: adrift.y, maxWidth: adrift.w }}
          role="status"
        ><Card say={say} beat={beat} pointed={pointed} knock={knock} onNext={onNext} onSkip={onSkip} /></p>
      </>
    );
  }
  const pad = 10;
  // A stray click deepens the veil, swells the ring once and pulses the cap,
  // with no words. `knock` keys the veil and the halo so each click replays it.
  const knocked = knock ? ' fr-knock' : '';
  return (
    <>
      <Veil key={knock} box={geo.ring} knocked={knocked} />
      <svg
        className="fr-ring"
        style={{ left: geo.ring.x - pad, top: geo.ring.y - pad }}
        width={geo.ring.w + pad * 2} height={geo.ring.h + pad * 2} aria-hidden="true"
      >
        <rect
          key={knock}
          className={`halo${knocked}`}
          x={pad} y={pad} width={geo.ring.w} height={geo.ring.h} rx={geo.ring.r}
        />
      </svg>
      {beside ? (
        // Vertically centred on the ring. The half-height shift is in the
        // class's transform, because the drop and the lift use that transform
        // too.
        <p
          ref={cardRef}
          className="fr-tether beside"
          style={{
            // Clear of the whole tab strip, so the card covers no tab and stays
            // put while the ring moves. With `besideRing` (the palette) it
            // stands off the ring instead, because there is no strip to clear.
            left: besideRing ? Math.round(geo.ring.x + geo.ring.w + 26) : besideLeft(geo, besideOf),
            top: geo.ring.y + geo.ring.h / 2,
            maxWidth: besideRing
              ? Math.max(240, window.innerWidth - (geo.ring.x + geo.ring.w + 26) - 40)
              // No wider than an ordinary card, so it stays off the header.
              : Math.max(240, Math.min(TEXT_MAX + 60, window.innerWidth - besideLeft(geo, besideOf) - 200)),
          }}
          role="status"
        ><Card say={say} beat={beat} pointed={pointed} knock={knock} onNext={onNext} onSkip={onSkip} /></p>
      ) : (
        <p
          ref={cardRef}
          className={geo.text.right === null ? 'fr-tether' : 'fr-tether right'}
          style={geo.text.right === null
            ? { left: geo.text.x, top: geo.text.y, maxWidth: geo.text.w }
            : { right: geo.text.right, top: geo.text.y, maxWidth: geo.text.w }}
          role="status"
        ><Card say={say} beat={beat} pointed={pointed} knock={knock} onNext={onNext} onSkip={onSkip} /></p>
      )}
    </>
  );
}

/**
 * The walk's last card. It is the same import card ⌘K opens
 * (`<ImportAgents walk>`), plus what belongs to the walk: the gate when Claude
 * Code is missing, going straight in when there is nothing to import, and
 * ending the walk. `finishCard` in ../onboarding picks the shape. */
function Finished({
  found, folders, claude, products, project, onDone, onFiled, onProjectMade, onRecheck,
}: {
  found: { user: AgentFile[]; project: AgentFile[] } | null;
  /** Every folder on this Mac with agents in it, read a beat early. Null while
   * still reading. */
  folders: AgentFolder[] | null;
  /** Whether Claude Code is missing, and where to get it. `missing` is true
   * only once the whole search has come back sure, so any sign of Claude Code
   * gets the ending. */
  claude: { missing: boolean; url: string };
  /** The walk's own project first, then the others, never the practice one (`walkProjects`). */
  products: { slug: string; name: string; repoPath: string | null }[];
  project: string | null;
  /** The way out with nothing brought in, and the end of the walk. */
  onDone: (chosen: string[]) => void;
  /** The import card has already filed the agents, so this only ends the walk
   * and reports what landed, for the confetti. */
  onFiled: (p: { added: number; already: number; inboxes: number; made: string[]; noun?: string; done?: number }) => void;
  /** A project was made on the card. The app redraws its sidebar. */
  onProjectMade?: (slug: string) => void;
  /** Look for Claude Code again from scratch. Resolves to whether it is still
   * missing. */
  onRecheck: () => Promise<boolean>;
}) {
  // Conversations can be imported with no agent files at all (a Codex-only Mac
  // has nothing in ~/.claude/agents), so wait for this read before skipping an
  // empty finish card.
  const [threads, setThreads] = useState<SessionThread[] | null>(null);
  useEffect(() => {
    let live = true;
    import('../api').then(({ api }) => api.agentThreads())
      .then((t) => { if (live) setThreads(t); })
      .catch(() => { if (live) setThreads([]); });
    return () => { live = false; };
  }, []);
  const some = (!!found && anyAgents(found)) || !!folders?.some((f) => f.count > 0);
  const card = finishCard(claude, { read: found !== null && folders !== null, some }, threads);
  const [checking, setChecking] = useState(false);
  const [tried, setTried] = useState(false);
  const recheck = async () => {
    if (checking) return;
    setChecking(true);
    setRefused(null); // whatever the panel said is about a press before this one
    try { setTried(await onRecheck()); }
    finally { setChecking(false); }
  };
  // "Show me where it is" opens a file panel in the main process and applies
  // the choice there in the same call, so no path crosses the bridge
  // (`zero:engine-bin` in main/ipc.mjs).
  const [pointing, setPointing] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const point = async () => {
    if (pointing) return;
    setPointing(true);
    setRefused(null);
    try {
      const { api } = await import('../api');
      const r = await api.engineBin('claude');
      // One note under the rows: a refusal replaces "still nothing here".
      if (r?.refused) { setRefused(r.refused); setTried(false); }
      if (!r?.canceled && !r?.refused) setTried(await onRecheck());
    } finally {
      setPointing(false);
    }
  };
  const skip = !!card.skip;
  useEffect(() => { if (skip) onDone([]); }, [skip]);
  // Nothing at all while the Mac is still being read, so no veil flickers.
  if (!card.show) return null;

  // No veil under the import card. Its own backdrop already dims the app.
  if (!card.blocked) {
    return (
      <>
        <ImportAgents
          products={products}
          filter={project}
          walk={{
            line: COPY.agentsOffer,
            skip: COPY.finishGo,
            onSkip: () => onDone([]),
            folders,
          }}
          onDone={onFiled}
          onProjectMade={onProjectMade}
          // No-ops on purpose. The walk already made a project, and a step of
          // the walk cannot be closed.
          onNewProject={() => {}}
          onClose={() => {}}
        />
      </>
    );
  }
  // The gate when Claude Code is missing, drawn like the plan question.
  if (card.blocked) {
    return (
      <>
        <Veil box={null} />
        <div className="fr-stack fr-stack-folders" role="status">
          <h1 className="fr-page">{card.head}</h1>
          <p className="fr-lede">{card.line}</p>
          {/* Check again drops the cached shell answer first and really
              searches (`recheckClaude` in main/settings.mjs). */}
          <AskList
            rows={gateRows(claude.url, { checking, pointing })}
            label={card.head}
            busy={checking || pointing}
            onPick={(key) => { if (key === 'check') void recheck(); else void point(); }}
          />
          <p className={refused ? 'fr-note fr-refused' : 'fr-note'}>
            {refused ?? (tried && !checking ? COPY.gateStill : COPY.gateDo)}
          </p>
        </div>
      </>
    );
  }

}

/** How long the landing message stays up. Any key or click takes it down
 * sooner. */
export const LANDED_MS = 14_000;

/**
 * The end of the walk, over the person's own inbox: confetti and what to do
 * next. It takes no clicks and nothing needs pressing, so it never blocks the
 * first real task. */
export function Landed({ agents, onGone }: {
  /** Whether any agents were kept, which picks the line that is true of the
   * inbox behind it. */
  agents: boolean;
  onGone: () => void;
}) {
  // Computed once in a ref so a re-render does not restart the burst.
  const pieces = useRef<{ left: number; delay: number; drift: number; spin: number; hue: number; fall: number }[]>(
    Array.from({ length: 40 }, (_, i) => ({
      left: 4 + ((i * 97) % 92),
      delay: ((i * 53) % 40) / 100,
      drift: ((i * 31) % 120) - 60,
      spin: ((i * 71) % 540) - 270,
      hue: [199, 267, 42, 158, 12][i % 5],
      fall: 62 + ((i * 17) % 26),
    })),
  );
  const team = useContext(TeamContext);
  useEffect(() => {
    const t = setTimeout(onGone, LANDED_MS);
    // Any key or press takes it down and still reaches the app, so the event is
    // neither stopped nor prevented.
    const on = () => onGone();
    const armed = setTimeout(() => window.addEventListener('keydown', on), 0);
    const armedClick = setTimeout(() => window.addEventListener('pointerdown', on), 0);
    return () => {
      clearTimeout(t); clearTimeout(armed); clearTimeout(armedClick);
      window.removeEventListener('keydown', on);
      window.removeEventListener('pointerdown', on);
    };
  }, [onGone]);
  return (
    <div className="fr-landed" aria-live="polite">
      <div className="fr-burst" aria-hidden="true">
        {pieces.current.map((p, i) => (
          <span
            key={i}
            className="fr-bit"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              ['--fr-drift' as string]: `${p.drift}px`,
              ['--fr-spin' as string]: `${p.spin}deg`,
              ['--fr-fall' as string]: `${p.fall}vh`,
              background: `hsl(${p.hue} 78% 62%)`,
            }}
          />
        ))}
      </div>
      <div className="fr-landed-say">
        <h1 className="fr-landed-head">{COPY.finishHead}</h1>
        <p className="fr-landed-line">{agents ? COPY.finishLineAgents : COPY.finishLine}</p>
        <ul className="fr-landed-next">
          {[...COPY.finishNext, ...(team ? COPY.finishNextTeam : [])].map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </div>
  );
}

/**
 * The strip above the app for as long as the practice project is up, saying
 * the app in front of you is not yours yet. It belongs to the project, not to
 * a step, so it is rendered beside the walk rather than inside it. */
export function PracticeBand() {
  return (
    <div className="fr-band" role="note">
      {/* Only this lane drags the window, and it stops 120px short of the right
          edge so no drag rectangle covers `.fr-out`. Electron merges drag
          and no-drag rectangles in the order they are reported, so a no-drag
          button inside a full-width drag strip can still be swallowed as title
          bar, and on macOS the page never sees the press. */}
      <div className="fr-band-drag" aria-hidden="true" />
      <span className="fr-band-pill">
        <span className="fr-band-dot" aria-hidden="true" />
        <span className="fr-band-tag">{COPY.bandTag}</span>
        <span className="fr-band-say">{COPY.band}</span>
      </span>
    </div>
  );
}

/** A still of the real sidebar, using its own markup and classes. */
function PieceNav({ count = 0, on = 'inbox' }: { count?: number; on?: 'inbox' | 'progress' }) {
  const row = (view: 'inbox' | 'progress' | 'done', label: string, active = on === view) => (
    <button
      className={`workspace-tab${active ? ' active' : ''}${view === 'inbox' && count > 0 ? ' has-count' : ''}`}
      type="button" tabIndex={-1}
    >
      <SidebarIcon view={view} /><span>{label}</span>
      {view === 'inbox' && count > 0 && <small className="workspace-running">{count}</small>}
    </button>
  );
  return (
    <div className="workspace-navigation fr-piece-nav" aria-hidden="true">
      <nav className="workspace-tabs">
        {row('inbox', 'Inbox')}
        {row('progress', 'In progress')}
      </nav>
      <div className="fr-piece-nav-foot">{row('done', 'Closed')}</div>
    </div>
  );
}

/** Rows from several invented projects, drawn under the practice rows in the
 * first picture, so it shows many agents across many kinds of work. */
const INTRO_MORE: Array<{ title: string; result: string; agoMs: number; project: string }> = [
  { title: 'Drafted the agenda for the offsite.', result: 'Three sessions and a working lunch. I left the dinner spot for you to pick.', agoMs: 38 * 60_000, project: 'Operations' },
  { title: 'Which launch date should we announce?', result: 'The 14th clears every review. The 7th is a week tighter but still possible.', agoMs: 44 * 60_000, project: 'Launch' },
  { title: 'Rewrote the pricing page.', result: 'All three plans now say the same thing in the same order. Ready for you to read.', agoMs: 52 * 60_000, project: 'Website' },
  { title: 'Summarised this week of customer calls.', result: 'Five calls, and two of them asked for the same thing. One page of notes.', agoMs: 61 * 60_000, project: 'Research' },
];

/** The second slide's In progress list: agents working on their own, each
 * with its current step. */
const INTRO_WORKING: Array<{ title: string; step: string; project: string }> = [
  { title: 'Tidy the vendor contact list.', step: 'Removing duplicates.', project: 'Operations' },
  { title: 'Draft the release notes for March.', step: 'Reading what changed this month.', project: 'Launch' },
  { title: 'Find why checkout is slow on Safari.', step: 'Timing the payment form.', project: 'Website' },
  { title: 'Book rooms for the team offsite.', step: 'Comparing three hotels.', project: 'Operations' },
  { title: 'Turn the survey answers into a chart.', step: 'Counting answers by team.', project: 'Research' },
  { title: 'Fix the broken link in the welcome email.', step: 'Checking every link in it.', project: 'Website' },
  { title: 'Write up the hiring plan.', step: 'Drafting the timeline.', project: 'Launch' },
];

/**
 * The part of the app an introduction slab is about, drawn with the app's own
 * classes at full size and cut off by the window edge rather than shrunk. The
 * rows are the practice rows the walk uses later. */
function IntroPiece({ kind }: { kind: 'list' | 'ask' | 'empty' | 'progress' }) {
  if (kind === 'progress') {
    return (
      <div className="fr-piece fr-piece-with-nav" aria-hidden="true">
        <PieceNav on="progress" count={3} />
        <div className="list-pane">
          <div className="list">
            <div><div className="day-label">Working now</div></div>
            {INTRO_WORKING.map((r) => (
              <div className="row" key={r.title}>
                <div className="row-main">
                  <div className="subject">{r.title}</div>
                  <div className="preview">{r.step}</div>
                </div>
                <div className="row-end">
                  <span className="product">{r.project}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'ask') {
    return (
      <div className="fr-piece fr-piece-ask" aria-hidden="true">
        <div className="modal compose">
          <div className="compose-text">{PRACTICE_TASK.title}</div>
          <div className="compose-sentence quiet rest-project">
            <span className="compose-clauses">
              <span className="clause clause-project">For {PRACTICE_NAME}.</span>
            </span>
            <button className="dock-send" type="button" tabIndex={-1}>
              Start it <kbd>{chord('⌘↵')}</kbd>
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fr-piece fr-piece-with-nav" aria-hidden="true">
      <PieceNav count={kind === 'list' ? PRACTICE_ROWS.length + INTRO_MORE.length : 0} />
      {kind === 'list' ? (
        <div className="list-pane">
          {/* Rows need a .list parent: --gutter, --text-x and --row-r are
              declared only there. */}
          <div className="list">
            <div><div className="day-label">Today</div></div>
            {[...PRACTICE_ROWS.map((r) => ({ ...r, project: PRACTICE_NAME })), ...INTRO_MORE].map((r) => (
              <div className="row" key={r.title}>
                <div className="row-main">
                  <div className="subject">{r.title}</div>
                  <div className="preview">{r.result}</div>
                </div>
                <div className="row-end">
                  <span className="product">{r.project}</span>
                  <span className="time">{Math.round(r.agoMs / 60_000)}m</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // The real inbox zero page's markup and classes.
        <div className="list-pane bare fr-piece-empty">
          <div className="zero-state idle">
            <div className="idle-zero-col">
              <b className="idle-zero">0</b>
              <span className="idle-zero-say">Inbox zero · {INTRO_WORKING.length} agents working</span>
              <span className="idle-field">
                <span className="idle-ph">What do you need done?</span>
                <span className="idle-key">N</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One introduction slab: words on the left, the app on the right, and Enter
 * moves on. */
function Slab({ head, line, piece, onNext }: {
  head: string; line: string;
  piece: 'list' | 'ask' | 'empty' | 'progress'; onNext: () => void;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onNext();
    };
    // Listen from the next tick. React can run this effect while the Enter
    // that opened this screen is still being dispatched, and that press would
    // skip this screen too. `walkAgain` in App.tsx does the same.
    const t = setTimeout(() => window.addEventListener('keydown', on), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', on); };
  }, [onNext]);
  return (
    <div className="fr-screen fr-screen-intro">
      <div className="fr-brand"><AppMark size={22} />{NAME}</div>
      <IntroPiece kind={piece} />
      <div className="fr-corner">
        <div>
          <h1 className="fr-head">{head}</h1>
          <p className="fr-intro-line">{line}</p>
        </div>
        <button className="fr-go" onClick={onNext}>{COPY.introNext} <Cap cap="↵" /></button>
      </div>
    </div>
  );
}

/** One statement and one button, in the finish card's shape. Used for the
 * rule and the hand-off. */
function Statement({ head, line, go, onNext, skip, onSkip }: {
  head: string; line: string; go: string; onNext: () => void;
  /** A quiet second button under the main one. */
  skip?: string; onSkip?: () => void;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onNext();
    };
    // Next tick, for the same reason as in `Slab`.
    const t = setTimeout(() => window.addEventListener('keydown', on), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', on); };
  }, [onNext]);
  return (
    <div className="fr-screen">
      <div className="fr-brand"><AppMark size={22} />{NAME}</div>
      <div className="fr-stack">
        <div className="fr-finish" role="status">
          <h1 className="fr-finish-head">{head}</h1>
          <p className="fr-finish-line">{line}</p>
          <button className="fr-finish-go" onClick={onNext} autoFocus>{go}</button>
          {skip && onSkip ? <button type="button" className="fr-finish-skip" onClick={onSkip}>{skip}</button> : null}
        </div>
      </div>
    </div>
  );
}

export function Onboarding({
  run, claude, home, opened, waiting, later, picking, palette, board, replying, view, tabs, products = [],
  beat, pointed, runsOn = null,
  onEvent, onStep, onSkipToApp, onPractice, onDone, onFiled, onProjectMade, onRecheck, onLeave, onShut, onSkipStep,
}: {
  /** Skip the tutorial from its hand-off page, into her own project. */
  onLeave?: () => void;
  /** Shut whatever is open over the app; the ⌘K beat's any-key press. */
  onShut?: () => void;
  /** The quiet "Skip this step" on every coaching card. */
  onSkipStep?: () => void;
  run: FirstRun;
  /** Every project the app has; the last card files into them (`walkProjects`). */
  products: Project[];
  /** Whether a task is open in the reading pane, for beats with a second half
   * in the pane. */
  opened?: boolean;
  /** The stopped row's id, so its beat rings that row. Null before the rows
   * exist. */
  waiting?: string | null;
  /** The snoozeable row's id, for the same reason as `waiting`. */
  later?: string | null;
  /** Whether the snooze picker is open, for the snooze beat's second half. */
  picking?: boolean;
  /** Whether the command palette is open, for the last beat's second half. */
  palette?: boolean;
  /** Whether the page is drawn as the board, for the board beat's second half. */
  board?: boolean;
  /** Whether the reply box is open, for the answer beat's second half. */
  replying?: boolean;
  /** The rows the current beat's key is right for, in drawn order, and the
   * row the row keys would land on (the row under the pointer, else the
   * keyboard's). The ring goes round `beat[0]`, and the beat's key aimed
   * outside `beat` never reaches the app. See `beatRows` and `pressAtWrongRow`
   * in onboarding.ts. */
  beat?: string[];
  pointed?: string | null;
  /** The app's own Tab rotation, so the walk keeps no second copy of it. */
  tabs?: string[];
  /** Which tab is up. The tab tour reads the screen from this rather than
   * counting presses. */
  view?: string;
  claude: { missing: boolean; url: string };
  home: string;
  /** What this Mac is already signed into, or null, which gets the plan
   * question instead. A set-up Mac skips that question, so the folder screen
   * says once where agents will run. */
  runsOn?: RunsOn | null;
  /** Something really happened: a folder chosen, a project made. */
  onEvent: (e: { t: 'start' } | { t: 'folder'; path: string } | { t: 'noFolder' } | { t: 'name'; name: string }) => void;
  /** Move to a step. Separate from onEvent because a move records nothing. */
  onStep: (step: FirstRun['step']) => void;
  /** The name screen's Next: make the project, then walk on. Resolves to the
   * reason it was not made, or null when it was. */
  onSkipToApp: (p: { name: string; folder: string | null }) => Promise<string | null> | void;
  /** The hand-off screen's button: make the practice project with its rows,
   * and open it. */
  onPractice: () => void;
  /** End the walk, filing the agents named. Every current caller passes an
   * empty list. */
  onDone: (chosen: string[]) => void;
  /** End the walk after the import card has filed the agents itself. Reports
   * what landed, for the confetti. */
  onFiled: (p: { added: number; already: number; inboxes: number; made: string[]; noun?: string; done?: number }) => void;
  /** A project was made on the last card. The app redraws its sidebar. */
  onProjectMade?: (slug: string) => void;
  /** Look for Claude Code again from scratch. Resolves to whether it is still
   * missing. Optional so a test can draw the walk with no main process. */
  onRecheck?: () => Promise<boolean>;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  // Null unless this Mac is signed into a team.
  const team = useContext(TeamContext);
  const [busy, setBusy] = useState(false);
  // Why the project was not made, when it was not.
  const [notMade, setNotMade] = useState<string | null>(null);
  // Why a folder pick was turned down, on the screen that asked for it.
  const [refused, setRefused] = useState<string | null>(null);
  // Up when there is no Mac picker to open, which is a browser tab.
  const [browsing, setBrowsing] = useState(false);
  // Folders that already have agent conversations. Null while being read, so
  // the list never flashes empty. Read from the welcome on, because the read
  // can take seconds.
  const [recent, setRecent] = useState<RecentFolder[] | null>(null);
  // Nothing is lit until the person picks, so the Return that left the welcome
  // cannot choose a folder. Arrow down lights the first.
  const [lit, setLit] = useState(-1);
  const wantsRecent = run.step === 'welcome' || run.step === 'folder';
  useEffect(() => {
    if (!wantsRecent || recent) return;
    let live = true;
    import('../api').then(({ api }) => api.agentThreads())
      .then((threads) => { if (live) setRecent(recentFolders(threads, { home })); })
      .catch(() => { if (live) setRecent([]); });
    return () => { live = false; };
  }, [wantsRecent, recent, home]);
  // Whether Claude Code and Codex are found and signed in, asked while the
  // welcome is up because each tool's status check takes a few seconds. The
  // full readings are cached, not just the one boolean, because the plan question
  // needs them as `look`. `fresh` drops the cache, for after pointing at a file
  // on the plan question.
  const asked = useRef<Promise<Readings> | null>(null);
  const askMac = (fresh = false) => {
    if (fresh || !asked.current) {
      asked.current = import('../api').then(({ api }) => Promise.all([
        api.engineSetup('ready', 'claude'), api.engineSetup('ready', 'codex'),
      ])).then((r) => r.map((x) => ({ engine: x.engine, found: !!x.found, signedIn: !!x.signedIn })))
        // A failed probe reads as empty, which sends them to the plan question
        // rather than stopping the walk.
        .catch(() => []);
    }
    return asked.current;
  };
  useEffect(() => { if (run.step === 'welcome') void askMac(); }, [run.step]);
  const [plan, setPlan] = useState<Plan | null>(null);
  /*
   * WHAT WAS FOUND, when something was (w-e217e577e5). A computer with a plan
   * already signed in used to walk straight past the plan step and be told
   * nothing at all, so the first anybody knew of it was an agent spending
   * their tokens. Everybody meets the step now: it asks the question or it
   * gives the answer, and this is which.
   */
  const [alreadyHere, setAlreadyHere] = useState<Readings | null>(null);
  // ANYTHING FOUND AT ALL IS THE FOUND SCREEN, not only something signed in,
  // and handing the reading in keeps the first frame the right one.
  const begin = async () => {
    const readings = await askMac();
    setAlreadyHere(afterCheck(readings).t === 'nothing' ? null : readings);
    setPlan(null);
    onStep('plan');
  };
  const [now, setNow] = useState(() => Date.now());
  // Whether focus is in the reply box. The app's `replying` can move on while
  // the box stays focused, and then a "Press R" card would type an r into it.
  const [inReply, setInReply] = useState(false);
  useEffect(() => {
    const read = () => {
      const el = document.activeElement as Element | null;
      setInReply(!!el && typeof el.closest === 'function' && !!el.closest('.focus-dock'));
    };
    read();
    window.addEventListener('focusin', read);
    window.addEventListener('focusout', read);
    return () => { window.removeEventListener('focusin', read); window.removeEventListener('focusout', read); };
  }, []);
  // The agent files, read once. Null while reading, so the card never flashes
  // an empty list.
  const [found, setFound] = useState<{ user: AgentFile[]; project: AgentFile[] } | null>(null);
  // Bumped when Check again finds Claude Code, so both reads run again.
  const [lookedAgain, setLookedAgain] = useState(0);
  // Every folder on this Mac with agents in it, read early so the last card
  // does not fill in while it is on screen. Null while reading.
  const [folders, setFolders] = useState<AgentFolder[] | null>(null);

  // Every Next goes through `nextStep`, so the order lives only in `STEPS`.
  const go = (from: FirstRun['step']) => { const n = nextStep(from); if (n) onStep(n); };

  // The working line changes at fifteen seconds, so this step has a clock.
  useEffect(() => {
    if (run.step !== 'working') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run.step]);

  useEffect(() => { if (run.step === 'name') nameRef.current?.focus(); }, [run.step]);

  // Escape never steps back on the setup screens, because people press it to
  // shake off a chooser or a menu. The back arrow is the only way back.
  const backTo = stepBack(run.step);

  // The agent files in the home and project folders, read one beat early (on
  // ⌘K) so the finish card is whole when it appears. A read that found
  // something is final. One that found nothing is read again on the last card
  // and after Check again finds Claude Code, since installing it may add agents.
  const again = readAgentsAgain(found);
  useEffect(() => {
    if (run.step !== 'command' && run.step !== 'done') return;
    if (!again) return;
    let live = true;
    (async () => {
      const { api } = await import('../api');
      const r = await api.agentFiles({ folder: run.folder, product: run.product });
      if (!live) return;
      // A second empty read leaves state alone, so the effect does not loop.
      const now = { user: r.user, project: r.project };
      if (!keepSecondRead(found, now)) return;
      setFound(now);
    })();
    return () => { live = false; };
  }, [run.step, run.folder, run.product, found, again, lookedAgain]);

  // The disk scan is a separate, slower read, so the card does not wait on it.
  // It starts only on the last card because it lists folders beside the
  // project, and under ~/Desktop macOS shows its folder permission prompt,
  // which should appear on the card that needs it.
  useEffect(() => {
    if (run.step !== 'done') return;
    if (folders) return;
    let live = true;
    (async () => {
      const { api } = await import('../api');
      let f: AgentFolder[] = [];
      try { f = await api.agentFolders(); } catch { f = []; }
      if (live) setFolders(f);
    })();
    return () => { live = false; };
  }, [run.step, folders]);

  useEffect(() => {
    if (run.step !== 'welcome') return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); void begin(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [run.step, onEvent]);

  // The folder list's keys: arrows move the highlight through the recent
  // folders, "Choose another folder" and the no-folder row, and Return takes
  // it. Armed on the next tick so the Return that arrived here does not leave.
  const rows = recent?.length ?? 0;
  useEffect(() => {
    if (run.step !== 'folder' || recent === null) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setLit((i) => Math.min(rows + 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setLit((i) => Math.max(0, i - 1)); }
      if (e.key === 'Enter' && lit > rows) { e.preventDefault(); skipFolder(); return; }
      if (e.key === 'Enter' && lit < 0) { e.preventDefault(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (lit < rows && recent[lit]) takeFolder(recent[lit].folder);
        else pickFolder();
      }
    };
    const t = setTimeout(() => window.addEventListener('keydown', on), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', on); };
  });

  const pickFolder = async () => {
    const { api } = await import('../api');
    const { path: picked, refused: why, browse } = await api.chooseFolder(run.folder ?? undefined);
    // In a browser tab there is no Mac picker, so the app draws its own.
    if (browse) { setRefused(null); setBrowsing(true); return; }
    // Main refuses some paths, such as the home folder, because a worker that
    // starts there makes macOS ask about each protected folder in turn. Show
    // the reason.
    if (why) { setRefused(why); return; }
    if (picked) takeFolder(picked);
  };

  // With no folder, the project's agents work in a folder the app keeps for it.
  const skipFolder = () => {
    setRefused(null);
    onEvent({ t: 'noFolder' });
    onStep('name');
  };

  const takeFolder = (picked: string) => {
    setRefused(null);
    onEvent({ t: 'folder', path: picked });
    onStep('name');
  };

  const make = async () => {
    if (!run.name.trim() || busy) return;
    setBusy(true);
    setNotMade(null);
    try {
      const why = await onSkipToApp({ name: run.name.trim(), folder: run.folder });
      // App.tsx catches and returns the reason as words, so failure is a value.
      if (why) setNotMade(why);
    } finally { setBusy(false); }
  };

  // The introduction slabs. Their Next uses `go`, never a local list of steps.
  const slab = SLAB_OF[run.step];
  if (slab != null) {
    const it = COPY.intro[slab];
    return (
      <Slab
        head={it.head}
        line={it.line}
        piece={it.piece}
        onNext={() => go(run.step)}
      />
    );
  }

  // The hand-off into the practice round. Its copy names no project, on
  // purpose (see COPY.handLine).
  if (run.step === 'hand') {
    return (
      <Statement
        head={COPY.handHead}
        line={COPY.handLine}
        go={COPY.handGo}
        onNext={onPractice}
        // The same exit as the Skip in the practice strip.
        skip={COPY.handSkip}
        onSkip={onLeave}
      />
    );
  }

  // The coached beats: the real app with one card beside it.
  if (COACHED.includes(run.step)) {
    // On the team layout's tab strip the card goes under the strip, since
    // beside a tab it would cover the next ones, and it names the tab too.
    const teamStrip = run.step === 'where' && typeof document !== 'undefined'
      && !!document.querySelector('.th-bar .tm-tabs');
    const say = coach(run.step, run.sentAt ? now - run.sentAt : 0, {
      opened, view, picking, palette, board, replying: !!replying || inReply, left: beat?.length, tabs, replies: run.replies,
      tabNames: teamStrip ? TEAM_TAB_NAMES : undefined, team: !!team,
    });
    if (!say) return null;
    // Ring the walk's own rows by id where it knows them, falling back to
    // ANCHOR only until the row is drawn, so the ring never lands on someone
    // else's work. The tab tour rings the tab the next press opens, from
    // `nextTab`, which the card's words use too.
    const own = (run.step === 'working' || run.step === 'open') && run.item;
    const goingTo = run.step === 'where' ? nextTab(tabs, view) : null;
    const clearing = run.step === 'clear' ? beat?.[0] ?? null : null;
    const sel = own
      ? [`.list-pane .row[data-item-id="${run.item}"]`, ...ANCHOR[run.step] ?? []]
      : run.step === 'board' && board
      ? ['.th-board', ...ANCHOR.board ?? []]
      : clearing
      ? [`.list-pane .row[data-item-id="${clearing}"]`, ...ANCHOR.clear ?? []]
      : run.step === 'unblock' && waiting && !opened
        ? [`.list-pane .row[data-item-id="${waiting}"]`, ...ANCHOR.unblock ?? []]
        // Once the snooze picker is open, ANCHOR.snooze rings it instead.
        : run.step === 'snooze' && later && !picking
          ? [`.list-pane .row[data-item-id="${later}"]`, ...ANCHOR.snooze ?? []]
          : goingTo
            // The team strip has no data-tab, so `teamTab` finds the tab by
            // its place in the strip.
            ? [...(teamTab(goingTo) ? [teamTab(goingTo) as string] : []), `.workspace-navigation [data-tab="${goingTo}"]`, `.tabs .tab[data-tab="${goingTo}"]`, ...ANCHOR.where ?? []]
            : ANCHOR[run.step];

    if (!sel || !sel.length) return null;
    return (
      <Ringed
        selector={sel}
        // Beside the ring where a card underneath would cover what it is about:
        // the old sidebar's tabs, the open palette, and the reply box on the
        // answer beat. NOT beside the tab strip over a list: a card centred on
        // a 54px strip is three times its height, so it spilled over the strip
        // and onto the rows. Those two beats take `UNDER` instead.
        beside={(run.step === 'where' && !teamStrip) || (run.step === 'command' && !!palette) || run.step === 'answer'}
        // To the right of the reply box, because above it the card covered the
        // agent's answer.
        besideRing={(run.step === 'command' && !!palette) || run.step === 'answer'}
        // The old sidebar's tabs are rows, so the card stands off the sidebar's
        // right edge.
        besideOf={run.step === 'where' ? '.workspace-navigation, .tabs' : undefined}
        boundsSel={BOUNDS[run.step]}
        // Under the whole snooze picker, not just its options, so the card
        // covers none of them.
        underSel={run.step === 'snooze' && picking ? '.modal.snooze' : UNDER[run.step]}
        // On beats that ring one row of a stack, the card stays by its ring
        // rather than dropping below `UNDER`. Not while the snooze picker is
        // open, since the ring is then inside the modal.
        makesRoom={(run.step === 'clear' || (run.step === 'snooze' && !picking)) && !!UNDER[run.step]}
        say={say}
        beat={beat}
        pointed={pointed}
        hold={practising(run)}
        also={ALSO[run.step]}
        // On the ⌘K beat any press shuts the palette, which ends the beat.
        onNext={say.next ? () => go(run.step) : say.anyKey ? onShut : undefined}
        onSkip={onSkipStep}
      />
    );
  }

  if (run.step === 'done') {
    return (
      <Finished
        found={found}
        folders={folders}
        claude={claude}
        products={walkProjects(products, run)}
        project={run.product}
        onDone={onDone}
        onFiled={onFiled}
        onProjectMade={onProjectMade}
        onRecheck={async () => {
          const missing = onRecheck ? await onRecheck() : true;
          // Claude Code just turned up, so forget the empty agent reads and
          // read again. Keeping an empty answer would end the walk before the
          // fresh read lands.
          if (!missing) {
            setFound((f) => forgetAgentsWhileLookingAgain(f, missing));
            setFolders((f) => forgetFoldersWhileLookingAgain(f, missing));
            setLookedAgain((n) => n + 1);
          }
          return missing;
        }}
      />
    );
  }

  if (run.step === 'landed') return null;

  const folderShown = run.folder ? shortPath(run.folder, home) : null;

  // The app's own back control, beside the wordmark. The window uses
  // `titleBarStyle: 'hiddenInset'`, so the corner belongs to the macOS window
  // buttons.
  const backWord = backTo && (
    <button
      type="button"
      className="back-esc fr-back"
      onClick={() => onStep(backTo)}
      // No key is named, since no key steps back. Pinned by
      // tests/the-walk-promises-no-dead-keys.test.mjs.
      aria-label={COPY.back}
      title={COPY.back}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
    </button>
  );

  return (
    <div className={backWord ? 'fr-screen has-back' : 'fr-screen'}>
      {backWord}
      <div className="fr-brand"><AppMark size={22} />{NAME}</div>

      {run.step === 'welcome' && (
        <div className="fr-corner">
          <div>
            <h1 className="fr-head">{COPY.head}</h1>
            <p className="fr-sub">{COPY.headSub}</p>
          </div>
          <button className="fr-go" onClick={() => void begin()}>
            {COPY.getStarted} <Cap cap="↵" />
          </button>
        </div>
      )}

      {/* The question on a computer that cannot run an agent yet, and what was
          found on one that can (see `begin`). Every way out, Skip included,
          goes on to the folder screen. */}
      {run.step === 'plan' && !plan && (
        <PlanQuestion
          onPick={setPlan}
          onReady={() => onStep('folder')}
          onSkip={() => onStep('folder')}
          look={askMac}
          found={alreadyHere}
        />
      )}
      {run.step === 'plan' && plan && (
        <PlanSetupCard plan={plan} onDone={() => onStep('folder')} onSkip={() => onStep('folder')} />
      )}

      {/* The app's own folder picker, when there is no Mac one. */}
      {browsing && (
        <FolderPicker
          startIn={run.folder ?? null}
          onPick={(picked) => { setBrowsing(false); takeFolder(picked); }}
          onClose={() => setBrowsing(false)}
        />
      )}

      {run.step === 'folder' && (
        // A click on a row is the answer. There is no Submit.
        <div className="fr-stack fr-stack-folders">
          <h1 className="fr-page">{COPY.folderHead}</h1>
          <p className="fr-lede">{COPY.folderLede}</p>
          <div className="fr-card fr-folders" role="listbox" aria-label={COPY.folderHead}>
            {recent && recent.length > 0 && (
              <div className="fr-folders-label">{COPY.folderRecent}</div>
            )}
            {(recent ?? []).map((f, i) => (
              <button
                key={f.folder}
                type="button"
                role="option"
                aria-selected={lit === i}
                className={`fr-folder${lit === i ? ' lit' : ''}${run.folder === f.folder ? ' on' : ''}`}
                onMouseEnter={() => setLit(i)}
                // Tab lights the row it lands on, so the arrows and the
                // keyboard never disagree about which row Return takes.
                onFocus={() => setLit(i)}
                onClick={() => takeFolder(f.folder)}
              >
                <span className="fr-fold"><FolderGlyph /></span>
                <span className="fr-folder-name">{f.name}</span>
                <span className="fr-folder-path">{f.short}</span>
                {/* Empty on purpose. The cell keeps the grid's columns. */}
                <span className="fr-folder-via" />
                <span className="fr-folder-key">{lit === i && <Cap cap="↵" />}</span>
              </button>
            ))}
            <button
              type="button"
              role="option"
              aria-selected={lit === (recent?.length ?? 0)}
              className={`fr-folder fr-folder-other${lit === (recent?.length ?? 0) ? ' lit' : ''}`}
              onMouseEnter={() => setLit(recent?.length ?? 0)}
              onFocus={() => setLit(recent?.length ?? 0)}
              onClick={pickFolder}
            >
              <span className="fr-fold"><PlusGlyph /></span>
              <span className="fr-folder-name">{recent && recent.length ? COPY.folderOther : COPY.folderFirst}</span>
              <span className="fr-folder-key">{lit === (recent?.length ?? 0) && <Cap cap="↵" />}</span>
            </button>
            <button
              type="button"
              role="option"
              aria-selected={lit === (recent?.length ?? 0) + 1}
              className={`fr-folder fr-folder-other fr-folder-none${lit === (recent?.length ?? 0) + 1 ? ' lit' : ''}`}
              onMouseEnter={() => setLit((recent?.length ?? 0) + 1)}
              onFocus={() => setLit((recent?.length ?? 0) + 1)}
              onClick={skipFolder}
            >
              <span className="fr-fold"><SkipGlyph /></span>
              <span className="fr-folder-name">{COPY.folderNone}</span>
              <span className="fr-folder-key">{lit === (recent?.length ?? 0) + 1 && <Cap cap="↵" />}</span>
            </button>
          </div>
          {/* One note under the card: a refusal, else what this Mac is
              already signed into. That note lives here, not on the welcome,
              to keep the welcome to two lines. */}
          {refused
            ? <p className="fr-note fr-refused">{refused}</p>
            : foundOnThisComputer(runsOn ?? {}) && <p className="fr-note">{foundOnThisComputer(runsOn ?? {})}</p>}
        </div>
      )}

      {run.step === 'name' && (
        <div className="fr-stack fr-stack-folders">
          <h1 className="fr-page">{COPY.nameQ}</h1>
          {folderShown ? (
            <p className="fr-lede">
              {COPY.nameIn} <span className="fr-lede-path">{folderShown}</span>.{' '}
              <button type="button" className="fr-lede-link" onClick={() => onStep('folder')}>{COPY.nameChange}</button>
            </p>
          ) : (
            <p className="fr-lede">
              {COPY.nameInNone}{' '}
              <button type="button" className="fr-lede-link" onClick={() => onStep('folder')}>{COPY.nameChoose}</button>
            </p>
          )}
          <div className="fr-card fr-name-card">
            <input
              ref={nameRef}
              className="fr-name"
              value={run.name}
              spellCheck={false}
              onChange={(e) => { setNotMade(null); onEvent({ t: 'name', name: e.target.value }); }}
              // Select the suggested name so typing replaces it.
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); make(); }
              }}
            />
            <button className="fr-submit" onClick={make} disabled={!run.name.trim() || busy}>
              {COPY.nameGo} <Cap cap="↵" />
            </button>
          </div>
          {notMade && (
            <p className="fr-note fr-notmade" role="alert">{notMade}</p>
          )}
        </div>
      )}
    </div>
  );
}
