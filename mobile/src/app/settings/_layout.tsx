// Every Settings page shares one reading of the computer's settings
// (state/settings.tsx), and waits for sign-in like every other screen.
import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { screenGate } from '../../lib/thread-gate';
import { useCloud } from '../../state/cloud';
import { SettingsProvider } from '../../state/settings';
import { Wall } from '../../ui/parts';
import { color } from '../../ui/theme';

export default function SettingsLayout() {
  const c = useCloud();
  const gate = screenGate(c);
  if (gate === 'wait') return <Wall><View /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;
  return (
    <SettingsProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'slide_from_right' }} />
    </SettingsProvider>
  );
}
