// Later on a thread, as the phone site's (components/Snooze.tsx): a time
// typed in words, the presets, and "Now (back to inbox)" first on a thread
// already put off. And the box a time is typed into, which Send later on a new
// thread uses too.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { laterRows, typedLater, typedLine, type LaterRow } from '../lib/later';
import { Sheet, SheetHead, SheetRow, T } from './parts';
import { color, font } from './theme';

/** A sheet whose typing box stays above the keyboard. */
export function TypingSheet({ open, close, children }: { open: boolean; close: () => void; children: React.ReactNode }) {
  return (
    <Sheet open={open} close={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: 1 }}>{children}</KeyboardAvoidingView>
    </Sheet>
  );
}

/**
 * The box: what she types, and beside it when that is, or that it is not a
 * time. A moment it read can be pressed as well as sent from the keyboard.
 */
export function TimeBox({ value, onChange, placeholder, onSubmit, line, onLine, lead }: {
  value: string; onChange: (text: string) => void; placeholder: string; onSubmit: () => void;
  line: { text: string; tone: 'ok' | 'unread' | 'refused' } | null; onLine?: () => void; lead?: React.ReactNode;
}) {
  const ok = line?.tone === 'ok';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 52 }}>
      {lead}
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={color.faint}
        returnKeyType="done" onSubmitEditing={onSubmit} autoCorrect={false} autoCapitalize="none" accessibilityLabel="A time, in words"
        style={[{ flex: 1, height: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: color.line, backgroundColor: color.field, fontFamily: font.regular, fontSize: 15, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
      {line && (
        <Pressable disabled={!ok || !onLine} onPress={onLine} accessibilityRole={ok ? 'button' : 'text'} hitSlop={8}
          style={ok ? { height: 32, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong } : undefined}>
          <T style={{ fontFamily: font.mono, fontSize: 12, color: line.tone === 'unread' ? color.faint : ok ? color.text : color.dim, fontStyle: line.tone === 'ok' ? 'normal' : 'italic' }}>{line.text}</T>
        </Pressable>
      )}
    </View>
  );
}

export function LaterSheet({ visible, onClose, onPick, onNow, subtitle }: {
  visible: boolean; onClose: () => void; onPick: (until: number) => void;
  /** Given when the thread is already in Later: "Now (back to inbox)" brings it back. */
  onNow?: () => void;
  subtitle?: string;
}) {
  const [text, setText] = useState('');
  const [refused, setRefused] = useState(false);
  const now = Date.now();
  const typed = typedLater(text, now);
  const close = () => { setText(''); setRefused(false); onClose(); };
  const choose = (row: LaterRow) => { close(); if (row.now) onNow?.(); else onPick(row.ts); };
  // Typed words always decide; words it cannot read are refused, never a preset (format.ts `enterMeans`).
  const submit = () => {
    if (!text.trim()) return;
    if (typed) { close(); onPick(typed.ts); } else setRefused(true);
  };
  return (
    <TypingSheet open={visible} close={close}>
      <SheetHead>Later</SheetHead>
      {!!subtitle && <T numberOfLines={1} style={{ fontSize: 13, color: color.faint, paddingHorizontal: 14, marginTop: -4, paddingBottom: 6 }}>{subtitle}</T>}
      <TimeBox value={text} onChange={(t) => { setText(t); setRefused(false); }} placeholder="Try: 30m, 3h, 8am, tomorrow, next week"
        onSubmit={submit} line={typedLine(text, typed, refused)} onLine={submit} />
      {laterRows(now, { back: !!onNow }).map((row) => <SheetRow key={row.label} label={row.label} aside={row.hint} onPress={() => choose(row)} />)}
    </TypingSheet>
  );
}
