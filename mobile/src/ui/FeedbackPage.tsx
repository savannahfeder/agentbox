// Send feedback, as the desktop's card asks for it (components/FeedbackCard.tsx):
// what happened and what you expected, with pictures if they help. It goes to
// the same inbox the Mac's card and the web app's go to.
import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { checkFeedback } from '../../../shared/feedback.mts';
import type { Picked } from '../platform/pick';
import { reportText, type ReportAbout } from '../lib/report';
import { useCloud } from '../state/cloud';
import { AttachSheet, Attached } from './Attach';
import { Clip } from './icons';
import { T } from './parts';
import { color, corner, font } from './theme';

const TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', mov: 'video/quicktime', mp4: 'video/mp4', pdf: 'application/pdf' };
const asFile = (f: Picked) => ({ name: f.name, type: TYPE[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream', data: f.dataBase64, size: Math.floor((f.dataBase64.length * 3) / 4) });

export function FeedbackPage({ about = null }: { about?: ReportAbout } = {}) {
  const c = useCloud();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const ready = (!!text.trim() || files.length > 0) && !busy;
  const send = async () => {
    const list = files.map(asFile);
    const check = checkFeedback({ text, files: list });
    if (!check.ok) { setSaid(check.reason ?? null); return; }
    setBusy(true); setSaid(null);
    const out = await c.sendFeedback(reportText(about, text), list.map(({ name, type, data }) => ({ name, type, data })))
      .catch(() => ({ ok: false, error: 'It did not send. Try again in a moment.' }));
    setBusy(false);
    if (out.ok) { setSent(true); setText(''); setFiles([]); } else setSaid((out as { error?: string }).error ?? 'It did not send. Try again in a moment.');
  };
  if (sent) {
    return (
      <View style={{ paddingHorizontal: 4, paddingTop: 8, gap: 18 }}>
        <T style={{ fontSize: 15, lineHeight: 22 }}>Sent. Thank you.</T>
        <Pressable onPress={() => setSent(false)} accessibilityRole="button"><T style={{ fontSize: 14, color: color.dim, textDecorationLine: 'underline' }}>Send more</T></Pressable>
      </View>
    );
  }
  return (
    <View style={{ marginTop: 14, borderWidth: 1, borderRadius: corner.small, borderColor: color.lineStrong, backgroundColor: color.fill }}>
      <TextInput multiline autoFocus value={text} onChangeText={(t) => { setText(t); setSaid(null); }} accessibilityLabel="Your feedback"
        placeholder={about ? 'What is wrong with what the agent wrote?' : 'What happened, and what did you expect?'} placeholderTextColor={color.faint}
        style={[{ minHeight: 160, padding: 16, fontFamily: font.regular, fontSize: 15.5, lineHeight: 24, color: color.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
      {(files.length > 0 || said) && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
          <Attached files={files} drop={(i) => setFiles((f) => f.filter((_, n) => n !== i))} />
          {said && <T style={{ fontSize: 13, color: color.dim }} accessibilityRole="alert">{said}</T>}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: color.line, paddingVertical: 9, paddingLeft: 12, paddingRight: 14 }}>
        <Pressable onPress={() => setAttaching(true)} accessibilityRole="button" accessibilityLabel="Attach a file or picture"
          style={{ flex: 1, height: 36, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Clip />
          <T style={{ fontSize: 14, color: color.dim }}>Attach</T>
        </Pressable>
        <Pressable disabled={!ready} onPress={() => void send()} accessibilityRole="button"
          style={({ pressed }) => ({ height: 29, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderRadius: corner.small, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : 'transparent', opacity: ready ? 1 : 0.5 })}>
          <T style={{ fontSize: 13, fontFamily: font.semibold }}>{busy ? 'Sending…' : 'Send'}</T>
        </Pressable>
      </View>
      <AttachSheet open={attaching} close={() => setAttaching(false)} add={(more) => setFiles((f) => [...f, ...more])} fail={setSaid} />
    </View>
  );
}
