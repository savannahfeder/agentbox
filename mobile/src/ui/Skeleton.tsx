// A page's outline, breathing, while a document or a design is on its way:
// the web app's PreviewLoading (workspace-navigation.css `.preview-skeleton`).
// The phone drew nothing there, a blank card or a blank screen until the file
// came. From the phone app (2026-10-29): "The loading screen from the web
// version is nice; we should get inspired by it."
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { color } from './theme';

// `color-mix(var(--text) 7%, transparent)`, in whichever look is worn.
const INK = 0.07;

export function Skeleton({ small = false }: { small?: boolean }) {
  const breath = useRef(new Animated.Value(0.65)).current;
  useEffect(() => {
    if (small) return;
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (still) return;
      const half = { duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true };
      loop = Animated.loop(Animated.sequence([Animated.timing(breath, { toValue: 1, ...half }), Animated.timing(breath, { toValue: 0.65, ...half })]));
      loop.start();
    }).catch(() => {});
    return () => loop?.stop();
  }, [breath, small]);
  const bar = (width: `${number}%`, height: number, gap: number, extra?: object) => (
    <View style={{ width, height, marginBottom: gap, backgroundColor: color.text, opacity: INK, borderRadius: 3, ...extra }} />
  );
  const k = small ? 1 / 3 : 1;
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ flex: 1, padding: small ? 12 : 24, opacity: small ? 0.65 : breath, backgroundColor: color.sunk }}>
      {bar('48%', Math.max(6, 20 * k), small ? 9 : 24)}
      {bar('90%', Math.max(3, 9 * k), small ? 5 : 12)}
      {bar('64%', Math.max(3, 9 * k), small ? 5 : 12)}
      {bar('100%', small ? 22 : 140, small ? 8 : 28, { marginTop: small ? 8 : 16, opacity: INK * 0.55 })}
      {bar('90%', Math.max(3, 9 * k), small ? 5 : 12)}
      {bar('64%', Math.max(3, 9 * k), small ? 5 : 12)}
    </Animated.View>
  );
}
