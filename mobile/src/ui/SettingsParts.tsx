// Settings' pieces, as the phone layout draws the desktop's (`.set-*` in
// renderer/src/components/settings.css and phone.css): a page's title, plates
// of rows, and at a row's end a switch, a chip that opens a sheet, or a stepper.
import { router } from '../lib/router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { Reading } from '../lib/settings-view';
import { useCloud } from '../state/cloud';
import { Back, Caret } from './icons';
import { Caps, IconButton, Sheet, SheetHead, SheetRow, T, Wall } from './parts';
import { color, corner, font, lift, size } from './theme';

export function Page({ title, lede, back = 'Settings', right, head, children }: { title: string; lede?: string; back?: string; /** At the right of the Back row. */ right?: ReactNode; /** Takes the Back row's place (Settings' search field). */ head?: ReactNode; children: ReactNode }) {
  const inset = useSafeAreaInsets();
  const { approvalRoom } = useCloud();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Wall>
      <View style={{ paddingTop: inset.top }}>
        <View style={{ height: size.topBar, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: head ? 12 : 14 }}>
          {head ?? (
            <>
              <IconButton label={back} onPress={leave}><Back size={16} /></IconButton>
              <View style={{ flex: 1 }} />
              {right}
            </>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: Math.max(40 + inset.bottom, approvalRoom + 16) }}>
        <T style={{ fontFamily: font.medium, fontSize: 30, lineHeight: 36, letterSpacing: -1.2, paddingHorizontal: 4 }}>{title}</T>
        {lede ? <T style={{ fontSize: 15, lineHeight: 21, color: color.faint, marginTop: 6, paddingHorizontal: 4 }}>{lede}</T> : null}
        {children}
      </ScrollView>
    </Wall>
  );
}

/** `note` is the line under the heading (settings.css `.acct-place-line`). */
export function Group({ label, note, children }: { label?: string; note?: string | null; children: ReactNode }) {
  return (
    <View style={{ marginTop: 28 }}>
      {label ? <Caps style={{ paddingHorizontal: 4, paddingBottom: 8 }}>{label}</Caps> : null}
      {note ? <T style={{ marginTop: -2, paddingHorizontal: 4, paddingBottom: 10, fontSize: 13.5, lineHeight: 19, color: color.dim }}>{note}</T> : null}
      <View style={{ backgroundColor: color.card, borderRadius: corner.card, paddingHorizontal: 16 }}>{children}</View>
    </View>
  );
}

/** A row; `reading` adds the line a change from the phone is waiting or was refused on. */
/** `stack` puts a wide control under the words rather than beside them; `below` is drawn under the words either way. */
export function Row({ label, desc, control, first = false, reading, badge, stack = false, below }: { label: string; desc?: string | null; control?: ReactNode; first?: boolean; reading?: Reading; badge?: string; stack?: boolean; below?: ReactNode }) {
  const note = reading?.waiting ? 'Waiting for your computer' : reading?.refused ? `Not changed (${reading.refused})` : null;
  return (
    <View style={{ paddingVertical: 15, borderTopWidth: first ? 0 : 1, borderTopColor: color.rowLine }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <T style={{ flexShrink: 1, fontSize: 16, lineHeight: 22 }}>{label}</T>
            {badge ? <View style={{ borderRadius: corner.pill, backgroundColor: color.picked, paddingHorizontal: 8, paddingVertical: 2 }}><T style={{ fontSize: 12, fontFamily: font.medium, color: color.dim }}>{badge}</T></View> : null}
          </View>
          {desc ? <T style={{ fontSize: 13.5, lineHeight: 19, color: color.faint, marginTop: 3 }}>{desc}</T> : null}
          {note ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
              {reading?.waiting ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color.accent }} /> : null}
              <T style={{ fontSize: 13.5, lineHeight: 19, color: color.dim }}>{note}</T>
            </View>
          ) : null}
          {stack && control ? <View style={{ flexDirection: 'row', marginTop: 10 }}>{control}</View> : null}
        </View>
        {stack ? null : control}
      </View>
      {/* Full width, under the control too, so a meter beside a button keeps its bar. */}
      {below}
    </View>
  );
}

/** The desktop's switch (`.set-sw`): a light track with a dark knob when on. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable onPress={() => onChange(!on)} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={8}
      style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: on ? color.graphite : color.lineStrong, justifyContent: 'center' }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, marginLeft: on ? 22 : 2, backgroundColor: on ? color.ink : color.card, ...lift('card') }} />
    </Pressable>
  );
}

/** A chip carrying a row's value; pressing it opens the choices. */
export function Chip({ label, now, onPress }: { label: string; now: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${now}`}
      style={({ pressed }) => ({ height: 34, maxWidth: 220, paddingLeft: 13, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: corner.pill, backgroundColor: pressed ? color.picked : color.fill })}>
      <T numberOfLines={1} style={{ fontSize: 14.5, fontFamily: font.medium, color: color.dim, flexShrink: 1 }}>{now}</T>
      <Caret size={11} tint={color.faint} />
    </Pressable>
  );
}

/** The chip at a row's end that carries its value and opens the choices as a sheet. */
export function Choice<V extends string | number | null>({ label, value, options, onChange }: {
  label: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const now = options.find((o) => o.value === value)?.label ?? String(value ?? '');
  return (
    <>
      <Chip label={label} now={now} onPress={() => setOpen(true)} />
      <Sheet open={open} close={() => setOpen(false)}>
        <SheetHead>{label}</SheetHead>
        {options.map((o) => <SheetRow key={String(o.value)} label={o.label} on={o.value === value} onPress={() => { setOpen(false); if (o.value !== value) onChange(o.value); }} />)}
      </Sheet>
    </>
  );
}

const Sign = ({ d, tint }: { d: string; tint: string }) => (
  <Svg width={12} height={12} viewBox="0 0 12 12"><Path d={d} fill="none" stroke={tint} strokeWidth={1.3} strokeLinecap="round" /></Svg>
);

/** Two chips and the number between them (`.set-step`). */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const chip = (to: number, d: string, off: boolean, what: string) => (
    <Pressable onPress={() => onChange(to)} disabled={off} accessibilityRole="button" accessibilityLabel={`${label}, ${what}`} hitSlop={6}
      style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
      <Sign d={d} tint={off ? color.lineStrong : color.dim} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: corner.pill, backgroundColor: color.fill }}>
      {chip(value - 1, 'M2.5 6h7', value <= min, 'fewer')}
      <T style={{ width: 28, textAlign: 'center', fontSize: 15, fontFamily: font.medium }}>{value}</T>
      {chip(value + 1, 'M2.5 6h7M6 2.5v7', value >= max, 'more')}
    </View>
  );
}

/** An account's usage, the desktop's `MiniMeters`: each window's word, bar, percent and when it starts over. */
export function Meters({ meters }: { meters: { key: string; word: string; percent: number | null; resets: string | null }[] }) {
  if (!meters.length) return null;
  return (
    <View style={{ gap: 7, marginTop: 9 }}>
      {meters.map((m) => {
        const full = (m.percent ?? 0) >= 100;
        return (
          <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <T numberOfLines={1} style={{ width: 54, fontSize: 12, color: color.dim }}>{m.word}</T>
            <View style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: color.line }}>
              <View style={{ height: 6, borderRadius: 3, width: `${Math.min(100, m.percent ?? 0)}%`, backgroundColor: full ? color.accent : color.dim }} />
            </View>
            <T style={{ width: 34, textAlign: 'right', fontSize: 12, fontFamily: font.medium, color: full ? color.text : color.dim }}>{m.percent == null ? '–' : `${m.percent}%`}</T>
            <T numberOfLines={1} style={{ width: 78, fontSize: 12, color: color.faint }}>{m.resets ?? ''}</T>
          </View>
        );
      })}
    </View>
  );
}

/** A small quiet button. */
export function Button({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, justifyContent: 'center', borderRadius: corner.pill, backgroundColor: pressed ? color.lineStrong : color.picked, opacity: disabled ? 0.5 : 1 })}>
      <T style={{ fontSize: 14, fontFamily: font.medium, color: color.text }}>{title}</T>
    </Pressable>
  );
}

const Chevron = () => (
  <Svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={color.faint} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M6 3.5L10.5 8 6 12.5" /></Svg>
);

/** A row that opens a page. */
export function NavRow({ label, aside, onPress, first = false }: { label: string; aside?: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: first ? 0 : 1, borderTopColor: color.rowLine, opacity: pressed ? 0.55 : 1 })}>
      <T style={{ flex: 1, fontSize: 16, lineHeight: 22 }}>{label}</T>
      {aside ? <T numberOfLines={1} style={{ fontSize: 15, color: color.faint, maxWidth: 170 }}>{aside}</T> : null}
      <Chevron />
    </Pressable>
  );
}

/** A sentence on its own under a page's plates. */
export const Aside = ({ children }: { children: ReactNode }) => (
  <T style={{ fontSize: 13.5, lineHeight: 19, color: color.faint, marginTop: 14, paddingHorizontal: 4 }}>{children}</T>
);
