// THE TUTORIAL ON YOUR OWN INBOX (w-31c71743b5): which thing glows, with no
// window in it. components/Tour.tsx draws it; the test
// tests/the-tutorial-walks-you-through-your-first-real-thread.test.mjs holds
// what each rule is for.

export type TourStep = 'start' | 'folder' | 'pick' | 'write' | 'send' | 'working' | 'answered' | 'open' | 'choose' | 'reply' | 'close' | 'palette' | 'busy' | 'gettingReady' | 'inPalette' | 'startHere' | 'urgent';
/** Each tip shows until it is done or put away, then never again. The New thread box's three steps are one. */
export type Lesson = 'start' | 'compose' | 'working' | 'open' | 'choose' | 'reply' | 'close' | 'palette' | 'busy' | 'urgent';
/** Every lesson there is; a tour with all of them done has nothing left to say. */
export const LESSONS: Lesson[] = ['start', 'compose', 'working', 'open', 'choose', 'reply', 'close', 'palette'];

export interface Tour {
  sent: boolean;
  /** Skip tutorial or Escape: nothing more, ever. */
  skipped: boolean;
  done: Lesson[];
  /** A thread was made urgent from ⌘K, so the next tip says what that does. */
  urgent?: boolean;
}

/** What is on the screen, read from the window by the caller. */
export interface TourScreen {
  /** The New thread box: shut, open as the dialog, or drawn on the empty inbox. */
  composer: 'none' | 'card' | 'inline';
  /** The box's project has a folder to work in. */
  folder: boolean;
  /** The box has words in it. */
  text: boolean;
  /** The box offers suggestions (a project with a folder of code). */
  ideas?: boolean;
  view: string;
  /** Rows in the list on screen. */
  rows: number;
  /** Rows an agent is on, in that list. */
  running: number;
  /** A chat brought in is still being written up as a thread. */
  preparing?: boolean;
  /** The count on the Needs you tab. */
  waiting?: number;
  /** A thread is open. */
  thread: boolean;
  /** The open thread's agent is still working on it. */
  busy?: boolean;
  /** A menu is open over the page. */
  menu?: boolean;
  /** The thread's reply box has the keyboard. */
  typing?: boolean;
  /** The open thread offers options. */
  options: boolean;
  /** ⌘K is open. */
  palette?: boolean;
  /** Something else is over the window: settings, another card. */
  covered: boolean;
}

export const TOUR_KEY = 'zero.tour';
/** Sent by the app once a thread is really closed, which is the close lesson. */
export const THREAD_CLOSED = 'agentbox:thread-closed';

export const startTour = (): Tour => ({ sent: false, skipped: false, done: [] });
export const skipTour = (t: Tour): Tour => ({ ...t, skipped: true });
/** A thread closed, ⌘K used, a new task known, and urgent explained if it was picked: the confetti, and no tip after it. */
export const tourOver = (t: Tour | null): boolean =>
  !!t && !t.skipped && t.done.includes('close') && t.done.includes('palette') && (t.sent || t.done.includes('start')) && !(t.urgent && !t.done.includes('urgent'));
export const tourLive = (t: Tour | null): boolean => !!t && !t.skipped && !tourOver(t) && LESSONS.some((l) => !t.done.includes(l));
export const madeUrgent = (t: Tour): Tour => ({ ...t, urgent: true });
export const noteSent = (t: Tour): Tour => finishLesson({ ...t, sent: true }, 'compose');
export const finishLesson = (t: Tour, l: Lesson): Tour => (t.done.includes(l) ? t : { ...t, done: [...t.done, l] });
export const lessonOf = (s: TourStep): Lesson =>
  s === 'folder' || s === 'pick' || s === 'write' || s === 'send' ? 'compose' : s === 'answered' || s === 'gettingReady' ? 'open' : s === 'inPalette' ? 'palette' : s === 'startHere' ? 'start' : s;

const KEYS: Partial<Record<TourStep, RegExp>> = { start: /^n$/i, startHere: /^n$/i, working: /^Enter$/, open: /^Enter$/, choose: /^[1-9]$/, reply: /^r$/i, close: /^e$/i };

/** Whether this key press is the one the tip on screen asks for, which is the lesson learned. */
export function keyLearns(step: TourStep, e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return !!KEYS[step]?.test(e.key);
}

/** Whether the screen that replaced a tip is the one it asked for, so the lesson is learned. */
export function learnedBy(step: TourStep, before: TourScreen | null, after: TourScreen): boolean {
  if (after.covered || after.menu || !before) return false;
  switch (step) {
    case 'start': case 'startHere': return after.composer !== 'none';
    case 'open': return after.thread;
    case 'answered': return after.view === 'inbox';
    case 'working': return after.thread || after.view !== before.view;
    case 'busy': return !after.thread;
    default: return false;
  }
}

/** What E on a thread teaches: the close, and the tip it closed over when that tip was about the thread. */
export function closeLessons(step: TourStep): Lesson[] {
  const own = lessonOf(step);
  // A thread you closed is one you opened, whether or not the open tip was the way in.
  return own === 'reply' || own === 'choose' || own === 'busy' ? [own, 'open', 'close'] : ['open', 'close'];
}

/** E on an open thread closes it, which is the close lesson whatever tip is up. */
export function closesThread(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }, thread: boolean): boolean {
  return thread && !e.metaKey && !e.ctrlKey && !e.altKey && /^e$/i.test(e.key);
}

/** The suggestions, in every New thread box until the tutorial is over or skipped. */
export const showIdeas = (t: Tour | null): boolean => !!t && !t.skipped && !(t.done.includes('close') && t.done.includes('palette'));
/** Before the first send: the box asks for a folder, and the empty inbox says to give a first task. */
export const firstTask = (t: Tour | null): boolean => !!t && !t.sent && !t.skipped;

/** One slow write-up must not hold back the threads already ready, or the tip on them. */
export const stillPreparing = ({ thread, onPage, ready, writing }: { thread: boolean; onPage: boolean; ready: number; writing: number }): boolean =>
  thread ? onPage : ready === 0 && writing > 0;

/** The tip's ↵ has to open the row it lights, unless someone has walked the list themselves. */
export const cursorOwed = (step: TourStep | null, { writing, byHand }: { writing: boolean; byHand: boolean }): boolean =>
  step === 'open' && writing && !byHand;

export function tourStep(t: Tour | null, s: TourScreen): TourStep | null {
  if (!t || t.skipped || s.covered || tourOver(t)) return null;
  const todo = (l: Lesson) => !t.done.includes(l);
  if (s.palette) return todo('palette') ? 'inPalette' : null;
  if (t.urgent && todo('urgent')) return 'urgent';
  // The command bar is the last tip, so it goes before the suggestions on the empty inbox.
  if (!todo('close') && todo('palette') && (t.sent || !todo('start')) && s.composer === 'inline' && !s.thread) return 'palette';
  if (s.composer !== 'none' && !t.sent && todo('compose')) {
    if (!s.folder) return 'folder';
    if (s.menu) return null;
    if (s.text) return 'send';
    return s.ideas === false ? 'write' : 'pick';
  }
  if (s.preparing && !s.thread) return s.view === 'inbox' && todo('open') ? 'gettingReady' : null;
  if (s.preparing && todo('close')) return null;
  if (s.preparing) return todo('palette') && (t.sent || !todo('start')) ? 'palette' : !t.sent && todo('start') ? 'startHere' : null;
  if (s.thread) {
    if (s.typing) return null;
    if (s.busy) return todo('busy') ? 'busy' : null;
    if (s.options && todo('choose')) return 'choose';
    if (!s.options && todo('reply') && todo('choose')) return 'reply';
    if ((!todo('choose') || !todo('reply')) && todo('close')) return 'close';
    if (!todo('close') && todo('palette') && (t.sent || !todo('start'))) return 'palette';
    if (!todo('close') && !t.sent && todo('start')) return 'startHere';
    return null;
  }
  if (s.composer === 'card') return null;
  // The last tip, once a first thread is closed and New thread is known: the bar that reaches everything else.
  if (!todo('close') && todo('palette') && (t.sent || !todo('start')) && (s.view === 'inbox' || s.view === 'progress')) return 'palette';
  if (t.sent && todo('working') && s.view === 'progress' && s.running > 0) return 'working';
  // The first task's answer lands in Needs you while you are still on In progress.
  if (t.sent && todo('open') && s.view !== 'inbox' && s.running === 0 && (s.waiting ?? 0) > 0) return 'answered';
  // A chat brought in is what someone judges the app by, so it comes before a new thread.
  if (todo('open') && s.view === 'inbox' && s.rows > 0) return 'open';
  if (!t.sent && todo('start') && s.composer === 'none' && (s.view === 'inbox' || s.view === 'progress')) return 'start';
  return null;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function readTour(store: Store): Tour | null {
  try {
    const raw = store.getItem(TOUR_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (typeof t !== 'object' || !t) return null;
    return { sent: !!t.sent, skipped: !!t.skipped, done: Array.isArray(t.done) ? t.done : [], ...(t.urgent ? { urgent: true } : {}) };
  } catch { return null; }
}

export function saveTour(store: Store, t: Tour): void {
  try { store.setItem(TOUR_KEY, JSON.stringify(t)); } catch { /* a tip shown twice is not worth a failure */ }
}
