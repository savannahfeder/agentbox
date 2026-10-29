// What Settings opens on: which computer it is about, and its pages in the
// desktop's order and groups (renderer/src/settings-search.ts). Shortcuts is
// about the Mac's own keys, and Cloud sells plans, which the phone app does not
// (docs/mobile/PLAN.md, 3.1). Appearance is here, for the phone's own look.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { computerLine, versionLine } from '../lib/computer-line';
import { PHONE_LOOKS, type PhoneLook } from '../lib/look';
import { useCloud } from '../state/cloud';
import { useLook } from '../state/look';
import { useSettings, type SettingsState } from '../state/settings';
import { GROUPS, SETTINGS_PAGES, type PageId } from './SettingsPages';
import { Aside, Group, NavRow } from './SettingsParts';

export { computerLine };

function asideOf(id: PageId, s: SettingsState, email: string | undefined, look: PhoneLook) {
  const w = s.settings?.workspace;
  const chosen = (list?: { chosen: boolean; email: string | null }[]) => list?.find((a) => a.chosen)?.email ?? (list?.length ? `${list.length} account${list.length === 1 ? '' : 's'}` : undefined);
  if (id === 'general') return email;
  if (id === 'appearance') return PHONE_LOOKS.find((l) => l.id === look)?.name;
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
  const { look } = useLook();
  const email = c.cloud?.session()?.user.email ?? undefined;
  return (
    <>
      {GROUPS.map((g) => {
        const pages = SETTINGS_PAGES.filter((p) => p.group === g && p.shown(s));
        return pages.length ? (
          <Group key={g} label={g}>
            {pages.map((p, i) => <NavRow key={p.id} first={i === 0} label={p.label} aside={asideOf(p.id, s, email, look)} onPress={() => router.push(`/settings/${p.id}`)} />)}
          </Group>
        ) : null;
      })}
      <Aside>{versionLine(Constants.expoConfig?.version, Constants.nativeBuildVersion)}</Aside>
    </>
  );
}
