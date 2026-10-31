// The pieces every screen is made of, sized from the phone site as it draws
// (renderer/src/phone.css and the styles under it).
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type TextProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useCloud } from '../state/cloud';
import { color, font, size } from './theme';

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
export function TopBar({ left, title, right, below }: { left?: ReactNode; title?: ReactNode; right?: ReactNode; below?: ReactNode }) {
  const inset = useSafeAreaInsets();
  const { view, minimizedApproval, setMinimizedApproval } = useCloud();
  const aside = view.approvals.findIndex((a: { id: string }) => a.id === minimizedApproval) === 0;
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
            style={({ pressed }) => ({ height: 30, paddingHorizontal: 10, marginRight: 6, justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : color.fill })}>
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
      style={({ pressed }) => ({ height: 28, paddingHorizontal: 11, justifyContent: 'center', borderWidth: 1, borderColor: color.line, backgroundColor: pressed ? color.picked : color.fill, opacity: disabled ? 0.5 : 1 })}>
      <T style={{ fontSize: 13, color: color.dim }}>{title}</T>
    </Pressable>
  );
}

/** Every picker is a sheet from the bottom, a row per choice in words (phone.css `.tc-menu`). */
export function Sheet({ open, close, onGone, children }: { open: boolean; close: () => void; /** iOS: the sheet has finished leaving. */ onGone?: () => void; children: ReactNode }) {
  const inset = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close} onDismiss={onGone}>
      <Pressable style={{ flex: 1, backgroundColor: color.scrim }} onPress={close} accessibilityLabel="Close" />
      <View style={{ maxHeight: height * 0.72, backgroundColor: color.pop, borderTopWidth: 1, borderTopColor: color.lineStrong }}>
        <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 8, paddingBottom: 16 + inset.bottom, gap: 1 }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}
export const SheetHead = ({ children }: { children: string }) => (
  <T style={{ fontFamily: font.mono, fontSize: 12, letterSpacing: 0.96, textTransform: 'uppercase', color: color.faint, paddingTop: 6, paddingHorizontal: 14, paddingBottom: 8 }}>{children}</T>
);
export const SheetSep = () => <View style={{ height: 1, backgroundColor: color.line, marginVertical: 4, marginHorizontal: 6 }} />;
export function SheetRow({ label, on, aside, lead, onPress }: { label: string; on?: boolean; aside?: string; lead?: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: on || pressed ? color.picked : 'transparent' })}>
      {lead}
      <T style={{ flex: 1, fontSize: 16, color: on ? color.text : color.dim, fontFamily: on ? font.semibold : font.regular }}>{label}</T>
      {aside ? <T style={{ fontSize: 12, color: color.faint, paddingLeft: 18 }}>{aside}</T> : null}
    </Pressable>
  );
}

/** A priority as the desktop draws it (`.prio-bars`): three bars, four for Urgent. */
export function PriorityBars({ level }: { level: 1 | 2 | 3 | 4 }) {
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

/** A word that opens a picker, dotted under, as the desktop's sentence words are. */
export function Pickable({ children, onPress, style }: { children: ReactNode; onPress: () => void; style?: object }) {
  return (
    <T onPress={onPress} suppressHighlighting
      style={[{ textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }, style]}>{children}</T>
  );
}
