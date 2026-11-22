// The pieces every screen is made of, sized from the phone site as it draws
// (renderer/src/phone.css and the styles under it).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type PanResponderGestureState, type TextProps, type ViewStyle } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { feel } from '../lib/feel';
import { sheetLetGo, sheetPull } from '../lib/sheet-drag';
import { useCloud } from '../state/cloud';
import { Tick } from './icons';
import { color, corner, font, lift, size } from './theme';

/** The page behind every screen, the status bar included. */
export function Wall({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flex: 1, backgroundColor: color.bg }, style]}>{children}</View>;
}

// The room under a bottom bar: the whole home bar, as iOS's own tab bars keep it.
export const footRoom = (inset: { bottom: number }) => Math.max(8, inset.bottom);

export function T({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[{ fontFamily: font.regular, color: color.text, fontSize: 15.5 }, style]} />;
}

/** The top bar: no line, a screen's name in the serif, or a smaller sans name
 * beside the way back. What goes `below` (the inbox's tabs) sits inside it. */
export function TopBar({ left, title, right, below, noReview = false }: { left?: ReactNode; title?: ReactNode; right?: ReactNode; below?: ReactNode; noReview?: boolean }) {
  const inset = useSafeAreaInsets();
  const { view, minimizedApproval, setMinimizedApproval } = useCloud();
  // A thread's bar has no room for it; the inbox's bar still brings the card back.
  const aside = !noReview && view.approvals.findIndex((a: { id: string }) => a.id === minimizedApproval) === 0;
  const name = left ? { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, paddingLeft: 8 } : { fontFamily: font.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 };
  return (
    <View style={{ paddingTop: inset.top }}>
      <View style={{ height: size.topBar, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: left ? 12 : size.inset, paddingRight: 14 }}>
        {left}
        <View style={{ flex: 1, minWidth: 0 }}>
          {typeof title === 'string' ? <T numberOfLines={1} style={name}>{title}</T> : title}
        </View>
        {aside && (
          <Pressable onPress={() => setMinimizedApproval(null)} accessibilityRole="button" accessibilityLabel="Review permission" hitSlop={4}
            style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: corner.pill, backgroundColor: pressed ? color.text : color.graphite })}>
            <T style={{ fontSize: 13.5, fontFamily: font.medium, color: color.ink }}>{`Review (${view.approvals.length})`}</T>
          </Pressable>
        )}
        {right}
      </View>
      {below}
    </View>
  );
}

/** A glyph on a soft round key; `bare` leaves the key off, for a glyph inside a field. */
export function IconButton({ onPress, label, children, bare = false }: { onPress: () => void; label: string; children: ReactNode; bare?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button" hitSlop={6} style={{ height: 40, justifyContent: 'center' }}>
      {({ pressed }) => (
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: bare ? 'transparent' : pressed ? color.picked : color.fill, opacity: bare && pressed ? 0.5 : 1 }}>
          {children}
        </View>
      )}
    </Pressable>
  );
}

/** A small quiet button. */
export function Ghost({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, justifyContent: 'center', borderRadius: corner.pill, backgroundColor: pressed ? color.picked : color.fill, opacity: disabled ? 0.5 : 1 })}>
      <T style={{ fontSize: 13.5, fontFamily: font.medium, color: color.text }}>{title}</T>
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
  const follow = useMemo(() => ({
    onPanResponderMove: (_: unknown, g: PanResponderGestureState) => drag.setValue(sheetPull(g.dy)),
    onPanResponderRelease: (_: unknown, g: PanResponderGestureState) => {
      if (sheetLetGo(g.dy, g.vy, tall.current) === 'away') {
        feel.tap();
        close();
        Animated.timing(drag, { toValue: 0, duration: 0, delay: 220, useNativeDriver: true }).start();
      } else Animated.spring(drag, { toValue: 0, damping: 24, stiffness: 340, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
  }), [close, drag]);
  const pan = useMemo(() => {
    const claims = (dy: number, dx: number) => atTop.current && dy > 6 && dy > Math.abs(dx) * 1.2;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => claims(g.dy, g.dx),
      onMoveShouldSetPanResponder: (_, g) => claims(g.dy, g.dx),
      ...follow,
    });
  }, [follow]);
  const grip = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true, ...follow }), [follow]);
  const rise = slide.interpolate({ inputRange: [0, 1], outputRange: [room + 40, 0] });
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim, opacity: slide }]}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={{ flex: 1 }}>
        <View style={{ flex: 1 }} pointerEvents="none" />
        {/* The shadow is on the outer box: a box that clips its corners clips its own shadow. */}
        <Animated.View {...pan.panHandlers} onLayout={(e) => { tall.current = e.nativeEvent.layout.height; }}
          style={{ maxHeight: room, flexShrink: 1, marginHorizontal: 8, marginBottom: 8, backgroundColor: color.pop, borderRadius: corner.sheet, ...lift('float'), transform: [{ translateY: Animated.add(rise, drag) }] }}>
          <View style={{ flexShrink: 1, borderRadius: corner.sheet, overflow: 'hidden' }}>
            <View {...grip.panHandlers} style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: color.lineStrong }} />
            </View>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} scrollEnabled={over} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 10, paddingBottom: Math.max(14, inset.bottom - 8), gap: 2 }}
              onLayout={(e) => setBox(e.nativeEvent.layout.height)} onContentSizeChange={(_, h) => setInner(h)}
              scrollEventThrottle={16} onScroll={(e) => { atTop.current = e.nativeEvent.contentOffset.y <= 0; }}>
              {children}
            </ScrollView>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}
export const SheetHead = ({ children }: { children: string }) => (
  <T style={{ fontFamily: font.semibold, fontSize: 13, lineHeight: 18, color: color.faint, paddingTop: 6, paddingHorizontal: 14, paddingBottom: 6 }}>{children}</T>
);
export const SheetSep = () => <View style={{ height: 1, backgroundColor: color.line, marginVertical: 6, marginHorizontal: 14 }} />;
export function SheetRow({ label, on, aside, lead, onPress }: { label: string; on?: boolean; aside?: string; lead?: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={() => { feel.pick(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={({ pressed }) => ({ minHeight: 52, borderRadius: corner.small, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? color.picked : 'transparent' })}>
      {lead}
      <T style={{ flexGrow: 1, flexShrink: 1, paddingVertical: 6, fontSize: 16.5, lineHeight: 22, color: color.text, fontFamily: on ? font.medium : font.regular }}>{label}</T>
      {aside ? <T numberOfLines={2} style={{ flexShrink: 1, maxWidth: '55%', textAlign: 'right', fontSize: 14, lineHeight: 19, color: color.faint }}>{aside}</T> : null}
      {on ? <Tick size={18} tint={color.text} /> : null}
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

/** A choice in a box, as a chip: what is picked now, and a press opens the picker. */
export function ChoiceButton({ children, said, onPress, lead }: { children: string; said: string; onPress: () => void; lead?: ReactNode }) {
  return (
    <Pressable onPress={() => { feel.tap(); onPress(); }} accessibilityRole="button" accessibilityLabel={said} hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => ({ height: 32, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: corner.pill, backgroundColor: pressed ? color.picked : color.fill })}>
      {lead}
      <T numberOfLines={1} style={{ fontSize: 13.5, lineHeight: 18, fontFamily: font.medium, color: color.dim }}>{children}</T>
    </Pressable>
  );
}

/** Send: the one filled disc in a box. */
export function SendKey({ onPress, disabled, busy = false, label = 'Send' }: { onPress: () => void; disabled?: boolean; busy?: boolean; label?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={busy ? 'Sending…' : label} hitSlop={6}
      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: color.graphite, opacity: disabled ? 0.3 : pressed ? 0.8 : 1 })}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 19V5M6 11l6-6 6 6" /></Svg>
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
