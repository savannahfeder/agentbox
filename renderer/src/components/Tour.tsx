// THE TUTORIAL ON YOUR OWN INBOX (w-31c71743b5): a gold glow on one thing and a
// card beside it saying the key to press. Which thing is ../tour.ts; this reads
// the window, draws, and hears the ways out.

import { useEffect, useRef, useState } from 'react';
import { MAC } from '../this-keyboard';
import { Name } from '../../../shared/product-name.mjs';
import { FIRST_RUN_STEP } from '../first-run';
import { finishLesson, keyLearns, LESSONS, lessonOf, skipTour, tourStep, type Tour as TourState, type TourScreen, type TourStep } from '../tour';
import './tour.css';

type Box = { x: number; y: number; w: number; h: number };
type Side = 'above' | 'below' | 'below-right';

const ON_THE_LIST: TourStep[] = ['start', 'working', 'answered', 'open', 'palette'];
const IN_THE_BOX: TourStep[] = ['folder', 'pick', 'send'];
const CMD = MAC ? '⌘' : 'Ctrl';
const GAP = 8;
/** How long a tip waits for the screen to stop changing, and how long it must be up to count as seen. */
const SETTLE_MS = 500;
const SEEN_MS = 1000;

const K = ({ k }: { k: string }) => <span className="tour-k">{k}</span>;

const SAY: Record<TourStep, { words: JSX.Element; side: Side }> = {
  start: { words: <>Press <K k="N" /> to give an agent a new task</>, side: 'below-right' },
  folder: { words: <>Choose the folder this agent will work in</>, side: 'below' },
  pick: { words: <>Press <K k="↓" /> to choose a suggestion, or type your own</>, side: 'below' },
  send: { words: <>Press <K k={CMD} /><K k="↵" /> to send it to an agent</>, side: 'below-right' },
  working: { words: <>An agent is working on this. Press <K k="N" /> to start another thread</>, side: 'below' },
  answered: { words: <>Your agent has answered. Press <K k="⇧" /><K k="⇥" /> to see it</>, side: 'below' },
  open: { words: <>This agent needs your answer. Press <K k="↵" /> to open it</>, side: 'below-right' },
  choose: { words: <>Press <K k="1" /> to choose the recommended option</>, side: 'above' },
  reply: { words: <>Press <K k="R" /> to answer this agent</>, side: 'above' },
  close: { words: <>When it is finished, press <K k="E" /> to close it</>, side: 'below-right' },
  palette: { words: <>Press <K k={CMD} /><K k="K" /> to find anything {Name} can do</>, side: 'below' },
};

/** A chat still being written up is not pointed at until it reads as a thread. */
const ROWS = '.list-pane .row[data-item-id]:not([data-catching-up])';

const firstRow = (running: boolean) => {
  const rows = [...document.querySelectorAll<HTMLElement>(ROWS)];
  if (running) return rows.find((r) => r.querySelector('.s-running')) ?? null;
  return rows.find((r) => r.classList.contains('selected')) ?? rows[0] ?? null;
};

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
    case 'send': return one(card?.querySelector('.tc-send'));
    case 'working': return one(firstRow(true));
    case 'answered': return one(needsYouTab());
    case 'open': return one(firstRow(false));
    case 'choose': return one(document.querySelector('.opt-row')?.parentElement);
    case 'reply': return one(document.querySelector('.dock-pill'));
    case 'close': return one(document.querySelector('.ts-done'));
    // Nothing on screen opens the command bar, so the card sits alone under the tabs.
    case 'palette': return one(document.querySelector('.tm-tab')?.parentElement);
  }
}

/** Around the words in a row, not the row's hidden gutters, with even room on every side. */
function snug(el: HTMLElement): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (!r.width) continue;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    }
  }
  for (const icon of el.querySelectorAll('svg, .th-st')) {
    const r = icon.getBoundingClientRect();
    if (r.width) { x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right); }
  }
  if (x0 === Infinity) { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }
  return { x: x0 - 14, y: y0 - 12, w: x1 - x0 + 28, h: y1 - y0 + 24 };
}

function boxOf(step: TourStep, els: HTMLElement[]): Box | null {
  if (!els.length) return null;
  if (step === 'working' || step === 'answered' || step === 'open') return snug(els[0]);
  const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width);
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
  return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y };
}

function readScreen(view: string, thread: boolean, covered: boolean): TourScreen {
  const card = document.querySelector<HTMLElement>('.tc-card');
  return {
    composer: !card ? 'none' : card.classList.contains('tc-inline') ? 'inline' : 'card',
    folder: card?.dataset.tourFolder === '1',
    text: card?.dataset.tourText === '1',
    view,
    rows: document.querySelectorAll(ROWS).length,
    running: document.querySelectorAll('.list-pane .row[data-item-id] .s-running').length,
    waiting: Number(needsYouTab()?.querySelector('b')?.textContent) || 0,
    thread,
    preparing: !!document.querySelector('.list-pane .row[data-catching-up], .one-catching-up'),
    typing: thread && !!document.activeElement?.closest('.dock-card'),
    options: !!document.querySelector('.opt-row'),
    covered,
  };
}

/** Where someone is: a tip put away waits until this changes before the next one shows. */
const placeOf = (s: TourScreen) => `${s.composer}|${s.view}|${s.thread}`;

const same = (a: Box | null, b: Box | null) => (!a || !b ? a === b : a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

export function Tour({ tour, view, thread, covered, onChange }: {
  tour: TourState | null;
  view: string;
  thread: boolean;
  /** Settings, ⌘K or another card is over the window. */
  covered: boolean;
  onChange: (t: TourState) => void;
}) {
  const [step, setStep] = useState<TourStep | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [cardAt, setCardAt] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const shown = useRef<TourStep | null>(null);
  const shownAt = useRef(0);
  const settling = useRef<{ step: TourStep | null; since: number }>({ step: null, since: 0 });
  const quietAt = useRef<string | null>(null);
  const place = useRef('');
  const countedSteps = useRef(new Set<number>());
  const live = !!tour && !tour.skipped && LESSONS.some((l) => !tour.done.includes(l));

  // WHAT IS ON SCREEN, read a few times a second while there is anything left to say.
  useEffect(() => {
    if (!live || !tour) { setStep(null); return undefined; }
    const read = () => {
      const screen = readScreen(view, thread, covered);
      if (screen.typing && !tour.done.includes('reply')) { onChange(finishLesson(tour, 'reply')); return; }
      place.current = placeOf(screen);
      if (quietAt.current && quietAt.current !== place.current) quietAt.current = null;
      const wanted = quietAt.current ? null : tourStep(tour, screen);
      // A screen still arriving (the inbox before its rows land) must not flash a tip.
      if (wanted !== settling.current.step) settling.current = { step: wanted, since: Date.now() };
      const next = wanted && Date.now() - settling.current.since < SETTLE_MS ? shown.current : wanted;
      const was = shown.current;
      if (was !== next) {
        // The first run's folder and first task are counted where they now happen.
        const counted = next === 'folder' ? FIRST_RUN_STEP.where : next === 'pick' || next === 'send' ? FIRST_RUN_STEP.task : null;
        if (counted && !tour.sent && !countedSteps.current.has(counted)) {
          countedSteps.current.add(counted);
          try { window.zero?.track?.('first_run_step', counted); } catch {}
        }
        const seenFor = Date.now() - shownAt.current;
        shown.current = next;
        shownAt.current = Date.now();
        setStep(next);
        // A tip that was read and has gone, because what it pointed at was done, is not shown again.
        if (was && seenFor >= SEEN_MS && !covered && !quietAt.current && (!next || lessonOf(was) !== lessonOf(next))) {
          onChange(finishLesson(tour, lessonOf(was)));
          return;
        }
      }
      const b = next ? boxOf(next, targetsOf(next)) : null;
      setBox((had) => (same(had, b) ? had : b));
    };
    read();
    const t = setInterval(read, 120);
    return () => clearInterval(t);
  }, [live, tour, view, thread, covered, onChange]);

  // THE CARD, beside the glow, kept inside the window.
  useEffect(() => {
    const c = cardRef.current;
    if (!box || !step || !c) { setCardAt(null); return; }
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
    if (step === 'palette') {
      const pane = document.querySelector('.list-pane')?.getBoundingClientRect();
      left = pane ? pane.left + (pane.width - w) / 2 : (window.innerWidth - w) / 2;
      top = box.y + box.h + 3 * GAP;
    }
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - h - 12));
    setCardAt((had) => (had && had.left === left && had.top === top ? had : { left, top }));
  }, [box, step]);

  // THE WAYS OUT. A click anywhere but the glow puts this tip away, and the next
  // one waits until you move somewhere else. Escape on the list, or Skip
  // tutorial, ends all of it.
  useEffect(() => {
    if (!step || !tour) return undefined;
    const inside = (t: EventTarget | null) => {
      const el = t as Element | null;
      if (!el?.closest) return false;
      if (el.closest('.tour-card')) return true;
      if (IN_THE_BOX.includes(step) && el.closest('.tc-card')) return true;
      return targetsOf(step).some((x) => x.contains(el));
    };
    const down = (e: PointerEvent) => {
      if (inside(e.target)) return;
      quietAt.current = place.current;
      shown.current = null;
      setStep(null);
      onChange(finishLesson(tour, lessonOf(step)));
    };
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"]');
      if (!typing && keyLearns(step, e)) { onChange(finishLesson(tour, lessonOf(step))); return; }
      if (e.key !== 'Escape' || !ON_THE_LIST.includes(step)) return;
      e.preventDefault();
      e.stopPropagation();
      onChange(skipTour(tour));
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); };
  }, [step, tour, onChange]);

  if (!step || !box || !tour) return null;
  return (
    <>
      {step !== 'palette' && <div key={`glow-${step}`} className="tour-glow" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} aria-hidden="true" />}
      <div key={`card-${step}`} ref={cardRef} className="tour-card" role="status"
        style={cardAt ? { left: cardAt.left, top: cardAt.top } : { left: -9999, top: -9999 }}>
        <span className="tour-say">{SAY[step].words}</span>
        <button type="button" className="tour-skip" onClick={() => onChange(skipTour(tour))}>Skip tutorial</button>
      </div>
    </>
  );
}
