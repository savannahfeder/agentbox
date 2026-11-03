// The small mark at the head of each ⌘K row, the way the website's ⌘K draws it.
// Characters set in the mono face rather than drawn icons, so a new row costs
// one line here. A character that can also be an emoji carries U+FE0E, which
// asks for the plain text form; without it macOS may draw it in colour.

const TEXT = '︎';

/** What a row with no mark of its own wears. */
export const NO_GLYPH = '·';

const BY_ID: Record<string, string> = {
  'new-project': '+',
  'new-thread': '✎',
  filter: '≡',
  'clear-filter': '×',
  'projects-page': '▤',
  search: '/',
  'all-threads': '/',
  'view-inbox': '→',
  'view-progress': '→',
  'view-done': '→',
  'view-groups': '→',
  'view-teammates': '→',
  'new-teammate': '+',
  update: '↓',
  'update-move': '→',
  'update-check': '↻',
  stale: '↺',
  'resume-stopped': `▶${TEXT}`,
  standing: '¶',
  usage: '◔',
  settings: `⚙${TEXT}`,
  shortcuts: `⌨${TEXT}`,
  panel: '◧',
  'flip-view': '▦',
  'import-agents': '↓',
  tutorial: '?',
  'first-run': '↺',
  keyhints: '⌘',
  // What acts on the thread.
  'remote-control': '⇄',
  'open-terminal': '>_',
  approve: '✓',
  'run-now': '»',
  done: '□',
  reply: `↩${TEXT}`,
  'resume-any': '↻',
  resume: '↻',
  read: '○',
  unread: '●',
  unsnooze: '↑',
  snooze: '◷',
  'move-refused': '→',
  stop: '■',
  'send-back': '↶',
  redeliver: '↺',
  open: '↵',
  'see-team': '◎',
  'see-people': '◎',
  'see-private': '◎',
  pin: '◆',
  rename: '⌶',
  summary: '◫',
  code: '±',
  place: `☁${TEXT}`,
  'end-repeat': '⊘',
  'add-people': '+',
};

// Longest prefix first, so `teammate-pause-` is read before `teammate-`.
const BY_PREFIX: [string, string][] = [
  ['teammate-pause-', '‖'],
  ['teammate-', '@'],
  ['thread-', '›'],
  ['priority-urgent', '↑'],
  ['priority-high', '↑'],
  ['priority-', '↓'],
  ['rank-', '↑'],
  ['move-', '→'],
  ['model-', '◇'],
  ['group-', '#'],
  ['cloud-', `☁${TEXT}`],
  ['route-', '→'],
  ['theme-', '◐'],
];

export function glyphFor(row: { id: string; label: string }): string {
  // One id for both directions, so the label says which way it goes.
  if (row.id === 'pause') return /^unpause/i.test(row.label) ? `▶${TEXT}` : '‖';
  if (row.id.startsWith('teammate-pause-') && /^resume/i.test(row.label)) return `▶${TEXT}`;
  const own = BY_ID[row.id];
  if (own) return own;
  return BY_PREFIX.find(([p]) => row.id.startsWith(p))?.[1] ?? NO_GLYPH;
}
