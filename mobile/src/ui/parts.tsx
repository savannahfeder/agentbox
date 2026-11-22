// The pieces every screen is made of, sized from the phone site as it draws
// (renderer/src/phone.css and the styles under it).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type TextProps, type ViewStyle } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { feel } from '../lib/feel';
import { sheetLetGo, sheetPull } from '../lib/sheet-drag';
import { useCloud } from '../state/cloud';
import { color, corner, font, size } from './theme';

/** Ember Grid's wall, the dot grid and the orange glow, under everything, the status bar included. */
export function Wall({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ flex: 1, backgroundColor: color.bg }, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <Pattern id="d" width={32} height={32} patternUnits="userSpaceOnUse"><Circle cx={16} cy={16} r={1.15} fill="white" fillOpacity={0.055} /></Pattern>
          <RadialGradient id="g" cx="0.72" cy="0.28" r="0.7"><Stop offset="0" stopColor={color.accent} stopOpacity={0.075} /><Stop offset="1" stopColor={color.accent} stopOpacity={0} /></RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#g)" />
        <Rect width="100%" height="100%" fill="url(#d)" />
      </Svg>
      {children}
    </View>
  );
}

// The room under a bottom bar: the whole home bar, as iOS's own tab bars keep it.
export const footRoom = (inset: { bottom: number }) => Math.max(8, inset.bottom);

export function T({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[{ fontFamily: font.regular, color: color.text, fontSize: 15.5 }, style]} />;
}

/** The top bar: 56px over the wall with its line, the title on the left. What
 * goes `below` (the inbox's tabs) sits inside it, over the same one line. */
export function TopBar({ left, title, right, below, noReview = false }: { left?: ReactNode; title?: ReactNode; right?: ReactNode; below?: ReactNode; noReview?: boolean }) {
  const inset = useSafeAreaInsets();
  const { view, minimizedApproval, setMinimizedApproval } = useCloud();
  // A thread's bar has no room for it; the inbox's bar still brings the card back.
  const aside = !noReview && view.approvals.findIndex((a: { id: string }) => a.id === minimizedApproval) === 0;
  return (
    <View style={{ paddingTop: inset.top, borderBottomWidth: 1, borderBottomColor: color.line }}>
      {/* The line is inside the 56px, as the website's border-box bar has it. */}
      <View style={{ height: size.topBar - 1, flexDirection: 'row', alignItems: 'center', paddingLeft: left ? 8 : size.inset, paddingRight: 4 }}>
        {left}
        <View style={{ flex: 1, minWidth: 0 }}>
          {typeof title === 'string' ? <T numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 19, lineHeight: 23, letterSpacing: -0.19 }}>{title}</T> : title}
        </View>
        {aside && (
          <Pressable onPress={() => setMinimizedApproval(null)} accessibilityRole="button" accessibilityLabel="Review permission" hitSlop={4}
            style={({ pressed }) => ({ height: 30, paddingHorizontal: 10, marginRight: 6, justifyContent: 'center', borderWidth: 1, borderRadius: corner.small, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : color.fill })}>
            <T style={{ fontSize: 13, color: color.text }}>{`Review (${view.approvals.length})`}</T>
          </Pressable>
        )}
        {right}
      </View>
      {below}
    </View>
  );
}

export function IconButton({ onPress, label, children, width = 40 }: { onPress: () => void; label: string; children: ReactNode; width?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button" hitSlop={4}
      style={({ pressed }) => ({ width, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

/** The desktop's small outlined button (`.set-ghost`). */
export function Ghost({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({ height: 28, paddingHorizontal: 11, justifyContent: 'center', borderWidth: 1, borderRadius: corner.small, borderColor: color.line, backgroundColor: pressed ? color.picked : color.fill, opacity: disabled ? 0.5 : 1 })}>
      <T style={{ fontSize: 13, color: color.dim }}>{title}</T>
    </Pressable>
  );
}

/** Every picker is a sheet from the bottom, a row per choice in words (phone.css `.tc-menu`). */
export function Sheet({ open, close, onGone, children }: { open: boolean; close: () => void; /** iOS: the sheet has finished leaving. */ onGone?: () => void; children: ReactNode }) {
  const [shown, setShown] = useState(open);
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) {
      setShown(true);
      Animated.spring(slide, { toValue: 1, damping: 28, stiffness: 320, mass: 1, useNativeDriver: true }).start();
    } else if (shown) {
      Animated.timing(slide, { toValue: 0, duration: 190, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setShown(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const body = <SheetBody close={close} slide={slide}>{children}</SheetBody>;
  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={close} onDismiss={onGone} statusBarTranslucent>
      {/* Android draws a modal as its own window under the navigation bar; the app's insets are not that window's. */}
      {Platform.OS === 'android' ? <SafeAreaProvider>{body}</SafeAreaProvider> : body}
    </Modal>
  );
}
function SheetBody({ close, slide, children }: { close: () => void; slide: Animated.Value; children: ReactNode }) {
  const inset = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const room = height * 0.72;
  const drag = useRef(new Animated.Value(0)).current;
  const tall = useRef(room);
  const atTop = useRef(true);
  const [box, setBox] = useState(0);
  const [inner, setInner] = useState(0);
  const over = inner > box + 1;
  const pan = useMemo(() => {
    const claims = (dy: number, dx: number) => atTop.current && dy > 6 && dy > Math.abs(dx) * 1.2;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => claims(g.dy, g.dx),
      onMoveShouldSetPanResponder: (_, g) => claims(g.dy, g.dx),
      onPanResponderMove: (_, g) => drag.setValue(sheetPull(g.dy)),
      onPanResponderRelease: (_, g) => {
        if (sheetLetGo(g.dy, g.vy, tall.current) === 'away') {
          feel.tap();
          close();
          Animated.timing(drag, { toValue: 0, duration: 0, delay: 220, useNativeDriver: true }).start();
        } else Animated.spring(drag, { toValue: 0, damping: 24, stiffness: 340, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    });
  }, [close, drag]);
  const rise = slide.interpolate({ inputRange: [0, 1], outputRange: [room + 40, 0] });
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim, opacity: slide }]}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <View style={{ flex: 1 }} pointerEvents="none" />
      <Animated.View {...pan.panHandlers} onLayout={(e) => { tall.current = e.nativeEvent.layout.height; }}
        style={{ maxHeight: height * 0.72, backgroundColor: color.pop, borderTopWidth: 1, borderTopColor: color.lineStrong, borderTopLeftRadius: corner.card, borderTopRightRadius: corner.card, overflow: 'hidden', transform: [{ translateY: Animated.add(rise, drag) }] }}>
        <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: color.lineStrong }} />
        </View>
        <ScrollView style={{ flexGrow: 0 }} scrollEnabled={over} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 8, paddingBottom: 16 + inset.bottom, gap: 1 }}
          onLayout={(e) => setBox(e.nativeEvent.layout.height)} onContentSizeChange={(_, h) => setInner(h)}
          scrollEventThrottle={16} onScroll={(e) => { atTop.current = e.nativeEvent.contentOffset.y <= 0; }}>
          {children}
        </ScrollView>
      </Animated.View>
    </>
  );
}
export const SheetHead = ({ children }: { children: string }) => (
  <T style={{ fontFamily: font.mono, fontSize: 12, letterSpacing: 0.96, textTransform: 'uppercase', color: color.faint, paddingTop: 6, paddingHorizontal: 14, paddingBottom: 8 }}>{children}</T>
);
export const SheetSep = () => <View style={{ height: 1, backgroundColor: color.line, marginVertical: 4, marginHorizontal: 6 }} />;
export function SheetRow({ label, on, aside, lead, onPress }: { label: string; on?: boolean; aside?: string; lead?: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={() => { feel.pick(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={({ pressed }) => ({ minHeight: 48, borderRadius: corner.card, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: on || pressed ? color.picked : 'transparent' })}>
      {lead}
      <T style={{ flex: 1, fontSize: 16, color: on ? color.text : color.dim, fontFamily: on ? font.semibold : font.regular }}>{label}</T>
      {aside ? <T style={{ fontSize: 12, color: color.faint, paddingLeft: 18 }}>{aside}</T> : null}
    </Pressable>
  );
}

/** A press that sinks a little under the finger and springs back. */
export function Squish({ onPress, style, children, accessibilityLabel }: { onPress: () => void; style: ViewStyle; children: ReactNode; accessibilityLabel: string }) {
  const sink = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(sink, { toValue: v, damping: 15, stiffness: 400, useNativeDriver: true }).start();
  return (
    <Animated.View style={[style, { transform: [{ scale: sink }] }]}>
      <Pressable onPress={() => { feel.tap(); onPress(); }} onPressIn={() => to(0.92)} onPressOut={() => to(1)} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** A priority as the desktop draws it (`.prio-bars`): three bars, four for Urgent. */
/** `level` 0 is Agent decides: three bars, none filled (components/Priority.tsx `PriorityIcon`). */
export function PriorityBars({ level }: { level: 0 | 1 | 2 | 3 | 4 }) {
  const heights = level === 4 ? [4, 7, 10, 13] : [4, 7.5, 11];
  const inked = (i: number) => (level >= 3 ? color.text : i < level ? color.dim : color.lineStrong);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1.5, height: level === 4 ? 13 : 11 }}>
      {heights.map((h, i) => <View key={i} style={{ width: 3, height: h, borderRadius: 1, backgroundColor: inked(i) }} />)}
    </View>
  );
}

function useBreath() {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.45, duration: 800, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

/** An agent on it now: the half-filled ring on a Mac, the cloud in the cloud (threads/Pages.tsx `RunningMark`). */
export function RunningMark({ cloud, children }: { cloud?: boolean; children?: ReactNode }) {
  const breath = useBreath();
  return (
    <Animated.View style={{ opacity: breath }}>
      {cloud ? children : (
        <Svg width={12} height={12} viewBox="0 0 12 12">
          <Circle cx={6} cy={6} r={5.25} stroke={color.accent} strokeWidth={1.5} fill="none" />
          <Path d="M6 0.75 A5.25 5.25 0 0 1 6 11.25 Z" fill={color.accent} />
        </Svg>
      )}
    </Animated.View>
  );
}

/** The dotted word as a view of its own: Android folds a press nested in a Text into the one text, out of a screen reader's and a tap's reach. */
export function ChoiceButton({ children, said, onPress, style }: { children: string; said: string; onPress: () => void; style?: object }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={said} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
      <T style={[{ textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }, style]}>{children}</T>
    </Pressable>
  );
}

/** A word that opens a picker, dotted under, as the desktop's sentence words are. */
export function Pickable({ children, onPress, style }: { children: ReactNode; onPress: () => void; style?: object }) {
  return (
    <T onPress={onPress} suppressHighlighting role="button"
      style={[{ textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }, style]}>{children}</T>
  );
}
