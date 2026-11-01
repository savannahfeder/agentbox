// Settings opens on its pages. Its search is an icon at the right of the Back
// row, which opens across the row while you type (phone.css `.set-search`), and
// it reads the desktop's own index (renderer/src/settings-search.ts).
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { cloudCarriesOn } from '../../../../renderer/src/phone-rows';
import { searchSettings, type SettingsHit } from '../../../../renderer/src/settings-search';
import { useCloud } from '../../state/cloud';
import { useSettings } from '../../state/settings';
import { Magnifier } from '../../ui/Filters';
import { Cross } from '../../ui/icons';
import { IconButton, T } from '../../ui/parts';
import { computerLine, PageList } from '../../ui/SettingsHome';
import { SETTINGS_PAGES } from '../../ui/SettingsPages';
import { NavRow, Page } from '../../ui/SettingsParts';
import { color, font } from '../../ui/theme';

export default function SettingsHome() {
  const c = useCloud();
  const s = useSettings();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchSettings(q, {
    pages: SETTINGS_PAGES.filter((p) => p.shown(s)).map((p) => p.id),
    projects: s.settings?.projects ?? [],
  }), [q, s]);
  const open = (hit: SettingsHit) => {
    const project = hit.page.startsWith('project:') ? hit.page.slice('project:'.length) : null;
    if (project) router.push({ pathname: '/settings/project/[slug]', params: { slug: project } });
    else router.push(`/settings/${hit.page}`);
  };
  const close = () => { setSearching(false); setQ(''); };
  const field = searching ? (
    <View style={{ flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.bg }}>
      <Magnifier size={16} />
      <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search settings" placeholderTextColor={color.faint} autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Search settings"
        style={[{ flex: 1, minWidth: 0, padding: 0, fontFamily: font.regular, fontSize: 16, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
      <IconButton label="Close search" width={36} onPress={close}><Cross size={15} /></IconButton>
    </View>
  ) : undefined;
  return (
    <Page title="Settings" back="Back to app" lede={computerLine(s, c.now, cloudCarriesOn(c.rows.projects))} head={field}
      right={<IconButton label="Search settings" onPress={() => setSearching(true)}><Magnifier size={18} /></IconButton>}>
      {!q.trim() ? <PageList /> : (
        <View style={{ marginTop: 24 }}>
          {hits.map((hit, i) => <NavRow key={`${hit.page}-${hit.label}`} first={i === 0} label={hit.label} aside={hit.pageLabel} onPress={() => open(hit)} />)}
          {hits.length === 0 && <T style={{ fontSize: 14, lineHeight: 21, color: color.faint }}>{`Nothing matches “${q}”.`}</T>}
        </View>
      )}
    </Page>
  );
}
