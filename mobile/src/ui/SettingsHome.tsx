// What Settings opens on: which computer it is about, and its pages in the
// desktop's order and groups (renderer/src/settings-search.ts), under the
// account and its Sign out, which was hard to find inside General. Shortcuts is
// about the Mac's own keys, and Cloud sells plans, which the phone app does not
// (docs/mobile/PLAN.md, 3.1). Appearance is here, for the phone's own look.
import Constants from 'expo-constants';
import { router } from '../lib/router';
import { accountsAside, cloudOnlyAccounts } from '../lib/cloud-accounts';
import { computerLine, versionLine } from '../lib/computer-line';
import { PHONE_LOOKS, type PhoneLook } from '../lib/look';
import { useCloud } from '../state/cloud';
import { useLook } from '../state/look';
import { useSettings, type SettingsState } from '../state/settings';
import { GROUPS, SETTINGS_PAGES, type PageId } from './SettingsPages';
import { Aside, Button, Group, NavRow, Row } from './SettingsParts';

export { computerLine };

function asideOf(id: PageId, s: SettingsState, look: PhoneLook) {
  const w = s.settings?.workspace;
  if (id === 'appearance') return PHONE_LOOKS.find((l) => l.id === look)?.name;
  if (!w) return undefined;
  if (id === 'claude') return accountsAside(w.accounts, cloudOnlyAccounts(w, 'claude').length);
  if (id === 'codex') return accountsAside(w.codexAccounts, cloudOnlyAccounts(w, 'codex').length);
  if (id === 'running') return w.paused ? 'Paused' : w.agentsAuto ? `Automatic (${w.agentsTotal})` : `${w.sessionsAtOnce} at once`;
  if (id === 'instructions') return w.adhdMode ? 'ADHD mode' : undefined;
  if (id === 'projects') return String(s.settings!.projects.length);
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
      <Group label="Account">
        <Row first label={email ?? 'Signed in'} control={<Button title="Sign out" onPress={() => { c.signOut(); router.replace('/sign-in'); }} />} />
      </Group>
      {GROUPS.map((g) => {
        const pages = SETTINGS_PAGES.filter((p) => p.group === g && p.shown(s));
        return pages.length ? (
          <Group key={g} label={g}>
            {pages.map((p, i) => <NavRow key={p.id} first={i === 0} label={p.label} aside={asideOf(p.id, s, look)} onPress={() => router.push(`/settings/${p.id}`)} />)}
          </Group>
        ) : null;
      })}
      <Aside>{versionLine(Constants.expoConfig?.version, Constants.nativeBuildVersion)}</Aside>
    </>
  );
}
