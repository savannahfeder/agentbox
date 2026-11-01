// Settings' pieces, as the phone layout draws the desktop's (`.set-*` in
// renderer/src/components/settings.css and phone.css): a page's title, plates
// of rows, and at a row's end a switch, a chip that opens a sheet, or a stepper.
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { Reading } from '../lib/settings-view';
import { Back, Caret } from './icons';
import { Sheet, SheetHead, SheetRow, T, Wall } from './parts';
import { color, font, size } from './theme';

export function Page({ title, lede, back = 'Settings', right, head, children }: { title: string; lede?: string; back?: string; /** At the right of the Back row. */ right?: ReactNode; /** Takes the Back row's place (Settings' search field). */ head?: ReactNode; children: ReactNode }) {
  const inset = useSafeAreaInsets();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Wall>
      <View style={{ paddingTop: inset.top }}>
        <View style={{ height: size.topBar, flexDirection: 'row', alignItems: 'center', paddingLeft: head ? 12 : size.inset, paddingRight: head ? 12 : 8 }}>
          {head ?? (
            <>
              <Pressable onPress={leave} accessibilityRole="button" style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }}>
                <Back size={14} />
                <T style={{ fontSize: 13, letterSpacing: 0.52, color: color.dim }}>{back}</T>
              </Pressable>
              <View style={{ flex: 1 }} />
              {right}
            </>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 20, paddingHorizontal: size.inset, paddingBottom: 40 + inset.bottom }}>
        <T style={{ fontSize: 24, lineHeight: 31, letterSpacing: -0.84 }}>{title}</T>
        {lede ? <T style={{ fontSize: 13.5, lineHeight: 20, color: color.faint, marginTop: 8 }}>{lede}</T> : null}
        {children}
      </ScrollView>
    </Wall>
  );
}

export function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 32 }}>
      {label ? <T style={{ fontSize: 14, fontFamily: font.medium, letterSpacing: -0.07, paddingBottom: 12 }}>{label}</T> : null}
      <View style={{ backgroundColor: color.fill, borderWidth: 1, borderColor: color.line, borderRadius: 10, paddingHorizontal: 18 }}>{children}</View>
    </View>
  );
}

/** A row; `reading` adds the line a change from the phone is waiting or was refused on. */
/** `stack` puts a wide control under the words rather than beside them. */
export function Row({ label, desc, control, first = false, reading, badge, stack = false }: { label: string; desc?: string | null; control?: ReactNode; first?: boolean; reading?: Reading; badge?: string; stack?: boolean }) {
  const note = reading?.waiting ? 'Waiting for your computer' : reading?.refused ? `Not changed (${reading.refused})` : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: color.line }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <T style={{ fontSize: 13.5, fontFamily: font.medium, letterSpacing: -0.04 }}>{label}</T>
          {badge ? <T style={{ fontSize: 11, color: color.dim, borderWidth: 1, borderColor: color.line, paddingHorizontal: 6, paddingVertical: 1 }}>{badge}</T> : null}
        </View>
        {desc ? <T style={{ fontSize: 12.5, lineHeight: 18.75, color: color.faint, marginTop: 3 }}>{desc}</T> : null}
        {note ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
            {reading?.waiting ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color.accent }} /> : null}
            <T style={{ fontSize: 12.5, lineHeight: 18.75, color: color.dim }}>{note}</T>
          </View>
        ) : null}
        {stack && control ? <View style={{ flexDirection: 'row', marginTop: 10 }}>{control}</View> : null}
      </View>
      {stack ? null : control}
    </View>
  );
}

/** The desktop's switch (`.set-sw`): a light track with a dark knob when on. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable onPress={() => onChange(!on)} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={8}
      style={{ width: 38, height: 22, borderRadius: 11, borderWidth: 1, borderColor: on ? color.text : color.lineStrong, backgroundColor: on ? color.text : color.picked, justifyContent: 'center' }}>
      <View style={{ width: 16, height: 16, borderRadius: 8, marginLeft: on ? 18 : 2, backgroundColor: on ? color.bg : color.dim }} />
    </Pressable>
  );
}

/** A chip carrying a row's value; pressing it opens the choices. */
export function Chip({ label, now, onPress }: { label: string; now: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${now}`}
      style={({ pressed }) => ({ height: 28, maxWidth: 240, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: pressed ? color.lineStrong : color.line, backgroundColor: color.fill })}>
      <T numberOfLines={1} style={{ fontSize: 13, flexShrink: 1 }}>{now}</T>
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
      style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
      <Sign d={d} tint={off ? color.lineStrong : color.dim} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: color.lineStrong }}>
      {chip(value - 1, 'M2.5 6h7', value <= min, 'fewer')}
      <T style={{ width: 28, textAlign: 'center', fontSize: 13.5, fontFamily: font.medium }}>{value}</T>
      {chip(value + 1, 'M2.5 6h7M6 2.5v7', value >= max, 'more')}
    </View>
  );
}

/** A small outlined button (`.set-ghost`). */
export function Button({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({ height: 28, paddingHorizontal: 11, justifyContent: 'center', borderWidth: 1, borderColor: color.line, backgroundColor: pressed ? color.picked : color.fill, opacity: disabled ? 0.5 : 1 })}>
      <T style={{ fontSize: 13, color: color.dim }}>{title}</T>
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
      style={({ pressed }) => ({ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: first ? 0 : 1, borderTopColor: color.line, opacity: pressed ? 0.6 : 1 })}>
      <T style={{ flex: 1, fontSize: 15, letterSpacing: -0.1 }}>{label}</T>
      {aside ? <T numberOfLines={1} style={{ fontSize: 13, color: color.faint, maxWidth: 170 }}>{aside}</T> : null}
      <Chevron />
    </Pressable>
  );
}

/** A sentence on its own under a page's plates. */
export const Aside = ({ children }: { children: ReactNode }) => (
  <T style={{ fontSize: 12.5, lineHeight: 18.75, color: color.faint, marginTop: 14 }}>{children}</T>
);
