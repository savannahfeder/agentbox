// The logo with its orange dot running round the ring, for a screen that is
// waiting on something (w-eb1e55360c). The website's boot screen draws the
// same thing (renderer/src/components/LogoOrbit.tsx); the order and the timing
// are one rule in renderer/src/logo-orbit.ts. Each dot is the logo's grey under
// an orange dot whose opacity a native clock moves, so it keeps running while
// the JavaScript thread is busy loading.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ORBIT_CORNER, ORBIT_CYCLE_MS, ORBIT_GREY, ORBIT_ORANGE, orbitLap } from '../../../renderer/src/logo-orbit';
import { size } from './theme';

// The app icon's proportions at 90px: 24px dots, 9px gaps.
const DOT = 24;
const GAP = 9;
const MARK = DOT * 3 + GAP * 2;

export function LogoOrbit() {
  const clock = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (live) setStill(on); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => { live = false; sub.remove(); };
  }, []);
  useEffect(() => {
    if (still) return undefined;
    // On a phone the clock runs natively. In the browser preview a loop asked
    // for the native driver never moves, measured frozen there, so it runs in JS.
    const loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration: ORBIT_CYCLE_MS, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [still, clock]);
  const ranges = useMemo(() => Array.from({ length: 9 }, (_, cell) => orbitLap(cell)), []);
  return (
    <View style={{ width: MARK, height: MARK, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
      {ranges.map((range, cell) => {
        // Asking for less motion stops it on the logo as the home screen has it.
        const opacity = still || !range ? (cell === ORBIT_CORNER && still ? 1 : 0) : clock.interpolate(range);
        return (
          <View key={cell} style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: ORBIT_GREY }}>
            <Animated.View style={{ position: 'absolute', top: 0, left: 0, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: ORBIT_ORANGE, opacity }} />
          </View>
        );
      })}
    </View>
  );
}

/**
 * The logo, waiting. On its own it fills the screen and sits in the middle. In
 * a list (`list`) it is placed so it lands on the very same spot of the screen,
 * under the top bar, so opening and then loading reads as one wait, not two.
 */
export function Waiting({ list }: { list?: boolean }) {
  const { height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  if (!list) {
    return <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><LogoOrbit /></View>;
  }
  const top = Math.max(24, height / 2 - inset.top - size.topBar - MARK / 2);
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ paddingTop: top, alignItems: 'center' }}><LogoOrbit /></View>;
}
