import { useCloud } from '../../state/cloud';
import { useSettings } from '../../state/settings';
import { computerLine, PageList } from '../../ui/SettingsHome';
import { Page } from '../../ui/SettingsParts';

export default function SettingsHome() {
  const c = useCloud();
  const s = useSettings();
  return <Page title="Settings" back="Back to app" lede={computerLine(s, c.now)}><PageList /></Page>;
}
