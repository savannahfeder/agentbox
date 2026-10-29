// THE TUTORIAL ON YOUR OWN INBOX (w-31c71743b5): which thing glows, with no
// window in it. components/Tour.tsx draws it; the test
// tests/the-tutorial-walks-you-through-your-first-real-thread.test.mjs holds
// what each rule is for.

export type TourStep = 'start' | 'folder' | 'pick' | 'send' | 'working' | 'answered' | 'open' | 'choose' | 'reply' | 'close';
/** Each tip shows until it is done or put away, then never again. The New thread box's three steps are one. */
export type Lesson = 'start' | 'compose' | 'working' | 'open' | 'choose' | 'reply' | 'close';

export interface Tour {
  sent: boolean;
  /** Skip tutorial or Escape: nothing more, ever. */
  skipped: boolean;
  done: Lesson[];
}

/** What is on the screen, read from the window by the caller. */
export interface TourScreen {
  /** The New thread box: shut, open as the dialog, or drawn on the empty inbox. */
  composer: 'none' | 'card' | 'inline';
  /** The box's project has a folder to work in. */
  folder: boolean;
  /** The box has words in it. */
  text: boolean;
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
  /** The thread's reply box has the keyboard. */
  typing?: boolean;
  /** The open thread offers options. */
  options: boolean;
  /** Something else is over the window: settings, ⌘K, another card. */
  covered: boolean;
}

export const TOUR_KEY = 'zero.tour';

export const startTour = (): Tour => ({ sent: false, skipped: false, done: [] });
export const skipTour = (t: Tour): Tour => ({ ...t, skipped: true });
export const noteSent = (t: Tour): Tour => finishLesson({ ...t, sent: true }, 'compose');
export const finishLesson = (t: Tour, l: Lesson): Tour => (t.done.includes(l) ? t : { ...t, done: [...t.done, l] });
export const lessonOf = (s: TourStep): Lesson =>
  s === 'folder' || s === 'pick' || s === 'send' ? 'compose' : s === 'answered' ? 'open' : s;

/** The first-thread suggestions, until the first send or Skip. */
export const showIdeas = (t: Tour | null): boolean => !!t && !t.sent && !t.skipped;

export function tourStep(t: Tour | null, s: TourScreen): TourStep | null {
  if (!t || t.skipped || s.covered) return null;
  const todo = (l: Lesson) => !t.done.includes(l);
  if (s.composer !== 'none' && !t.sent && todo('compose')) {
    if (!s.folder) return 'folder';
    return s.text ? 'send' : 'pick';
  }
  if (s.preparing) return null;
  if (s.thread) {
    if (s.typing) return null;
    if (s.options && todo('choose')) return 'choose';
    if (!s.options && todo('reply') && todo('choose')) return 'reply';
    if ((!todo('choose') || !todo('reply')) && todo('close')) return 'close';
    return null;
  }
  if (s.composer === 'card') return null;
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
    return { sent: !!t.sent, skipped: !!t.skipped, done: Array.isArray(t.done) ? t.done : [] };
  } catch { return null; }
}

export function saveTour(store: Store, t: Tour): void {
  try { store.setItem(TOUR_KEY, JSON.stringify(t)); } catch { /* a tip shown twice is not worth a failure */ }
}
