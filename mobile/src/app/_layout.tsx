import '../platform/polyfills';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, useFonts } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { CloudProvider } from '../state/cloud';
import { GroupsProvider } from '../state/groups';
import { LookProvider, useLook } from '../state/look';
import { Approvals } from '../ui/Approvals';
import { color } from '../ui/theme';
import { Toast } from '../ui/Toast';

const PREVIEW_PHONE = process.env.EXPO_PUBLIC_PREVIEW === '1' && Platform.OS === 'web' ? { top: 62, bottom: 34, left: 0, right: 0 } : null;

// An alert that names a thread opens it.
function useAlertsOpenThreads() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open =(data: any) => { if (data?.product && data?.id) router.push({ pathname: '/thread/[product]/[id]', params: { product: data.product, id: data.id } }); };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, []);
}

// A new look redraws each screen where it stands: its colours are read while it
// draws (ui/theme.ts), and the key makes every one of them draw again.
function Redrawn({ children }: { children: ReactNode }) {
  return <View key={useLook().worn} style={{ flex: 1 }}>{children}</View>;
}
const redrawn = ({ children }: { children: ReactNode }) => <Redrawn>{children}</Redrawn>;

export default function Root() {
  return <LookProvider><App /></LookProvider>;
}

function App() {
  const { worn } = useLook();
  const [loaded, failed] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, GeistMono_400Regular, GeistMono_500Medium });
  useAlertsOpenThreads();
  // A browser swaps the fonts in when they arrive, and WebKit's never reports back.
  if (!loaded && !failed && Platform.OS !== 'web') return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  const app = (
    <CloudProvider>
      <GroupsProvider>
        <StatusBar style={worn === 'light' ? 'dark' : 'light'} />
        <Stack screenLayout={redrawn} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'slide_from_right' }} />
        <Approvals />
        <Toast />
      </GroupsProvider>
    </CloudProvider>
  );
  return (
    <SafeAreaProvider>
      {/* A browser has no status bar or home bar; the preview is drawn with an iPhone's. */}
      {PREVIEW_PHONE ? <SafeAreaInsetsContext.Provider value={PREVIEW_PHONE}>{app}</SafeAreaInsetsContext.Provider> : app}
    </SafeAreaProvider>
  );
}
