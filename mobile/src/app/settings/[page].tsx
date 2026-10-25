// One Settings page on its own (ui/SettingsPages.tsx).
import { Redirect, useLocalSearchParams } from 'expo-router';
import { SETTINGS_PAGES } from '../../ui/SettingsPages';
import { Page } from '../../ui/SettingsParts';

export default function SettingsPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const def = SETTINGS_PAGES.find((p) => p.id === page);
  if (!def) return <Redirect href="/settings" />;
  return <Page title={def.label} lede={def.lede}><def.Body /></Page>;
}
