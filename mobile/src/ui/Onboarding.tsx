// The first run's pieces, in the desktop's current language
// (renderer/src/styles.css): a small corner on what you press, the larger
// artifact corner on cards, the accent button from its sign-in page
// (team/sign-in.css `.si-primary`), and small capitals for labels.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { AppMark } from './icons';
import { T, Wall } from './parts';
import { color, font } from './theme';

export const PAD = 24;
/** The desktop's two corners, at the phone's sizes. */
export const CORNER = { small: 8, card: 14 };

export function Screen({ children, foot, top = 72 }: { children: ReactNode; foot?: ReactNode; top?: number }) {
  const inset = useSafeAreaInsets();
  return (
    <Wall>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: inset.top + top, paddingHorizontal: PAD, paddingBottom: 24 }}>
        {children}
      </ScrollView>
      {foot && <View style={{ paddingHorizontal: PAD, paddingBottom: Math.max(16, inset.bottom) + 8, gap: 10 }}>{foot}</View>}
    </Wall>
  );
}

export const Logo = ({ size = 36 }: { size?: number }) => <View accessible accessibilityLabel="Agentbox"><AppMark size={size} /></View>;

export function Head({ children, style }: { children: ReactNode; style?: object }) {
  return <T accessibilityRole="header" style={[{ fontFamily: font.medium, fontSize: 30, lineHeight: 35, letterSpacing: -0.8 }, style]}>{children}</T>;
}

export const Lede = ({ children, style }: { children: ReactNode; style?: object }) => (
  <T style={[{ fontSize: 16, lineHeight: 23, color: color.dim, marginTop: 10 }, style]}>{children}</T>
);

/** Small capitals, as the desktop's tabs and column heads are set. */
export const Label = ({ children, style }: { children: ReactNode; style?: object }) => (
  <T style={[{ fontFamily: font.mono, fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase', color: color.faint }, style]}>{children}</T>
);

type Kind = 'primary' | 'secondary' | 'quiet';
export function Btn({ label, onPress, kind = 'secondary', lead, disabled }: { label: string; onPress?: () => void; kind?: Kind; lead?: ReactNode; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({
        height: 50, borderRadius: CORNER.small, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        borderWidth: kind === 'secondary' ? 1 : 0, borderColor: color.lineStrong,
        backgroundColor: kind === 'primary' ? color.accent : kind === 'secondary' ? (pressed ? color.picked : color.film) : pressed ? color.fill : 'transparent',
        opacity: disabled ? 0.5 : pressed && kind === 'primary' ? 0.88 : 1,
      })}>
      {lead}
      <T style={{ fontSize: 16, fontFamily: kind === 'quiet' ? font.regular : font.medium, color: kind === 'primary' ? '#1a1817' : kind === 'quiet' ? color.dim : color.text }}>{label}</T>
    </Pressable>
  );
}

/** A card with the artifact corner, as the desktop's Settings groups and its main panel are drawn. */
export const Card = ({ children, style }: { children: ReactNode; style?: object }) => (
  <View style={[{ borderRadius: CORNER.card, borderWidth: 1, borderColor: color.line, backgroundColor: color.fill, overflow: 'hidden' }, style]}>{children}</View>
);

/** A row inside a card, with the hairline between rows. */
export function CardRow({ children, first, onPress, style }: { children: ReactNode; first?: boolean; onPress?: () => void; style?: object }) {
  const body = <View style={[{ paddingVertical: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }, style]}>{children}</View>;
  return (
    <View>
      {!first && <View style={{ height: 1, marginLeft: 16, backgroundColor: color.rowLine }} />}
      {onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: pressed ? color.picked : 'transparent' })}>{body}</Pressable> : body}
    </View>
  );
}

/** A small orange square and words in small capitals: something is under way. */
export function Live({ children, done }: { children: string; done?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: done ? color.dim : color.accent }} />
      <Label style={{ color: done ? color.dim : color.faint }}>{children}</Label>
    </View>
  );
}

/**
 * The computer and the phone, joined. `waiting` draws the line dashed with the
 * accent dot on it; `connected` draws it whole; `computer` lights the computer
 * alone, for the step that happens there.
 */
export function Devices({ state, height = 150 }: { state: 'waiting' | 'connected' | 'computer'; height?: number }) {
  const ink = color.text;
  const faint = color.lineStrong;
  const phoneOn = state !== 'computer';
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={300} height={150} viewBox="0 0 300 150">
        {/* The computer: a screen on a base. */}
        <Rect x={14} y={22} width={150} height={96} rx={10} fill={color.film} stroke={state === 'computer' ? ink : faint} strokeOpacity={state === 'computer' ? 0.55 : 1} strokeWidth={1.5} />
        <Rect x={2} y={122} width={174} height={8} rx={4} fill={color.film} stroke={faint} strokeWidth={1.5} />
        {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (
          <Circle key={`m${r}${c}`} cx={77 + c * 12} cy={58 + r * 12} r={4} fill={r === 0 && c === 2 ? color.accent : ink} fillOpacity={r === 0 && c === 2 ? 1 : 0.38} />
        )))}
        {/* The line between them. */}
        <Line x1={176} y1={78} x2={222} y2={78} stroke={state === 'connected' ? color.dim : faint} strokeWidth={1.5} strokeDasharray={state === 'connected' ? undefined : '3 5'} />
        {state === 'waiting' && <Circle cx={199} cy={78} r={4} fill={color.accent} />}
        {/* The phone. */}
        <Rect x={226} y={30} width={60} height={108} rx={12} fill={color.film} stroke={phoneOn ? ink : faint} strokeOpacity={phoneOn ? 0.55 : 1} strokeWidth={1.5} />
        <Rect x={246} y={36} width={20} height={4} rx={2} fill={faint} />
        {phoneOn && [0, 1, 2].map((i) => <Rect key={`r${i}`} x={236} y={54 + i * 18} width={i === 1 ? 28 : 40} height={5} rx={2.5} fill={ink} fillOpacity={0.3} />)}
        {phoneOn && <Circle cx={236 + 2} cy={56} r={2.5} fill={color.accent} />}
      </Svg>
    </View>
  );
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <Card>
      {items.map((s, i) => (
        <CardRow key={i} first={i === 0}>
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: color.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
            <T style={{ fontSize: 12.5, fontFamily: font.medium, color: color.dim }}>{i + 1}</T>
          </View>
          <T style={{ flex: 1, fontSize: 15.5, lineHeight: 22, color: color.text }}>{s}</T>
        </CardRow>
      ))}
    </Card>
  );
}

/** A round tick, filled once done. */
export function Tick({ on }: { on: boolean }) {
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 1.5, borderColor: color.lineStrong, backgroundColor: on ? color.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on && <View style={{ width: 5, height: 10, marginTop: -2, borderColor: color.bg, borderRightWidth: 2, borderBottomWidth: 2, transform: [{ rotate: '45deg' }] }} />}
    </View>
  );
}
