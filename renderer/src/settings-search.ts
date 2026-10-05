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
  | 'general' | 'appearance' | 'shortcuts'
  | 'claude' | 'codex' | 'running' | 'instructions'
  | 'projects' | 'team';

/** The menu, in the order it is drawn, under the three headings it is drawn
 *  under. Codex and Team are left out by the screen on a Mac that has neither. */
export const SETTINGS_PAGES: Array<{ id: SettingsPageId; label: string; group: 'Personal' | 'Agents' | 'Workspace' }> = [
  { id: 'general', label: 'General', group: 'Personal' },
  { id: 'appearance', label: 'Appearance', group: 'Personal' },
  { id: 'shortcuts', label: 'Shortcuts', group: 'Personal' },
  { id: 'claude', label: 'Claude Code', group: 'Agents' },
  { id: 'codex', label: 'Codex', group: 'Agents' },
  { id: 'running', label: 'Running', group: 'Agents' },
  { id: 'instructions', label: 'Instructions', group: 'Agents' },
  { id: 'projects', label: 'Projects', group: 'Workspace' },
  { id: 'team', label: 'Team', group: 'Workspace' },
];

const pageLabel = (id: SettingsPageId) => SETTINGS_PAGES.find((p) => p.id === id)?.label ?? id;

/** One thing the search can land on. `anchor` is the group it scrolls to on
 *  that page; `words` are what a person might type that is not in the name. */
type Entry = { page: SettingsPageId; label: string; anchor?: string; words?: string };

const ENTRIES: Entry[] = [
  { page: 'general', label: 'Your account', anchor: 'account', words: 'signed in sign out log out logout email' },
  { page: 'general', label: 'Show keyboard shortcut hints', anchor: 'keys', words: 'keys hints' },
  { page: 'general', label: 'Counts and crash reports', anchor: 'privacy', words: 'privacy diagnostics analytics telemetry sends data' },
  { page: 'general', label: 'Where things are kept', anchor: 'storage', words: 'folder store path storage files disk' },
  { page: 'appearance', label: 'Theme', anchor: 'theme', words: 'dark light colour color look background picture wallpaper' },
  { page: 'appearance', label: 'Blur and darkness', anchor: 'tune', words: 'tint dim glass transparency' },
  { page: 'shortcuts', label: 'Keyboard shortcuts', words: 'keys hotkeys keybindings' },
  { page: 'claude', label: 'Usage', anchor: 'usage', words: 'claude code limits plan left remaining quota' },
  { page: 'claude', label: 'Signed in', anchor: 'accounts', words: 'claude code account accounts login subscription add email' },
  { page: 'claude', label: 'Permission mode', anchor: 'permissions', words: 'claude code permissions bypass ask allow plan accept edits' },
  { page: 'codex', label: 'Usage', anchor: 'usage', words: 'codex limits plan left remaining quota' },
  { page: 'codex', label: 'Signed in', anchor: 'accounts', words: 'codex account accounts login subscription add email' },
  { page: 'codex', label: 'Permission mode', anchor: 'permissions', words: 'codex permissions sandbox read only full access' },
  { page: 'running', label: 'Agents at once', anchor: 'at-once', words: 'concurrent parallel sessions limit queue capacity' },
  { page: 'running', label: 'Hold heavy work when memory is short', anchor: 'memory', words: 'ram tests builds slow' },
  { page: 'running', label: 'Agents you started yourself', anchor: 'outside', words: 'terminal outside sessions inbox your own' },
  { page: 'instructions', label: 'Instructions for every agent', words: 'rules prompt claude.md how agents write to you' },
  { page: 'projects', label: 'Projects', words: 'order priority archive new project' },
  { page: 'team', label: 'Team', words: 'invite people members teammates' },
];

/** A search result: the page to open, the name drawn in the result, the page's
 *  name drawn under it, and the group to scroll to. A project's page is
 *  `project:<slug>`. */
export type SettingsHit = { page: SettingsPageId | `project:${string}`; label: string; pageLabel: string; anchor?: string };

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);

// Every typed word has to be the start of some word in the text.
const covers = (have: string[], want: string[]) => want.every((w) => have.some((h) => h.startsWith(w)));

export function searchSettings(query: string, { pages, projects = [] }: {
  pages: readonly string[];
  projects?: Array<{ slug: string; name: string }>;
}): SettingsHit[] {
  const want = words(query);
  if (!want.length) return [];
  const open = new Set(pages);
  const named: SettingsHit[] = [];
  const hidden: SettingsHit[] = [];
  for (const e of ENTRIES) {
    if (!open.has(e.page)) continue;
    const page = pageLabel(e.page);
    const hit = { page: e.page, label: e.label, pageLabel: page, anchor: e.anchor };
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
