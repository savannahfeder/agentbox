// THE TUTORIAL ON YOUR OWN INBOX (w-31c71743b5): which thing glows, with no
// window in it. components/Tour.tsx draws it; the test
// tests/the-tutorial-walks-you-through-your-first-real-thread.test.mjs holds
// what each rule is for.

/** The guided part, in order, then the tips that each show once. */
export type TourStep = 'start' | 'folder' | 'pick' | 'send' | 'working' | 'open' | 'choose' | 'close';
export type Lesson = 'working' | 'open' | 'choose' | 'close';

export interface Tour {
  /** Still walking someone to their first send. */
  guided: boolean;
  sent: boolean;
  /** Skipped, clicked away from, or the New thread box closed unsent: nothing more, ever. */
  skipped: boolean;
  /** The tips already shown. */
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
  /** A thread is open. */
  thread: boolean;
  /** The open thread offers options. */
  options: boolean;
  /** Something else is over the window: settings, ⌘K, another card. */
  covered: boolean;
}

export const TOUR_KEY = 'zero.tour';

export const startTour = (): Tour => ({ guided: true, sent: false, skipped: false, done: [] });
export const skipTour = (t: Tour): Tour => ({ ...t, guided: false, skipped: true });
export const noteSent = (t: Tour): Tour => ({ ...t, guided: false, sent: true });
export const finishLesson = (t: Tour, l: Lesson): Tour => (t.done.includes(l) ? t : { ...t, done: [...t.done, l] });

/** The first-thread suggestions belong to the guided part and to nothing after it. */
export const showIdeas = (t: Tour | null): boolean => !!t && t.guided && !t.sent && !t.skipped;

export function tourStep(t: Tour | null, s: TourScreen): TourStep | null {
  if (!t || t.skipped || s.covered) return null;
  if (t.guided && !t.sent) {
    if (s.composer === 'none') return s.thread ? null : 'start';
    if (!s.folder) return 'folder';
    return s.text ? 'send' : 'pick';
  }
  const todo = (l: Lesson) => !t.done.includes(l);
  if (s.thread) {
    if (s.options && todo('choose')) return 'choose';
    if (!todo('choose') && todo('close')) return 'close';
    return null;
  }
  if (s.composer === 'card') return null;
  if (t.sent && todo('working') && s.view === 'progress' && s.running > 0) return 'working';
  if (todo('open') && s.view === 'inbox' && s.rows > 0) return 'open';
  return null;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function readTour(store: Store): Tour | null {
  try {
    const raw = store.getItem(TOUR_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (typeof t !== 'object' || !t) return null;
    return { guided: !!t.guided, sent: !!t.sent, skipped: !!t.skipped, done: Array.isArray(t.done) ? t.done : [] };
  } catch { return null; }
}

export function saveTour(store: Store, t: Tour): void {
  try { store.setItem(TOUR_KEY, JSON.stringify(t)); } catch { /* a tip shown twice is not worth a failure */ }
}
