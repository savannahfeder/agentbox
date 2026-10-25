// With Groups on, the sidebar stays narrow and opens while pointed at
// (w-dcaa2c122e). It holds the Groups row and no groups: a group is picked on
// the Groups page, or found with G.
import type { GroupChoice } from './GroupList';
import { I } from './icons';

/** Named groups first, your pinned one leading, then chats as they come. */
export function groupsInOrder<T extends GroupChoice>(groups: readonly T[]): T[] {
  const named = groups.filter((g) => !g.faces.length).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  return [...named, ...groups.filter((g) => g.faces.length)];
}

/** The sidebar's Groups row, lit while a group or the Groups page is up. */
export function SidebarGroups({ onGroupsPage, onGroups, label = 'Groups' }: { onGroupsPage: boolean; onGroups: () => void; label?: string }) {
  return <nav className="workspace-tabs gt-rail-groups" aria-label={label}>
    <button type="button" className={`workspace-tab${onGroupsPage ? ' active' : ''}`} aria-label={label} title={label} onClick={onGroups}>{I.groupNav()}<span>{label}</span></button>
  </nav>;
}

