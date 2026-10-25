// What Settings opens on: which computer it is about, and its pages in the
// desktop's order and groups (renderer/src/settings-search.ts). Appearance
// and Shortcuts are about the Mac's own screen and keys, and Cloud sells
// plans, which the phone app does not (docs/mobile/PLAN.md, 3.1).
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ago } from '../../../renderer/src/phone-rows';
import { useCloud } from '../state/cloud';
import { useSettings, type SettingsState } from '../state/settings';
import { GROUPS, SETTINGS_PAGES, type PageId } from './SettingsPages';
import { Aside, Group, NavRow } from './SettingsParts';

// The computer sends its copy at least every five minutes (main/phone-inbox.mjs).
const AWAY_MS = 15 * 60_000;

export function computerLine(s: SettingsState, now: number) {
  if (!s.computer) return s.loaded || s.error ? 'Your computer’s settings appear here once Agentbox on it is up to date and signed in to this account.' : undefined;
  const at = Date.parse(s.computer.updated_at) || 0;
  return now - at > AWAY_MS ? `From ${s.computer.name}, last online ${ago(now - at)}. What you change waits for it.` : `From ${s.computer.name}.`;
}

function asideOf(id: PageId, s: SettingsState, email: string | undefined) {
  const w = s.settings?.workspace;
  const chosen = (list?: { chosen: boolean; email: string | null }[]) => list?.find((a) => a.chosen)?.email ?? (list?.length ? `${list.length} account${list.length === 1 ? '' : 's'}` : undefined);
  if (id === 'general') return email;
  if (!w) return undefined;
  if (id === 'claude') return chosen(w.accounts);
  if (id === 'codex') return chosen(w.codexAccounts);
  if (id === 'running') return w.agentsAuto ? `Automatic (${w.agentsTotal})` : `${w.sessionsAtOnce} at once`;
  if (id === 'instructions') return w.adhdMode ? 'ADHD mode' : undefined;
  if (id === 'projects') return String(s.settings.projects.length);
  return undefined;
}

/** Every page as a row that opens it, under its group. */
export function PageList() {
  const c = useCloud();
  const s = useSettings();
  const email = c.cloud?.session()?.user.email ?? undefined;
  return (
    <>
      {GROUPS.map((g) => {
        const pages = SETTINGS_PAGES.filter((p) => p.group === g && p.shown(s));
        return pages.length ? (
          <Group key={g} label={g}>
            {pages.map((p, i) => <NavRow key={p.id} first={i === 0} label={p.label} aside={asideOf(p.id, s, email)} onPress={() => router.push(`/settings/${p.id}`)} />)}
          </Group>
        ) : null;
      })}
      <Aside>Version {Constants.expoConfig?.version}</Aside>
    </>
  );
}
