import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { feel } from '../lib/feel';
import { rowSwipe, rowSwipeClaims, SWIPE_COMMIT } from '../lib/row-swipe';
import { Clock, DoneMark } from './icons';
import { T } from './parts';
import { color, font } from './theme';

/** A row that swipes left to close and right to Later, as a phone's mail rows do. */
export function Swiped({ off, onClose, onLater, children }: { off?: boolean; onClose: () => void; onLater: () => void; children: ReactNode }) {
  const x = useRef(new Animated.Value(0)).current;
  const [wide, setWide] = useState(400);
  const past = useRef(false);
  const from = useRef(0);
  const gone = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (gone.current) clearTimeout(gone.current); }, []);
  const act = useRef({ onClose, onLater });
  act.current = { onClose, onLater };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !off && rowSwipeClaims(g.dx, g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (_, g) => { past.current = false; from.current = g.x0; },
    onPanResponderMove: (e) => {
      const dx = e.nativeEvent.pageX - from.current;
      x.setValue(dx);
      const over = Math.abs(dx) > SWIPE_COMMIT;
      if (over !== past.current) { past.current = over; feel.tap(); }
    },
    onPanResponderRelease: (e, g) => {
      const did = rowSwipe(e.nativeEvent.pageX - from.current, g.vx);
      if (did === 'close') {
        feel.thud();
        Animated.timing(x, { toValue: -wide, duration: 180, useNativeDriver: true }).start(() => {
          act.current.onClose();
          gone.current = setTimeout(() => x.setValue(0), 1500);
        });
        return;
      }
      if (did === 'later') act.current.onLater();
      Animated.spring(x, { toValue: 0, damping: 22, stiffness: 260, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
  }), [off, wide, x]);
  const grow = (sign: 1 | -1) => x.interpolate({
    inputRange: sign > 0 ? [0, SWIPE_COMMIT, SWIPE_COMMIT + 1] : [-SWIPE_COMMIT - 1, -SWIPE_COMMIT, 0],
    outputRange: sign > 0 ? [0.7, 1, 1.15] : [1.15, 1, 0.7],
    extrapolate: 'clamp',
  });
  const words = { fontSize: 13, fontFamily: font.medium };
  return (
    <View onLayout={(e) => setWide(e.nativeEvent.layout.width)} style={{ overflow: 'hidden' }}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: -wide, width: wide, backgroundColor: color.graphite, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', transform: [{ translateX: x.interpolate({ inputRange: [0, wide], outputRange: [0, wide], extrapolate: 'clamp' }) }] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: SWIPE_COMMIT, paddingLeft: 20 }}>
          <Animated.View style={{ transform: [{ scale: grow(1) }] }}><Clock size={18} tint={color.ink} /></Animated.View>
          <T style={{ ...words, color: color.ink }}>Later</T>
        </View>
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: wide, width: wide, backgroundColor: color.accent, flexDirection: 'row', alignItems: 'center', transform: [{ translateX: x.interpolate({ inputRange: [-wide, 0], outputRange: [-wide, 0], extrapolate: 'clamp' }) }] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: SWIPE_COMMIT, paddingRight: 16 }}>
          <T style={{ ...words, color: '#fff' }}>Close</T>
          <Animated.View style={{ transform: [{ scale: grow(-1) }] }}><DoneMark size={20} tint="#fff" /></Animated.View>
        </View>
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}
