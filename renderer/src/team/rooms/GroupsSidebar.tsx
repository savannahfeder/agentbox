// With Groups on, the narrow sidebar (w-dcaa2c122e) holds the Groups row and
// no groups: a group is picked on the Groups page, or found with G.
import type { GroupChoice } from './GroupList';
import { I } from './icons';

/** Named groups first: your team's, then yours, then the public ones. Then chats as they come. */
export function groupsInOrder<T extends GroupChoice>(groups: readonly T[]): T[] {
  const named = groups.filter((g) => !g.faces.length).sort((a, b) => Number(!!b.team) - Number(!!a.team) || Number(!!a.open) - Number(!!b.open)
    || Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  return [...named, ...groups.filter((g) => g.faces.length)];
}

/** The sidebar's Groups row, lit while a group or the Groups page is up. */
export function SidebarGroups({ onGroupsPage, onGroups, label = 'Groups' }: { onGroupsPage: boolean; onGroups: () => void; label?: string }) {
  return <nav className="workspace-tabs gt-rail-groups" aria-label={label}>
    <button type="button" className={`workspace-tab${onGroupsPage ? ' active' : ''}`} aria-label={label} title={label} onClick={onGroups}>{I.groupNav()}<span>{label}</span></button>
  </nav>;
}

