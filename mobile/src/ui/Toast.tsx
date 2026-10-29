// The toast, as the phone site draws it (phone.css `.toast`): one slim line
// under the top bar, Undo as a word on its right end, and a tap on the rest
// opens the thread it names while the orange line under it runs out.
import { router, useGlobalSearchParams, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { threadOnScreen, toastLife, toastTapOpens, TOAST_GOES_MS } from '../lib/overlays';
import { useCloud, type Toast as Said } from '../state/cloud';
import { T } from './parts';
import { color, size } from './theme';

function Clock() {
  const left = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const run = Animated.timing(left, { toValue: 0, duration: TOAST_GOES_MS, easing: Easing.linear, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [left]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 14, right: 14, bottom: 0, height: 2 }}>
      <Animated.View style={{ height: 2, backgroundColor: color.accent, opacity: 0.7, width: left.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

function Card({ toast, dismiss }: { toast: Said; dismiss: () => void }) {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const opens = toastTapOpens(toast, threadOnScreen(segments, params));
  const open = () => {
    dismiss();
    if (toast.goes) router.push({ pathname: '/thread/[product]/[id]', params: toast.goes });
  };
  return (
    <Pressable disabled={!opens} onPress={open} accessibilityRole={opens ? 'button' : undefined}
      style={{
        minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 6,
        backgroundColor: color.pop, borderWidth: 1, borderColor: color.line, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: color.lift, shadowRadius: 35, shadowOffset: { width: 0, height: 24 }, elevation: 16,
      }}>
      {/* Only a toast that names a thread stays on one line; a plain one wraps (`.toast-plain`). */}
      <T numberOfLines={toast.goes ? 1 : undefined} style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 17.55 }}>{toast.line}</T>
      {toast.undo && (
        <Pressable accessibilityRole="button" onPress={() => { const undo = toast.undo!; dismiss(); void undo(); }}
          style={({ pressed }) => ({ height: 40, paddingHorizontal: 10, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <T style={{ fontSize: 13.5, lineHeight: 17.55, color: color.accent }}>Undo</T>
        </Pressable>
      )}
      {toast.goes && <Clock />}
    </Pressable>
  );
}

export function Toast() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const toast = c.toast;
  const dismiss = c.dismissToast;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, toastLife(toast));
    return () => clearTimeout(timer);
    // By its key alone: the cloud redraws every few seconds, and a timer started over each time would never end.
  }, [toast?.key]);
  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: inset.top + size.topBar + 8, left: 12, right: 12 }}>
      <Card key={toast.key} toast={toast} dismiss={dismiss} />
    </View>
  );
}
