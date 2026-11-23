// The icon at the head of each ⌘K row: 16px line drawings in the thread menu's
// style (threads/ThreadMenu.tsx), on a 24 grid. An action the menu also offers
// wears the menu's own drawing, path for path. Paths only, so this file stays
// plain TypeScript and Palette.tsx draws them.

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const box = (x: number, y: number, w: number, h: number, r = 2) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

const PERSON = [circle(9, 8, 3.5), 'M3 20c0-3.5 2.7-5.5 6-5.5 1.4 0 2.7.4 3.7 1'];
const BUBBLE = 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z';
const TRAY = ['M3 13h5l1.5 2.5h5L16 13h5', 'M5.5 5h13l2.5 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z'];

export const ICONS = {
  // The thread menu's drawings.
  rename: ['M4 20h4L19 9l-4-4L4 16z'],
  move: ['M3 12h13m-4-4 4 4-4 4', 'M20 4v16'],
  pin: ['M8 3h8l-1.5 6 3.5 3.5H6L9.5 9z', 'M12 12.5V21'],
  later: [circle(12, 12, 9), 'M12 7v5l3.5 2'],
  give: [...PERSON, 'M15 17h6m-2.5-2.5L21 17l-2.5 2.5'],
  done: ['m3 13 3.6 3.6L13.4 9', 'm10.6 13 3.6 3.6L21 9'],
  code: ['m8.5 7-5 5 5 5', 'm15.5 7 5 5-5 5'],
  terminal: [box(3, 4, 18, 16), 'm7 9 3 3-3 3m6 0h4'],
  run: ['M5 5v14', 'm9 5 10 7-10 7z'],
  wait: ['M6 3h12M6 21h12M7 3v4l5 5 5-5V3M7 21v-4l5-5 5 5v4'],
  shipped: ['M4 9h16v11H4z', 'M12 15V3m-3.5 3.5L12 3l3.5 3.5'],
  'stop-repeat': ['M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6', 'M18 3v4h-4M6 21v-4h4', 'm4 4 16 16'],
  reopen: ['M4 10h11a5 5 0 0 1 0 10h-4', 'm8 6-4 4 4 4'],
  'add-person': [...PERSON, 'M18 13v7m-3.5-3.5h7'],
  cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
  // The sidebar's.
  home: ['M5 10.4 12 5l7 5.4v8.6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z', 'M10 20v-4.6a2 2 0 0 1 4 0V20'],
  team: [circle(12, 7.5, 2.5), circle(6, 10, 2), circle(18, 10, 2), 'M8 19c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5', 'M3 18c0-2 1.3-3.5 3-3.5.8 0 1.5.3 2 .8M21 18c0-2-1.3-3.5-3-3.5-.8 0-1.5.3-2 .8'],
  link: ['M10 13.5a4 4 0 0 0 5.66 0l2.5-2.5a4 4 0 0 0-5.66-5.66l-1 1', 'M14 10.5a4 4 0 0 0-5.66 0l-2.5 2.5a4 4 0 0 0 5.66 5.66l1-1'],
  file: ['M7 4.5h6.5l4 4V19a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z', 'M13.5 4.5v4h4'],
  instructions: ['M6 3.5h8l4 4V20H6zM14 3.5V8h4M9 12h6M9 16h6'],
  search: [circle(10.5, 10.5, 6.5), 'M15.5 15.5 20 20'],
  // The palette's own.
  plus: ['M12 5v14M5 12h14'],
  compose: ['M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5', 'M17.5 3.5l3 3L12 15H9v-3z'],
  filter: ['M4 6h16M7 12h10M10 18h4'],
  clear: ['M6 6l12 12M18 6 6 18'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  top: ['M12 20V9m-5 5 5-5 5 5', 'M5 4h14'],
  inbox: TRAY,
  progress: [circle(12, 12, 9), 'M10 8.8v6.4l5-3.2z'],
  hash: ['M10 4 8 20M16 4l-2 16M4.5 9h15M4 15h15'],
  person: [circle(12, 8, 4), 'M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6'],
  pause: ['M9 5v14M15 5v14'],
  play: ['M7 5l12 7-12 7z'],
  theme: [circle(12, 12, 8), 'M12 4v16'],
  download: ['M12 4v11m-4.5-4.5L12 15l4.5-4.5', 'M5 20h14'],
  refresh: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v4.5h-4.5'],
  gauge: ['M4 17a8 8 0 1 1 16 0', 'm12 17 4-5'],
  settings: ['M4 7h9M17 7h3M4 17h3M11 17h9', circle(15, 7, 2), circle(9, 17, 2)],
  keyboard: [box(3, 6, 18, 12), 'M7 10h.01M11 10h.01M15 10h.01M8 14h8'],
  board: [box(3, 4, 18, 16), 'M9 4v16M15 4v16'],
  help: [circle(12, 12, 9), 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6', 'M12 17h.01'],
  swap: ['M4 8h14m-3.5-3.5L18 8l-3.5 3.5', 'M20 16H6m3.5-3.5L6 16l3.5 3.5'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  closed: [circle(12, 12, 9), 'm8 12.3 2.8 2.8L16 9.6'],
  reply: ['M10 7 5 12l5 5', 'M5 12h9a5 5 0 0 1 5 5v1'],
  read: ['M3 10l9-6 9 6v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z', 'M3.5 10.5l8.5 5.5 8.5-5.5'],
  unread: [box(3, 5, 18, 14), 'M3.5 7.5l8.5 6 8.5-6'],
  stop: [box(6, 6, 12, 12)],
  open: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4'],
  lock: [box(5, 11, 14, 9), 'M8 11V8a4 4 0 0 1 8 0v3'],
  text: ['M5 7h14M5 12h14M5 17h9'],
  thread: [BUBBLE],
  comment: [BUBBLE, 'M8 9h8M8 12.5h5'],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  spark: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'],
  'priority-low': ['M6 19v-3'],
  'priority-medium': ['M6 19v-3M10.5 19v-6.5'],
  'priority-high': ['M6 19v-3M10.5 19v-6.5M15 19v-10'],
  'priority-urgent': ['M6 19v-3M10.5 19v-6.5M15 19v-10M19.5 19v-14'],
  chevron: ['m9 6 6 6-6 6'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

/** What a row nobody has drawn yet wears: always the same one. */
export const PLAIN_ICON: IconName = 'chevron';

const BY_ID: Record<string, IconName> = {
  'new-project': 'plus',
  'new-thread': 'compose',
  filter: 'filter',
  'clear-filter': 'clear',
  'end-tutorial': 'clear',
  'projects-page': 'folder',
  search: 'search',
  'all-threads': 'search',
  'view-home': 'home',
  'view-inbox': 'inbox',
  'view-progress': 'progress',
  'view-later': 'later',
  'view-done': 'done',
  'view-groups': 'hash',
  'view-teammates': 'team',
  'view-connections': 'link',
  'new-teammate': 'add-person',
  update: 'download',
  'update-move': 'move',
  'update-check': 'refresh',
  stale: 'refresh',
  'resume-stopped': 'play',
  standing: 'instructions',
  usage: 'gauge',
  settings: 'settings',
  shortcuts: 'keyboard',
  keyhints: 'keyboard',
  'flip-view': 'board',
  'import-agents': 'download',
  'bring-in': 'download',
  tutorial: 'help',
  'first-run': 'refresh',
  demo: 'spark',
  // What acts on the thread.
  'remote-control': 'swap',
  'open-terminal': 'terminal',
  approve: 'check',
  'run-now': 'run',
  done: 'done',
  'close-task': 'closed',
  reopen: 'reopen',
  'send-back': 'reopen',
  reply: 'reply',
  'resume-any': 'refresh',
  'try-again': 'refresh',
  resume: 'refresh',
  redeliver: 'refresh',
  read: 'read',
  unread: 'unread',
  snooze: 'later',
  unsnooze: 'inbox',
  'move-refused': 'move',
  stop: 'stop',
  open: 'open',
  'see-team': 'team',
  'see-people': 'add-person',
  'see-private': 'lock',
  pin: 'pin',
  rename: 'rename',
  summary: 'text',
  code: 'code',
  place: 'cloud',
  'end-repeat': 'stop-repeat',
  'add-people': 'add-person',
  shipped: 'shipped',
  'team-list-shipped': 'shipped',
  decide: 'flag',
  'wait-stop': 'wait',
};

// Longest prefix first, so `teammate-pause-` is read before `teammate-`.
const BY_PREFIX: [string, IconName][] = [
  ['outside-', 'inbox'],
  ['teammate-pause-', 'pause'],
  ['teammate-', 'person'],
  ['chat-person-', 'person'],
  ['chat-', 'hash'],
  ['thread-', 'thread'],
  ['card-', 'thread'],
  ['line-', 'text'],
  ['files-', 'file'],
  ['file-', 'file'],
  ['comment-', 'comment'],
  ['decision-', 'flag'],
  ['team-list-', 'flag'],
  ['priority-urgent', 'priority-urgent'],
  ['priority-high', 'priority-high'],
  ['priority-medium', 'priority-medium'],
  ['priority-', 'priority-low'],
  ['rank-', 'top'],
  ['move-', 'move'],
  ['give-', 'give'],
  ['take-back', 'reopen'],
  ['route-', 'give'],
  ['model-', 'spark'],
  ['group-', 'hash'],
  ['cloud-', 'cloud'],
  ['theme-', 'theme'],
  ['wait-', 'wait'],
];

export function iconFor(row: { id: string; label: string }): IconName {
  // One id for both directions, so the label says which way it goes.
  if (row.id === 'pause') return /^unpause/i.test(row.label) ? 'play' : 'pause';
  if (row.id.startsWith('teammate-pause-') && /^resume/i.test(row.label)) return 'play';
  return BY_ID[row.id] ?? BY_PREFIX.find(([p]) => row.id.startsWith(p))?.[1] ?? PLAIN_ICON;
}
