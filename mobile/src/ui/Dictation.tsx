// Talking into a message (lib/dictation.ts): the microphone, and while it
// listens, Stop to keep the words in the box and Send to send them.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking, Pressable, View } from 'react-native';
import { dictation, IDLE, type Listening as Heard } from '../lib/dictation';
import { previewSpeech } from '../lib/preview-speech';
import { phoneSpeech } from '../platform/speech';
import { Mic } from './icons';
import { T } from './parts';
import { color, font } from './theme';

const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';

export type Talk = Heard & {
  on: boolean;
  /** Read now, not as of the last render. */
  active: () => boolean;
  start: () => void;
  stop: () => void;
  send: () => void;
  leave: () => void;
};

/** Dictation into `box`; `send` runs once the last words are in it. */
export function useDictation(box: { text: string; setText: (text: string) => void }, send: () => void): Talk {
  const latest = useRef(box);
  latest.current = box;
  const [now, setNow] = useState<Heard>(IDLE);
  const [ctl] = useState(() => dictation({
    speech: PREVIEW ? previewSpeech() : phoneSpeech,
    box: { read: () => latest.current.text, write: (text) => latest.current.setText(text) },
    changed: setNow,
  }));
  // The send waits a render, so it reads the box with the last words in it.
  const [sending, setSending] = useState(false);
  const sendLatest = useRef(send);
  sendLatest.current = send;
  useEffect(() => { if (sending) { setSending(false); sendLatest.current(); } }, [sending]);

  useFocusEffect(useCallback(() => () => ctl.leave(), [ctl]));
  useEffect(() => {
    // Only the background: a permission question makes the app inactive too.
    const sub = AppState.addEventListener('change', (state) => { if (state === 'background') ctl.leave(); });
    return () => { sub.remove(); ctl.leave(); };
  }, [ctl]);

  return {
    ...now,
    on: now.phase !== 'idle',
    active: () => ctl.now.phase !== 'idle',
    start: () => { Keyboard.dismiss(); void ctl.start(); },
    stop: ctl.stop,
    send: () => { void ctl.finish().then(() => setSending(true)); },
    leave: ctl.leave,
  };
}

export function MicButton({ talk }: { talk: Talk }) {
  return (
    <Pressable onPress={talk.start} accessibilityLabel="Dictate" accessibilityRole="button" hitSlop={4}
      style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Mic />
    </Pressable>
  );
}

/** Four bars that follow the voice. */
function Level({ level, tall = 14 }: { level: number; tall?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5, height: tall }}>
      {[0.55, 1, 0.75, 0.4].map((k, i) => (
        <View key={i} style={{ width: 2, height: Math.max(3, Math.round(tall * Math.min(1, 0.2 + level * k))), backgroundColor: color.dim }} />
      ))}
    </View>
  );
}

function Button({ label, a11y, onPress, strong, disabled }: { label: string; a11y: string; onPress: () => void; strong?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => ({
        height: 29, paddingHorizontal: strong ? 16 : 12, justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong,
        backgroundColor: pressed ? color.picked : 'transparent', opacity: disabled ? 0.5 : 1,
      })}>
      <T style={{ fontSize: 13, fontFamily: strong ? font.semibold : font.medium, color: strong ? color.text : color.dim }}>{label}</T>
    </Pressable>
  );
}

/** What takes the place of a box's foot while it listens. `lead` lines its dot up with the words above it. */
export function Listening({ talk, lead = 0 }: { talk: Talk; lead?: number }) {
  const finishing = talk.phase === 'finishing';
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 36 }}>
      <View style={{ marginLeft: lead, width: 7, height: 7, borderRadius: 4, backgroundColor: color.accent }} />
      <Level level={talk.level} />
      <T style={{ flex: 1, fontSize: 13, color: color.dim }}>{talk.phase === 'listening' ? 'Listening' : finishing ? 'Finishing' : 'Starting'}</T>
      <Button label="Stop" a11y="Stop dictating" onPress={talk.stop} disabled={finishing} />
      <Button label="Send" a11y="Send what you said" onPress={talk.send} strong disabled={finishing} />
    </View>
  );
}

/** Why it stopped, and the way to Settings when the microphone was refused. */
export function DictationProblem({ talk }: { talk: Talk }) {
  if (talk.on || !talk.problem) return null;
  return (
    <T style={{ fontSize: 13, color: color.dim }}>
      {talk.problem}
      {talk.settings && <T onPress={() => void Linking.openSettings()} suppressHighlighting accessibilityRole="button" style={{ fontSize: 13, color: color.dim, textDecorationLine: 'underline' }}>{' Open Settings'}</T>}
    </T>
  );
}
