// The toast after a press: one slim line with Undo as a word on its right end,
// a tap on the rest opens the thread it names while the orange line under it
// runs out (the phone site's `.toast`).
//
// It used to sit under the top bar, over the first thing on the screen, and
// stayed its six seconds whatever you did. Her words from the phone app
// (2026-10-29): "The toast that tells me the item has sent often blocks
// important information. Not only is it poorly placed but I can't dismiss it."
// Now a swipe toward its own edge or the cross takes it away at once, and it
// sits where `toastPlace` puts it (lib/overlays.ts).
import { router, useGlobalSearchParams, useSegments } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { threadOnScreen, toastLife, toastPlace, toastTapOpens, TOAST_GOES_MS, TOAST_SWIPE_PX, type ToastPlace } from '../lib/overlays';
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

function Cross() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color.dim} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </Svg>
  );
}

function Card({ toast, dismiss, place }: { toast: Said; dismiss: () => void; place: ToastPlace }) {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const opens = toastTapOpens(toast, threadOnScreen(segments, params));
  const open = () => {
    dismiss();
    if (toast.goes) router.push({ pathname: '/thread/[product]/[id]', params: toast.goes });
  };
  // A swipe toward the edge it sits on takes it away; a short one springs back.
  const away = place.edge === 'top' ? -1 : 1;
  const drag = useRef(new Animated.Value(0)).current;
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => drag.setValue(g.dy * away > 0 ? g.dy : g.dy / 4),
    onPanResponderRelease: (_, g) => {
      if (g.dy * away > TOAST_SWIPE_PX || g.vy * away > 0.6) {
        Animated.timing(drag, { toValue: away * 140, duration: 160, useNativeDriver: true }).start(dismiss);
      } else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [drag, away, dismiss]);
  return (
    <Animated.View {...swipe.panHandlers} style={{ transform: [{ translateY: drag }], opacity: drag.interpolate({ inputRange: [-140, 0, 140], outputRange: [0, 1, 0] }), ...(place.pill ? { alignSelf: 'center', maxWidth: '100%' } : null) }}>
      <Pressable disabled={!opens} onPress={open} accessibilityRole={opens ? 'button' : undefined}
        style={{
          minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 14, paddingRight: 4,
          backgroundColor: color.pop, borderWidth: 1, borderColor: color.line, overflow: 'hidden',
          ...(place.pill ? { borderRadius: 20 } : null),
          shadowColor: '#000', shadowOpacity: color.lift, shadowRadius: 35, shadowOffset: { width: 0, height: 24 }, elevation: 16,
        }}>
        {/* Only a toast that names a thread stays on one line; a plain one wraps (`.toast-plain`). */}
        <T numberOfLines={toast.goes ? 1 : undefined} style={{ ...(place.pill ? { flexShrink: 1 } : { flex: 1, minWidth: 0 }), fontSize: 13.5, lineHeight: 17.55, marginRight: 8 }}>{toast.line}</T>
        {toast.undo && (
          <Pressable accessibilityRole="button" onPress={() => { const undo = toast.undo!; dismiss(); void undo(); }}
            style={({ pressed }) => ({ height: 40, paddingHorizontal: 8, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <T style={{ fontSize: 13.5, lineHeight: 17.55, color: color.accent }}>Undo</T>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismiss} hitSlop={6}
          style={({ pressed }) => ({ width: 36, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Cross />
        </Pressable>
        {toast.goes && !place.pill && <Clock />}
      </Pressable>
    </Animated.View>
  );
}

export function Toast() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const toast = c.toast;
  const dismiss = c.dismissToast;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, toastLife(toast));
    return () => clearTimeout(timer);
    // By its key alone: the cloud redraws every few seconds, and a timer started over each time would never end.
  }, [toast?.key]);
  if (!toast) return null;
  const place = toastPlace(!!threadOnScreen(segments, params));
  const at = place.edge === 'top'
    ? { top: inset.top + size.topBar + 8 }
    : { bottom: inset.bottom + place.lift };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, ...at }}>
      <Card key={toast.key} toast={toast} dismiss={dismiss} place={place} />
    </View>
  );
}
