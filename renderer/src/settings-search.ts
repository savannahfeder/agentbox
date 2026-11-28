// THE SETTINGS MENU, AND THE SEARCH OVER IT (w-ccadd13c46, 2026-10-05).
//
// Settings was redone from scratch with Linear's settings as the reference:
// opening it swaps the sidebar for this menu, a search box sits at the top of
// it, and every page is one subject. This file is the menu and the index the
// search reads, kept out of Settings.tsx so the matching can be tested without
// drawing anything.
//
// A WORD MATCHES AT THE START OF A WORD AND NOWHERE ELSE. "mode" finds
// Permission mode; "ode" finds nothing. Every word typed has to match, so a
// second word narrows rather than widens.

export type SettingsPageId =
  | 'general' | 'appearance' | 'shortcuts' | 'phone' | 'rooms'
  | 'claude' | 'codex' | 'running' | 'cloud' | 'instructions'
  | 'projects' | 'files' | 'team';

/** The menu, in the order it is drawn, under the headings it is drawn
 *  under. Team is left out by the screen on a build with no team cloud. */
export const SETTINGS_PAGES: Array<{ id: SettingsPageId; label: string; group: 'Personal' | 'Agents' | 'Workspace' | 'Billing' }> = [
  { id: 'general', label: 'General', group: 'Personal' },
  { id: 'appearance', label: 'Appearance', group: 'Personal' },
  { id: 'shortcuts', label: 'Shortcuts', group: 'Personal' },
  { id: 'phone', label: 'Phone', group: 'Personal' },
  { id: 'claude', label: 'Claude Code', group: 'Agents' },
  { id: 'codex', label: 'Codex', group: 'Agents' },
  { id: 'running', label: 'Running', group: 'Agents' },
  { id: 'instructions', label: 'Instructions', group: 'Agents' },
  { id: 'projects', label: 'Projects', group: 'Workspace' },
  { id: 'files', label: 'Files', group: 'Workspace' },
  { id: 'team', label: 'Team', group: 'Workspace' },
  { id: 'rooms', label: 'Rooms', group: 'Workspace' },
  // Last, where people look for what they pay for; the founder's capital B.
  { id: 'cloud', label: 'Plan and Billing', group: 'Billing' },
];

/** The pages this app draws: Team with a team cloud, Plan and Billing where the cloud is offered, Rooms when they are on. */
export function pagesOn({ team, cloud, rooms }: { team: boolean; cloud: boolean; rooms: boolean }) {
  return SETTINGS_PAGES.filter((p) => (p.id !== 'team' || team) && (p.id !== 'cloud' || cloud) && (p.id !== 'rooms' || rooms));
}

const pageLabel = (id: SettingsPageId) => SETTINGS_PAGES.find((p) => p.id === id)?.label ?? id;

/** One thing the search can land on. `anchor` is the group it scrolls to on
 *  that page; `words` are what a person might type that is not in the name;
 *  `say` is its name in ⌘K, where no page around it says what "Usage" is of. */
type Entry = { page: SettingsPageId; label: string; anchor?: string; words?: string; say?: string };

const ENTRIES: Entry[] = [
  { page: 'general', label: 'Your account', anchor: 'account', words: 'signed in sign out log out logout email' },
  { page: 'general', label: 'Public links', anchor: 'public-links', words: 'share shared sharing link links public web stop' },
  { page: 'general', label: 'Show keyboard shortcut hints', anchor: 'keys', words: 'keys hints' },
  { page: 'general', label: 'Shrink the sidebar to icons', anchor: 'sidebar', words: 'sidebar narrow collapse rail icons' },
  { page: 'general', label: 'Counts and crash reports', anchor: 'privacy', words: 'privacy diagnostics analytics telemetry sends data' },
  { page: 'general', label: 'Where things are kept', anchor: 'storage', words: 'folder store path storage files disk' },
  // The words here are the ones a person types when they want the NEWEST
  // version, which is rarely the word "update": "new version", "upgrade",
  // "restart" and the version number itself all land on the same row.
  // "move to applications", "applications folder" and "disk image" are here
  // because of the one copy that cannot update itself from where it is: the
  // same row carries that press, and the words somebody types when updates
  // have stopped working are about the place, not about updating
  // (shared/where-it-runs-from.mts).
  { page: 'general', label: 'Check for updates', anchor: 'updates', words: 'update updates upgrade new version release restart newest current move applications folder disk image read-only stuck' },
  { page: 'appearance', label: 'Theme', anchor: 'theme', words: 'dark light colour color look background picture wallpaper' },
  { page: 'appearance', label: 'Blur and darkness', anchor: 'tune', words: 'tint dim glass transparency' },
  { page: 'shortcuts', label: 'Keyboard shortcuts', words: 'keys hotkeys keybindings' },
  { page: 'phone', label: 'Use it on your phone', anchor: 'phone', words: 'phone mobile qr code scan remote tailscale wifi home screen app' },
  { page: 'general', label: 'Use AI teammates', anchor: 'teammates', words: 'teammate teammates ai agent agents standing job employee hire auto routing' },
  { page: 'rooms', label: 'Show my full name', anchor: 'rooms-name', words: 'name last surname initial' },
  { page: 'rooms', label: 'What you are working on', anchor: 'rooms-card', words: 'card thread private wall' },
  { page: 'rooms', label: 'Your activity on your page', anchor: 'rooms-card', words: 'activity board inbox profile page hide' },
  { page: 'rooms', label: 'Go invisible', anchor: 'rooms-invisible', words: 'hide hidden away offline ghost' },
  { page: 'claude', label: 'Usage', say: 'Claude Code usage', anchor: 'usage', words: 'claude code limits plan left remaining quota' },
  { page: 'claude', label: 'Signed in', say: 'Claude Code accounts', anchor: 'usage', words: 'claude code account accounts login subscription add email this computer local' },
  { page: 'claude', label: 'Cloud accounts', say: 'Claude Code cloud accounts', anchor: 'cloud-accounts', words: 'claude code cloud remote accounts limit' },
  { page: 'claude', label: 'Keys for cloud threads', anchor: 'cloud-keys', words: 'keys key token tokens secret secrets api saved replace remove supabase stripe vercel sentry expo aws github' },
  { page: 'claude', label: 'Permission mode', say: 'Claude Code permission mode', anchor: 'permissions', words: 'claude code permissions bypass ask allow plan accept edits' },
  { page: 'codex', label: 'Usage', say: 'Codex usage', anchor: 'usage', words: 'codex limits plan left remaining quota' },
  { page: 'codex', label: 'Signed in', say: 'Codex accounts', anchor: 'usage', words: 'codex account accounts login subscription add email this computer local' },
  { page: 'codex', label: 'Cloud accounts', say: 'Codex cloud accounts', anchor: 'cloud-accounts', words: 'codex cloud remote accounts limit' },
  { page: 'codex', label: 'Permission mode', say: 'Codex permission mode', anchor: 'permissions', words: 'codex permissions sandbox read only full access' },
  // The Memory group folded into the Agents card (w-e5225b62ba), so these three
  // land on `at-once` together. An anchor naming a group that no longer exists
  // is a search result that scrolls nowhere.
  { page: 'files', label: 'Keep files in the cloud', anchor: 'files-cloud', words: 'storage disk space full upload backup films videos pictures images' },
  { page: 'files', label: 'Take big files off this computer', anchor: 'files-cloud', words: 'mac days free space disk storage old films videos pictures' },
  { page: 'cloud', label: 'Your plan', anchor: 'cloud-billing', words: 'agentbox cloud billing stripe payment invoices invoice receipts card cancel subscription manage plan account' },
  { page: 'cloud', label: 'This month', say: 'Cloud use this month', anchor: 'cloud-use', words: 'cloud usage hours agents running used left' },
  { page: 'cloud', label: 'Change plan', anchor: 'cloud-plans', words: 'agentbox cloud plan plans pro plus max slots upgrade downgrade switch price pay subscription' },
  { page: 'running', label: 'How many run at once', anchor: 'at-once', words: 'agents concurrent parallel sessions limit queue capacity automatic' },
  { page: 'running', label: 'Hold heavy work when memory is short', anchor: 'at-once', words: 'ram tests builds slow memory' },
  { page: 'running', label: 'Stop programs agents leave behind', anchor: 'at-once', words: 'leftovers left running finished dev servers background jobs processes cleanup kill ram memory' },
  { page: 'running', label: 'Something felt slow', anchor: 'at-once', words: 'slow fewer agents throttle struggling' },
  { page: 'running', label: 'Terminal sessions', anchor: 'outside', words: 'agents you started yourself terminal outside sessions inbox your own' },
  { page: 'running', label: 'Bring in new chats', anchor: 'outside', words: 'import chats conversations automatic' },
  { page: 'instructions', label: 'Instructions for every agent', words: 'rules prompt claude.md how agents write to you' },
  { page: 'projects', label: 'Projects', words: 'order priority archive new project' },
  { page: 'team', label: 'Team', words: 'invite people members teammates' },
];

/** A search result: the page to open, the name drawn in the result, the page's
 *  name drawn under it, and the group to scroll to. A project's page is
 *  `project:<slug>`. */
export type SettingsHit = { page: SettingsPageId | `project:${string}`; label: string; pageLabel: string; anchor?: string; say?: string };

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);

// Every typed word has to be the start of some word in the text.
const covers = (have: string[], want: string[]) => want.every((w) => have.some((h) => h.startsWith(w)));

/** `rows` is `page/label` for each row a screen draws, when it draws fewer than the desktop (the phone app). */
export function searchSettings(query: string, { pages, projects = [], rows }: {
  pages: readonly string[];
  projects?: Array<{ slug: string; name: string }>;
  rows?: readonly string[];
}): SettingsHit[] {
  const want = words(query);
  if (!want.length) return [];
  const open = new Set(pages);
  const drawn = rows ? new Set(rows) : null;
  const named: SettingsHit[] = [];
  const hidden: SettingsHit[] = [];
  for (const e of ENTRIES) {
    if (!open.has(e.page)) continue;
    if (drawn && !drawn.has(`${e.page}/${e.label}`)) continue;
    const page = pageLabel(e.page);
    const hit = { page: e.page, label: e.label, pageLabel: page, anchor: e.anchor, say: e.say };
    // The name, with the page's own name, so "codex permission" finds the Codex
    // row and not Claude Code's.
    if (covers(words(`${e.label} ${page}`), want)) named.push(hit);
    else if (covers(words(`${e.label} ${page} ${e.words ?? ''}`), want)) hidden.push(hit);
  }
  if (open.has('projects')) {
    for (const p of projects) {
      if (covers(words(p.name), want)) named.push({ page: `project:${p.slug}`, label: p.name, pageLabel: 'Projects' });
    }
  }
  return [...named, ...hidden];
}
