// THE FOLDERS A PROJECT MAY NOT BE, AND WHY macOS ASKS ABOUT MUSIC.
//
// That sentence is macOS, not us. Desktop, Documents, Downloads, Music,
// Pictures, Movies and everything under ~/Library are guarded by the system's
// privacy layer, so the FIRST time any process reads one of them the system
// throws up a panel with our name on it. Agentbox spawns Claude Code with the
// project folder as its working directory, and a worker that starts in the home
// folder will list it within its first few tool calls. One folder choice is
// therefore the difference between no panels at all and a run of them naming
// every private corner of somebody's Mac, on the second screen they ever see.
//
// Nothing stopped that choice. `zero:choose-folder` handed back whatever the
// Mac's own picker returned, and the picker opens on the home folder, so "just
// press Open" was a live path to exactly this.
//
// SO THIS IS A REFUSAL, NOT A WARNING. A warning on this screen is a question
// somebody with no way to answer it has to answer anyway. The folder is turned
// down and the sentence says which folder to pick instead.
//
// It is deliberately SHORT. The only folders refused are the ones that are not
// projects by construction: the home folder itself, the system's own top-level
// directories, and the seven guarded folders IN THEMSELVES. A project INSIDE
// any of them is fine and is not asked about — `~/Documents/my-app` is where
// plenty of people keep their code, it costs one panel the first time and it is
// genuinely their project. What is refused is pointing at `~/Documents` whole.
//
// Pure, so both sides of the bridge and the tests can use one copy: the
// renderer checks as she picks, and main checks again before it writes.

/**
 * The guarded folders, by their name directly under the home folder. The
 *  system asks about each of these separately, which is why the panels arrive
 *  as a run rather than as one. `Library` is the one that reads as "every app":
 *  it holds one directory per application under Application Support. */
export const GUARDED = [
  'Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures', 'Library', 'Public',
];

/** Top-level directories that are the Mac and not anybody's work. */
const SYSTEM = [
  '/', '/Applications', '/Library', '/System', '/Users', '/Volumes',
  '/private', '/tmp', '/var', '/etc', '/usr', '/bin', '/sbin', '/opt', '/net', '/cores',
];

/**
 * THE FOLDER A PATH NAMES, with `.`, `..`, doubled and trailing slashes gone.
 *
 *  `~` is left as `~`: the renderer does not know whose home this is and hands
 *  paths through exactly as it got them.
 *
 *  The dots are not pedantry. A file dialog hands back whatever its location
 *  bar is holding, so `~/.` reaches the check as a path that is not equal to
 *  the home folder, and the refusal below is a string comparison.
 */
export function tidyFolder(p) {
  const s = String(p ?? '').trim();
  if (!s) return '';
  const root = s.startsWith('~') ? '~' : s.startsWith('/') ? '/' : '';
  const parts = [];
  for (const part of s.slice(root.length).split('/')) {
    if (!part || part === '.') continue;
    // Above a root there is nothing to climb to, so the climb stops there.
    if (part === '..') { if (parts.length) parts.pop(); else if (!root) parts.push('..'); continue; }
    parts.push(part);
  }
  if (root === '~') return parts.length ? `~/${parts.join('/')}` : '~';
  if (root === '/') return `/${parts.join('/')}`;
  return parts.join('/');
}

function underHome(p, home) {
  const h = tidyFolder(home);
  if (!h) return null;
  if (p === h) return '';
  return p.startsWith(`${h}/`) ? p.slice(h.length + 1) : null;
}

/**
 * WHETHER THIS FOLDER CAN BE A PROJECT, and the sentence to show when it
 *  cannot. Returns `{ ok: true }` or `{ ok: false, reason, say }`.
 *
 *  `say` is written to be shown as it stands, on the setup screen and on the
 *  New Project card, so it names the folder that was picked and says what to
 *  pick instead. `reason` is for tests and for the note in the log; nothing
 *  puts it on a screen.
 */
export function checkProjectFolder(folder, { home = '' } = {}) {
  const p = tidyFolder(folder);
  if (!p) return { ok: true };

  // `~` and `~/` are the home folder written the way our own screens write it.
  const rel = p === '~' || p === '~/' ? '' : (p.startsWith('~/') ? p.slice(2) : underHome(p, home));

  if (rel === '') {
    return {
      ok: false,
      reason: 'home',
      say: 'That is your whole home folder. Agents would work across everything on this computer, and the system will ask you about Downloads, Music and every app you have. Pick the folder your project’s code is in.',
    };
  }

  if (rel !== null && GUARDED.includes(rel)) {
    return {
      ok: false,
      reason: 'guarded',
      say: `${rel} holds a lot more than one project, and the system guards it, so choosing it means a run of permission panels. Pick the folder inside it that your project’s code is in.`,
    };
  }

  if (SYSTEM.includes(p)) {
    return {
      ok: false,
      reason: 'system',
      say: `${p} is part of the system rather than one of your projects. Pick the folder your project’s code is in.`,
    };
  }

  // A volume root: /Volumes/Whatever with nothing after it.
  if (/^\/Volumes\/[^/]+$/.test(p)) {
    return {
      ok: false,
      reason: 'volume',
      say: `${p} is a whole disk rather than one project. Pick the folder your project’s code is in.`,
    };
  }

  return { ok: true };
}

/**
 * The folders people keep code in, tried in this order when there is nothing
 *  to learn from. None of them is one of the guarded seven, so opening the
 *  window on one costs no permission panel.
 */
const USUAL = ['dev', 'code', 'src', 'Projects', 'projects', 'Developer', 'repos', 'workspace'];

/**
 * WHERE THE SYSTEM'S FOLDER WINDOW OPENS, in order, best first (F-148).
 *
 *  Returns candidates rather than one answer because only main can see which
 *  of them exist on the disk; it takes the first that does. The home folder is
 *  last and is only ever a last resort: it is the one folder
 *  `checkProjectFolder` refuses outright, so opening on it is opening on a
 *  place where pressing the button cannot work.
 *
 *  `known` is the folders of the projects already connected. Their PARENT is
 *  what gets offered, commonest first, because the folder beside the projects
 *  somebody already has is where the next one is.
 */
export function chooserStartsIn(startIn, { known = [], home = '' } = {}) {
  const h = tidyFolder(home);
  const counts = new Map();
  for (const f of known) {
    const p = tidyFolder(f);
    const cut = p.lastIndexOf('/');
    if (cut <= 0) continue;
    const parent = p.slice(0, cut);
    if (!checkProjectFolder(parent, { home: h }).ok) continue;
    counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  const parents = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .map(([parent]) => parent);
  const asked = tidyFolder(startIn);
  const order = [asked, ...parents, ...(h ? USUAL.map((name) => `${h}/${name}`) : []), h];
  return [...new Set(order.filter(Boolean))];
}

/**
 * WHERE A NEW PROJECT'S FOLDER IS PROPOSED, when nobody has pointed at one.
 *
 *  NOTHING CALLS THIS ANY MORE (w-33e1c968f0, 2026-10-05). A new project is
 *  made in a folder picked in the Mac's own window, so there is no proposal to
 *  make and no folder is ever created from a name. It is kept because two tests
 *  use it as the record of what the wrong home folder used to cost; do not wire
 *  it back into the app without reading that work item first.
 *
 *  This used to be `~/Desktop/dev/<slug>` flat, which is one developer's own
 *  filing system shipped to everybody, and it is inside Desktop, which is one
 *  of the guarded seven above: the very first project anybody made through the
 *  card asked macOS for the Desktop before it had drawn anything.
 *
 *  So the parent is LEARNED from the projects they already have, and only
 *  guessed when there are none. `existing` is the folders of their current
 *  projects; the commonest parent among them wins, because somebody with three
 *  projects in `~/code` wants the fourth there too.
 *
 *  The guess when there is nothing to learn from is `~/dev`, which is not
 *  guarded and costs no panel. It is a guess and the card says so by showing
 *  the whole path, which is the same thing it has always done.
 */
export function proposeParent(existing = [], { home = '~' } = {}) {
  const counts = new Map();
  for (const f of existing) {
    const p = tidyFolder(f);
    if (!p) continue;
    const cut = p.lastIndexOf('/');
    if (cut <= 0) continue;
    const parent = p.slice(0, cut);
    // The PARENT is what gets proposed, so the parent is what is judged. A
    // project sitting directly in ~/Downloads is a real project and is allowed;
    // proposing ~/Downloads as the home of the next one is not.
    if (!checkProjectFolder(parent, { home }).ok) continue;
    counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [parent, n] of counts) {
    // Ties go to the shorter path, so a stable answer rather than whichever
    // project happened to be listed first.
    if (n > bestN || (n === bestN && best && parent.length < best.length)) { best = parent; bestN = n; }
  }
  return best ?? `${tidyFolder(home) || '~'}/dev`;
}
