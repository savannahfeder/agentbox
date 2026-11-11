// THE TUTORIAL ON YOUR OWN INBOX (w-31c71743b5): a gold glow on one thing and a
// card beside it saying the key to press. Which thing is ../tour.ts; this reads
// the window, draws, and hears the ways out.

import { useEffect, useRef, useState } from 'react';
import { MAC } from '../this-keyboard';
import { Name } from '../../../shared/product-name.mjs';
import { FIRST_RUN_STEP } from '../first-run';
import { ConfettiBurst } from './ConfettiBurst';
import { THREAD_CLOSED, cursorOwed, stillPreparing, closeLessons, closesThread, finishLesson, keyLearns, learnedBy, lessonOf, tourLive, tourOver, tourStep, type Lesson, type Tour as TourState, type TourScreen, type TourStep } from '../tour';
import './tour.css';

type Box = { x: number; y: number; w: number; h: number };
type Side = 'above' | 'below' | 'below-right';

const IN_THE_BOX: TourStep[] = ['folder', 'pick', 'write', 'send'];
const CMD = MAC ? '⌘' : 'Ctrl';
const GAP = 8;
/** How long a tip waits for the screen to stop changing, and how long it must be up to count as seen. */
const SETTLE_MS = 500;
const SEEN_MS = 1000;
/** Set once the tutorial has sent its sample banner. */
const NOTIFY_TRIED = 'zero.tour.notifyTried';
const BUSY_TOLD = <>You’ll get a notification when it’s done. Explore the app while you wait</>;

const K = ({ k }: { k: string }) => <span className="tour-k">{k}</span>;

const SAY: Record<TourStep, { words: JSX.Element; side: Side }> = {
  start: { words: <>Press <K k="N" /> to give an agent a new task</>, side: 'below-right' },
  folder: { words: <>Choose the folder this agent will work in</>, side: 'below' },
  pick: { words: <>Press <K k="↓" /> to choose a suggestion, or type your own</>, side: 'below' },
  write: { words: <>Type what you need done</>, side: 'below' },
  send: { words: <>Press <K k={CMD} /><K k="↵" /> to send it to an agent</>, side: 'below-right' },
  working: { words: <>An agent is working on this. Press <K k="↵" /> to watch it</>, side: 'below' },
  answered: { words: <>Your agent has answered. Press <K k="⇧" /><K k="⇥" /> to see it</>, side: 'below' },
  open: { words: <>This agent needs your answer. Press <K k="↵" /> to open it</>, side: 'below-right' },
  choose: { words: <>Press <K k="1" /> to choose the recommended option</>, side: 'above' },
  reply: { words: <>Press <K k="R" /> to answer this agent</>, side: 'above' },
  close: { words: <>When it is finished, press <K k="E" /> to close it</>, side: 'below-right' },
  busy: { words: <>This agent is working. You can leave and come back when it’s done</>, side: 'below' },
  gettingReady: { words: <>Getting your chats ready. You can wait here or press <K k="N" /> to start something new</>, side: 'below' },
  inPalette: { words: <></>, side: 'below' },
  startHere: { words: <>Press <K k="N" /> to give an agent a new task</>, side: 'below-right' },
  palette: { words: <>Press <K k={CMD} /><K k="K" /> to find anything {Name} can do</>, side: 'below' },
  urgent: { words: <>Urgent threads move up your list, and their agents start first</>, side: 'below-right' },
};
/** The urgent tip asks for nothing, so it goes by itself. */
const URGENT_MS = 6000;

/** Inside ⌘K: one thing worth trying on the thread it acts on, and the way out. */
function InPalette() {
  const urgent = [...document.querySelectorAll('.palette-label')].some((l) => /Priority: Urgent/.test(l.textContent ?? ''));
  const here = document.querySelector('.focus-body') ? 'this thread' : 'the selected thread';
  return urgent
    ? <>Type <K k="urgent" /> and press <K k="↵" /> to make {here} urgent, or <K k="esc" /> to close</>
    : <>Type what you want to do and press <K k="↵" />, or <K k="esc" /> to close</>;
}

/** A chat still being written up is not pointed at until it reads as a thread. */
const ROWS = '.list-pane .row[data-item-id]:not([data-catching-up])';

const firstRow = (running: boolean) => {
  const rows = [...document.querySelectorAll<HTMLElement>(ROWS)];
  if (running) return rows.find((r) => r.querySelector('.s-running')) ?? null;
  return rows.find((r) => r.classList.contains('selected')) ?? rows[0] ?? null;
};

const urgentCell = () => document.querySelector<HTMLElement>('.list-pane .row.selected .th-cell-prio.urgent');

const needsYouTab = () => document.querySelector<HTMLElement>('.tm-tab[data-hint="state-tab"]');

function targetsOf(step: TourStep): HTMLElement[] {
  const card = document.querySelector('.tc-card');
  const one = (el: Element | null | undefined) => (el ? [el as HTMLElement] : []);
  switch (step) {
    case 'start': return one(document.querySelector('.th-new'));
    case 'folder': {
      const chip = card?.querySelector<HTMLElement>('[data-tour="project"]');
      return chip ? [chip, ...one(chip.querySelector('.tc-menu'))] : [];
    }
    case 'pick': return one(card?.querySelector('[data-tour="ideas"]'));
    case 'write': return one(card?.querySelector('textarea'));
    case 'send': return one(card?.querySelector('.tc-send'));
    case 'working': return one(firstRow(true));
    case 'answered': return one(needsYouTab());
    case 'open': return one(firstRow(false));
    case 'choose': return one(document.querySelector('.opt-row')?.parentElement);
    case 'reply': return one(document.querySelector('.dock-pill'));
    case 'close': return one(document.querySelector('.ts-done'));
    case 'busy': return one(document.querySelector('.live-activity .live-brief'));
    case 'startHere': return one(document.querySelector('.ts-done'));
    case 'inPalette': return one(document.querySelector('.palette'));
    case 'gettingReady': return one([...document.querySelectorAll('.list-pane .row[data-catching-up]')].at(-1));
    // Nothing on screen opens the command bar, so the card sits alone under the tabs.
    // On the list, at the word Urgent on the thread just raised.
    case 'urgent': if (urgentCell()) return one(urgentCell());
    // falls through
    case 'palette': return one(document.querySelector('.tm-tab')?.parentElement ?? document.querySelector('.thread-crumb-from')?.parentElement);
  }
}

/** Around the words in a row, not the row's hidden gutters, with even room on every side. */
function snug(el: HTMLElement): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim() || n.parentElement?.closest('.live-announcement')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (!r.width) continue;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    }
  }
  for (const icon of el.querySelectorAll('svg, .th-st, .live-mark, .prio-bars')) {
    const r = icon.getBoundingClientRect();
    if (r.width) { x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right); }
  }
  if (x0 === Infinity) { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }
  return { x: x0 - 14, y: y0 - 12, w: x1 - x0 + 28, h: y1 - y0 + 24 };
}

function boxOf(step: TourStep, els: HTMLElement[]): Box | null {
  if (!els.length) return null;
  if (step === 'working' || step === 'answered' || step === 'open' || step === 'busy' || (step === 'urgent' && els[0] === urgentCell())) return snug(els[0]);
  const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width);
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
  return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y };
}

function readScreen(view: string, thread: boolean, covered: boolean, palette: boolean): TourScreen {
  const card = document.querySelector<HTMLElement>('.tc-card');
  return {
    composer: !card ? 'none' : card.classList.contains('tc-inline') ? 'inline' : 'card',
    folder: card?.dataset.tourFolder === '1',
    text: card?.dataset.tourText === '1',
    ideas: !!card?.querySelector('[data-tour="ideas"]'),
    view,
    rows: document.querySelectorAll(ROWS).length,
    running: document.querySelectorAll('.list-pane .row[data-item-id] .s-running').length,
    waiting: Number(needsYouTab()?.querySelector('b')?.textContent) || 0,
    thread,
    preparing: stillPreparing({ thread, onPage: !!document.querySelector('.one-catching-up'), ready: document.querySelectorAll(ROWS).length, writing: document.querySelectorAll('.list-pane .row[data-catching-up]').length }),
    typing: thread && !!document.activeElement?.closest('.dock-card'),
    busy: thread && !!document.querySelector('.live-word.is-shimmering'),
    menu: !!document.querySelector('.tc-menu'),
    options: !!document.querySelector('.opt-row'),
    palette,
    covered,
  };
}

const same = (a: Box | null, b: Box | null) => (!a || !b ? a === b : a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

export function Tour({ tour, view, thread, covered, palette, onChange, onPoint, onStep }: {
  tour: TourState | null;
  view: string;
  thread: boolean;
  /** Settings, ⌘K or another card is over the window. */
  covered: boolean;
  /** ⌘K is open, which the tutorial speaks over. */
  palette: boolean;
  onChange: (t: TourState) => void;
  /** Puts the list's cursor on this thread. */
  onPoint: (id: string) => void;
  /** The lesson the tip on screen teaches, for the step list beside the app. */
  onStep?: (lesson: Lesson | null) => void;
}) {
  const [step, setStep] = useState<TourStep | null>(null);
  useEffect(() => { onStep?.(step ? lessonOf(step) : null); }, [step, onStep]);
  const [box, setBox] = useState<Box | null>(null);
  const [cardAt, setCardAt] = useState<{ left: number; top: number } | null>(null);
  // What was last set, so the reading eight times a second sets nothing that did not move.
  const boxNow = useRef<Box | null>(null);
  const cardNow = useRef<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const shown = useRef<TourStep | null>(null);
  const shownAt = useRef(0);
  const settling = useRef<{ step: TourStep | null; since: number }>({ step: null, since: 0 });
  const before = useRef<TourScreen | null>(null);
  const countedSteps = useRef(new Set<number>());
  const live = tourLive(tour);
  const point = useRef(onPoint);
  point.current = onPoint;
  const walked = useRef(false);
  useEffect(() => {
    const note = (e: KeyboardEvent) => { if (/^(ArrowUp|ArrowDown|j|k)$/.test(e.key)) walked.current = true; };
    window.addEventListener('keydown', note, true);
    return () => window.removeEventListener('keydown', note, true);
  }, []);

  // THE END OF THE TUTORIAL: one burst of confetti, the way the old walk ended,
  // and only when nothing is over the window to hide it.
  const [burst, setBurst] = useState(0);
  const [tried, setTried] = useState(() => { try { return !!localStorage.getItem(NOTIFY_TRIED); } catch { return false; } });
  const tryNotifications = () => {
    try { localStorage.setItem(NOTIFY_TRIED, '1'); } catch {}
    setTried(true);
    void (window.zero as { notifyTest?: () => Promise<unknown> } | undefined)?.notifyTest?.();
  };
  const ended = (t: TourState | null) => tourOver(t);
  const hadEnded = useRef(ended(tour));
  useEffect(() => {
    if (covered || hadEnded.current === ended(tour)) return;
    if (!hadEnded.current) setBurst(Date.now());
    hadEnded.current = ended(tour);
  }, [tour, covered]);
  useEffect(() => {
    if (!burst) return undefined;
    const t = setTimeout(() => setBurst(0), 2600);
    return () => clearTimeout(t);
  }, [burst]);

  // WHAT IS ON SCREEN, read a few times a second while there is anything left to say.
  useEffect(() => {
    if (!live || !tour) { if (shown.current) { shown.current = null; setStep(null); } return undefined; }
    const read = () => {
      const screen = readScreen(view, thread, covered, palette);
      if (screen.typing && !tour.done.includes('reply')) { onChange(finishLesson(tour, 'reply')); return; }
      const rawStep = tourStep(tour, screen);
      // Told to go and explore, nobody is then asked to come back and watch.
      const wanted = rawStep === 'working' && tried ? null : rawStep;
      // Already closed, by its agent: nothing is left for the close tip to point at.
      if (wanted === 'close' && document.querySelector('.focus-body .one-title') && !document.querySelector('.ts-done')) { onChange(finishLesson(tour, 'close')); return; }
      // A screen still arriving (the inbox before its rows land) must not flash a
      // tip, and the one before it no longer points at anything.
      if (wanted !== settling.current.step) settling.current = { step: wanted, since: Date.now() };
      const next = wanted && Date.now() - settling.current.since < SETTLE_MS ? null : wanted;
      const was = shown.current;
      if (was !== next) {
        // The first run's folder and first task are counted where they now happen.
        const counted = next === 'folder' ? FIRST_RUN_STEP.where : next === 'pick' || next === 'write' || next === 'send' ? FIRST_RUN_STEP.task : null;
        if (counted && !tour.sent && !countedSteps.current.has(counted)) {
          countedSteps.current.add(counted);
          try { window.zero?.track?.('first_run_step', counted); } catch {}
        }
        const seenFor = Date.now() - shownAt.current;
        shown.current = next;
        shownAt.current = Date.now();
        setStep(next);
        // A tip read and gone because the screen it asked for came is not shown again.
        if (was && seenFor >= SEEN_MS && !covered && learnedBy(was, before.current, screen)) {
          onChange(finishLesson(tour, lessonOf(was)));
          return;
        }
      }
      if (next) before.current = screen;
      if (cursorOwed(next, { writing: !!document.querySelector('.list-pane .row.selected[data-catching-up]'), byHand: walked.current })) {
        const id = firstRow(false)?.dataset.itemId;
        if (id) point.current(id);
      }
      const b = next ? boxOf(next, targetsOf(next)) : null;
      if (!same(boxNow.current, b)) { boxNow.current = b; setBox(b); }
    };
    read();
    const t = setInterval(read, 120);
    return () => clearInterval(t);
  }, [live, tour, view, thread, covered, palette, onChange, tried]);

  // THE CARD, beside the glow, kept inside the window.
  useEffect(() => {
    const c = cardRef.current;
    if (!box || !step || !c) { if (cardNow.current) { cardNow.current = null; setCardAt(null); } return; }
    const w = c.offsetWidth, h = c.offsetHeight;
    const side = SAY[step].side;
    let left = side === 'below-right' ? box.x + box.w - w : box.x;
    let top = side === 'above' ? box.y - GAP - h : box.y + box.h + GAP;
    // On the page the suggestions hang under Send: below it the card covers the first, above it your words.
    const ideas = step === 'send' ? document.querySelector('.tc-card [data-tour="ideas"]')?.getBoundingClientRect() : null;
    if (ideas && ideas.top >= box.y + box.h) top = ideas.bottom + GAP;
    // In the dialog the suggestions sit above the project and Send, so the card goes under the whole box.
    const dialog = step === 'pick' ? document.querySelector('.tc-card:not(.tc-inline)')?.getBoundingClientRect() : null;
    if (dialog) top = dialog.bottom + GAP;
    if (step === 'gettingReady') left = document.querySelector('.list-pane .row[data-catching-up] .subject')?.getBoundingClientRect().left ?? left;
    if (step === 'palette' || (step === 'urgent' && !urgentCell())) {
      const pane = document.querySelector('.list-pane')?.getBoundingClientRect();
      left = pane ? pane.left + (pane.width - w) / 2 : (window.innerWidth - w) / 2;
      // Under the tabs on a list; on a thread, in the empty middle of its header line.
      top = document.querySelector('.tm-tab') ? box.y + box.h + 3 * GAP : box.y + (box.h - h) / 2;
    }
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - h - 12));
    if (cardNow.current?.left !== left || cardNow.current?.top !== top) { cardNow.current = { left, top }; setCardAt(cardNow.current); }
  }, [box, step]);

  // A close counts with or without a tip up: none shows over a chat still getting ready.
  useEffect(() => {
    if (!live || !tour) return undefined;
    const closed = () => onChange(closeLessons(shown.current ?? 'close').reduce(finishLesson, tour));
    window.addEventListener(THREAD_CLOSED, closed);
    return () => window.removeEventListener(THREAD_CLOSED, closed);
  }, [live, tour, onChange]);

  // A tip blocks nothing, so it has no way out of its own: the command bar has End the tutorial.
  useEffect(() => {
    if (!step || !tour) return undefined;
    const onTarget = (t: EventTarget | null) => {
      const el = t as Element | null;
      return !!el?.closest && targetsOf(step).some((x) => x.contains(el));
    };
    // Pressing the lit thing is doing what the tip asks; a click anywhere else leaves the tip up.
    const down = (e: PointerEvent) => {
      if (!onTarget(e.target)) return;
      if (IN_THE_BOX.includes(step) || step === 'busy' || step === 'palette' || step === 'gettingReady' || step === 'inPalette') return;
      setTimeout(() => onChange(finishLesson(tour, lessonOf(step))), 0);
    };
    const key = (e: KeyboardEvent) => {
      // After the press has reached the app: saving now redraws it first, and the press is lost.
      const later = (t: TourState) => setTimeout(() => onChange(t), 0);
      const typing = (e.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"]');
      // The app holds the first E on a thread waiting on an answer, so it counts only once the thread has gone.
      // A close is counted when the app closes the thread (THREAD_CLOSED below); the first E on a waiting thread is held.
      if (!typing && closesThread(e, thread)) return;
      if (!typing && keyLearns(step, e)) { later(finishLesson(tour, lessonOf(step))); return; }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); };
  }, [step, tour, thread, onChange]);

  // The urgent tip goes after a while, or on the next key or click once it has been read.
  useEffect(() => {
    if (step !== 'urgent' || !tour) return undefined;
    const since = Date.now();
    const done = () => onChange(finishLesson(tour, 'urgent'));
    const t = setTimeout(done, URGENT_MS);
    const any = () => { if (Date.now() - since >= SEEN_MS) setTimeout(done, 0); };
    window.addEventListener('keydown', any, true);
    window.addEventListener('pointerdown', any, true);
    return () => { clearTimeout(t); window.removeEventListener('keydown', any, true); window.removeEventListener('pointerdown', any, true); };
  }, [step, tour, onChange]);

  if (!step || !box || !tour) return burst ? <ConfettiBurst key={burst} /> : null;
  return (
    <>
      {burst ? <ConfettiBurst key={burst} /> : null}
      {step !== 'palette' && !(step === 'urgent' && !urgentCell()) && step !== 'busy' && step !== 'gettingReady' && step !== 'inPalette' && step !== 'startHere' && <div key={`glow-${step}`} className="tour-glow" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} aria-hidden="true" />}
      <div key={`card-${step}`} ref={cardRef} className="tour-card" role="status"
        style={cardAt ? { left: cardAt.left, top: cardAt.top } : { left: -9999, top: -9999 }}>
        <span className="tour-say">{step === 'busy' && tried ? BUSY_TOLD : step === 'inPalette' ? <InPalette /> : SAY[step].words}</span>
        {step === 'busy' && !tried && <button type="button" className="tour-act" onClick={tryNotifications}>Turn on notifications</button>}
      </div>
    </>
  );
}
