// The first run's pieces, in the desktop first run's language
// (renderer/src/components/first-run.css): the logo, one large headline, the
// bordered button, and a status square in small capitals at the foot.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppMark } from './icons';
import { T, Wall } from './parts';
import { color, font } from './theme';

export const PAD = 28;

export function Screen({ children, foot, top = 96, center = false }: { children: ReactNode; foot?: ReactNode; top?: number; center?: boolean }) {
  const inset = useSafeAreaInsets();
  return (
    <Wall>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: inset.top + top, paddingHorizontal: PAD, paddingBottom: 24, justifyContent: center ? 'center' : 'flex-start' }}>
        {children}
      </ScrollView>
      {foot && <View style={{ paddingHorizontal: PAD, paddingBottom: Math.max(16, inset.bottom) + 8, gap: 10 }}>{foot}</View>}
    </Wall>
  );
}

export const Logo = ({ size = 44 }: { size?: number }) => <View accessible accessibilityLabel="Agentbox"><AppMark size={size} /></View>;

export function Head({ children, big = false, style }: { children: ReactNode; big?: boolean; style?: object }) {
  return <T accessibilityRole="header" style={[{ fontFamily: font.medium, fontSize: big ? 32 : 26, lineHeight: big ? 37 : 31, letterSpacing: big ? -0.9 : -0.6 }, style]}>{children}</T>;
}

export const Lede = ({ children, style }: { children: ReactNode; style?: object }) => (
  <T style={[{ fontSize: 15.5, lineHeight: 23, color: color.dim, marginTop: 12 }, style]}>{children}</T>
);

/** The desktop first run's button (`.ob-btn`): the theme's film under a strong line. `quiet` drops both. */
export function Btn({ label, onPress, quiet = false, lead, disabled }: { label: string; onPress?: () => void; quiet?: boolean; lead?: ReactNode; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({
        height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        borderWidth: 1, borderColor: quiet ? 'transparent' : color.lineStrong,
        backgroundColor: pressed ? color.picked : quiet ? 'transparent' : color.film, opacity: disabled ? 0.5 : 1,
      })}>
      {lead}
      <T style={{ fontSize: 16, fontFamily: quiet ? font.regular : font.medium, color: quiet ? color.faint : color.text }}>{label}</T>
    </Pressable>
  );
}

/** A square and words in small capitals (`.ob-check`): live is the orange square, done is filled, waiting is open. */
export function Status({ children, state = 'live' }: { children: string; state?: 'live' | 'done' | 'off' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 7, height: 7, backgroundColor: state === 'live' ? color.accent : state === 'done' ? color.dim : 'transparent', borderWidth: state === 'off' ? 1 : 0, borderColor: color.faint }} />
      <T style={{ fontFamily: font.mono, fontSize: 11.5, letterSpacing: 1.3, textTransform: 'uppercase', color: color.faint }}>{children}</T>
    </View>
  );
}

export function Steps({ items, style }: { items: ReactNode[]; style?: object }) {
  return (
    <View style={[{ gap: 12 }, style]}>
      {items.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
          <T style={{ width: 14, fontSize: 15.5, lineHeight: 23, color: color.faint }}>{i + 1}.</T>
          <T style={{ flex: 1, fontSize: 15.5, lineHeight: 23, color: color.dim }}>{s}</T>
        </View>
      ))}
    </View>
  );
}

export const Strong = ({ children }: { children: ReactNode }) => <T style={{ fontSize: 15.5, lineHeight: 23, color: color.text }}>{children}</T>;

/** A square tick box (`.ob-tick`). */
export function TickBox({ on }: { on: boolean }) {
  return (
    <View style={{ width: 18, height: 18, borderWidth: 1, borderColor: on ? color.faint : color.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
      {on && <View style={{ width: 5, height: 10, marginTop: -3, borderColor: color.text, borderRightWidth: 1.5, borderBottomWidth: 1.5, transform: [{ rotate: '45deg' }] }} />}
    </View>
  );
}
