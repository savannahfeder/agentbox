// The first run's last step: alerts, offered once. Settings › General turns them on later.
import { useState } from 'react';
import { View } from 'react-native';
import { ALERTS_ASKED_KEY } from '../lib/first-run';
import { appStore } from '../platform/persist';
import { useCloud } from '../state/cloud';
import { AppMark } from '../ui/icons';
import { Bars, Btn, Card, Head, leaveSetup, Lede, Logo, Screen } from '../ui/Onboarding';
import { T } from '../ui/parts';
import { color, font } from '../ui/theme';

export default function Alerts() {
  const c = useCloud();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = () => { appStore.setItem(ALERTS_ASKED_KEY, '1'); leaveSetup(); };
  const turnOn = async () => {
    setBusy(true); setError(null);
    try { await c.turnOnAlerts(); done(); } catch (err) { setError(String((err as Error)?.message ?? err)); } finally { setBusy(false); }
  };
  return (
    <Screen top={24} foot={<><Btn kind="primary" label={busy ? 'Turning on…' : 'Turn on alerts'} disabled={busy} onPress={turnOn} /><Btn kind="quiet" label="Not now" onPress={done} /></>}>
      <Bars at="alerts" />
      <Logo />
      <Head style={{ marginTop: 28 }}>{'Get an alert when\nyou are needed'}</Head>
      <Lede>When a thread finishes or asks you something.</Lede>
      <Card style={{ marginTop: 30, backgroundColor: color.card, borderColor: color.lineStrong, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: color.bg, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' }}><AppMark size={22} /></View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T style={{ fontSize: 14.5, fontFamily: font.semibold }}>Agentbox</T><T style={{ fontSize: 12.5, color: color.faint }}>now</T>
          </View>
          <T style={{ fontSize: 14.5, lineHeight: 20, color: color.dim, marginTop: 1 }}>Plan the phone app is ready for you</T>
        </View>
      </Card>
      {error && <T accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 18 }}>{error}</T>}
    </Screen>
  );
}
