// A new thread, a whole page as the phone layout draws it (phone.css `.tc-card`):
// a cross and the page's name, Send and its Send later caret at the right, a
// row each for where it goes, the model, the project and the priority, the
// message under them, and attaching a file or picture at the foot.
import { Redirect, router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { modelLabelOf } from '../../../renderer/src/models';
import { priorityIdOf, priorityLabelOf, priorityValueOf } from '../../../renderer/src/priority';
import { laterHint, momentFromWords, mondayMorning, projectSwatch, tomorrowMorning } from '../../../renderer/src/threads/composer-rules';
import type { Choices } from '../lib/actions';
import { newThreadChoices, onceAtATime, openingChoices, pickEffort, pickModel, pickProject, projectNow } from '../lib/compose';
import { useDraft } from '../lib/drafts';
import { screenGate } from '../lib/thread-gate';
import { appStore } from '../platform/persist';
import { useCloud } from '../state/cloud';
import { AttachSheet, Attached } from '../ui/Attach';
import { DictationProblem, Listening, MicButton, useDictation } from '../ui/Dictation';
import { Caret, Clip, Clock, Cross } from '../ui/icons';
import { TimeBox, TypingSheet } from '../ui/Later';
import { footRoom, IconButton, Pickable, PriorityBars, Sheet, SheetHead, SheetRow, T, TopBar, Wall } from '../ui/parts';
import { ModelSheet, PrioritySheet, barsFor } from '../ui/Pickers';
import { color, font, size } from '../ui/theme';

const Swatch = ({ slug }: { slug: string }) => <View style={{ width: 9, height: 9, backgroundColor: projectSwatch(slug) }} />;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: size.inset, borderBottomWidth: 1, borderBottomColor: color.line }}>
      <T style={{ width: 84, fontSize: 15, color: color.dim }}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{children}</View>
    </View>
  );
}

export default function NewThread() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const projects = c.view.products;
  // Her words, files and priority outlive the page (lib/drafts.ts); the
  // project, model and level are the ones she last picked (lib/compose.ts).
  const draft = useDraft('new', appStore);
  const [opening] = useState(() => openingChoices(projects, appStore));
  const [picked, setPicked] = useState<string | null>(null);
  const product = projectNow(projects, picked, appStore) ?? '';
  const [model, setModel] = useState(opening.model);
  const [effort, setEffort] = useState<string | null>(opening.effort);
  const [typed, setTyped] = useState('');
  const [sheet, setSheet] = useState<'model' | 'project' | 'priority' | 'attach' | 'later' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectName = useMemo(() => projects.find((p) => p.slug === product)?.name ?? '', [projects, product]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const { text, files } = draft;
  const canSend = (!!text.trim() || files.length > 0) && !!product && !busy;
  const moment = momentFromWords(typed, c.now);
  const foot = footRoom(inset);

  const sendNow = async (later: Choices = {}) => {
    if (!canSend) return;
    setSheet(null); setBusy(true); setError(null);
    pickProject(appStore, product);
    try {
      const saved = await c.attach(product, files);
      await c.send({ kind: 'new', product, text, saved, choices: { ...newThreadChoices({ priority: draft.priority, model, effort }), ...later } }, null);
      // The draft goes only once the thread has: a failed send keeps every word on the page.
      draft.take();
      close();
    } catch (err) { setError(`Not sent: ${String((err as Error)?.message ?? err)}`); } finally { setBusy(false); }
  };
  // Busy is drawn a frame late; two quick presses must still send once.
  const latest = useRef(sendNow);
  latest.current = sendNow;
  const [send] = useState(() => onceAtATime((later?: Choices) => latest.current(later)));
  const talk = useDictation(draft, () => void send());
  const gate = screenGate(c);
  if (gate === 'wait') return <Wall><View /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;

  return (
    <Wall>
      <TopBar
        left={<IconButton label="Close" onPress={close}><Cross /></IconButton>}
        title={<T style={{ fontFamily: font.medium, fontSize: 19, letterSpacing: -0.19, paddingLeft: 4 }}>New thread</T>}
        right={(
          <View style={{ flexDirection: 'row', marginRight: 12, opacity: canSend ? 1 : 0.45 }}>
            <Pressable disabled={!canSend} onPress={() => (talk.on ? talk.send() : void send())} accessibilityRole="button" accessibilityLabel="Send"
              style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: color.accent, opacity: pressed ? 0.85 : 1 })}>
              <T style={{ fontSize: 15, fontFamily: font.medium, color: '#fff' }}>{busy ? 'Sending…' : 'Send'}</T>
            </Pressable>
            <Pressable disabled={!canSend} onPress={() => setSheet('later')} accessibilityRole="button" accessibilityLabel="Send later"
              style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent, borderLeftWidth: 1, borderLeftColor: 'rgba(26, 24, 23, 0.28)', opacity: pressed ? 0.85 : 1 })}>
              <Caret />
            </Pressable>
          </View>
        )}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Field label="To"><T style={{ fontSize: 15 }}>Agent</T></Field>
          <Field label="Model"><Pickable style={{ fontSize: 15 }} onPress={() => setSheet('model')}>{modelLabelOf(model)}</Pickable></Field>
          <Field label="Project">
            <Pressable onPress={() => setSheet('project')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!!product && <Swatch slug={product} />}
              <T style={{ fontSize: 15, marginLeft: 6 }}>{projectName || 'Pick a project'}</T>
            </Pressable>
          </Field>
          <Field label="Priority">
            <Pressable onPress={() => setSheet('priority')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PriorityBars level={barsFor(priorityValueOf(draft.priority ?? 'medium'))} />
              <T style={{ fontSize: 15 }}>{priorityLabelOf(draft.priority ?? 'medium')}</T>
            </Pressable>
          </Field>
          <TextInput multiline autoFocus value={text} onChangeText={draft.setText} placeholder="What do you need done?" placeholderTextColor={color.faint}
            onFocus={() => { if (talk.active()) talk.stop(); }}
            style={[{ flex: 1, minHeight: 160, padding: 16, fontFamily: font.regular, fontSize: 16, lineHeight: 24.8, color: color.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          <View style={{ paddingHorizontal: 16, paddingBottom: files.length || error || draft.dropped ? 14 : 0, gap: 10 }}>
            <Attached files={files} drop={(i) => draft.setFiles((f) => f.filter((_, n) => n !== i))} />
            {draft.dropped > 0 && (
              <T style={{ fontSize: 13, color: color.dim }}>
                {draft.dropped === 1 ? 'One file is too big to keep. Leaving this page loses it.' : `${draft.dropped} files are too big to keep. Leaving this page loses them.`}
              </T>
            )}
            {error && <T style={{ fontSize: 13, color: color.dim }}>{error}</T>}
            <DictationProblem talk={talk} />
          </View>
        </ScrollView>
        <View style={{ height: 52 + foot, paddingBottom: foot, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: color.line }}>
          {talk.on ? (
            <View style={{ flex: 1, flexDirection: 'row', paddingLeft: 16, paddingRight: 12 }}><Listening talk={talk} /></View>
          ) : (
            <>
              <Pressable onPress={() => setSheet('attach')} accessibilityRole="button"
                style={({ pressed }) => ({ flex: 1, height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? color.fill : 'transparent' })}>
                <Clip />
                <T style={{ fontSize: 15, color: color.dim }}>Attach a file or picture</T>
              </Pressable>
              <View style={{ marginRight: 8 }}><MicButton talk={talk} /></View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
      <ModelSheet open={sheet === 'model'} close={() => setSheet(null)} model={model} effort={effort}
        pickModel={(id) => { setModel(id); pickModel(appStore, id); }} pickEffort={(id) => setEffort(pickEffort(appStore, effort, id))} />
      <PrioritySheet open={sheet === 'priority'} close={() => setSheet(null)} value={priorityValueOf(draft.priority ?? 'medium')} pick={(v) => draft.setPriority(priorityIdOf(v))} />
      <AttachSheet open={sheet === 'attach'} close={() => setSheet(null)} add={(more) => draft.setFiles((f) => [...f, ...more])} fail={setError} />
      <Sheet open={sheet === 'project'} close={() => setSheet(null)}>
        <SheetHead>Project</SheetHead>
        {projects.map((p) => <SheetRow key={p.slug} label={p.name} on={p.slug === product} lead={<Swatch slug={p.slug} />} onPress={() => { setPicked(p.slug); pickProject(appStore, p.slug); setSheet(null); }} />)}
      </Sheet>
      {/* Send later, as the desktop's composer offers it (composer-rules.ts). */}
      <TypingSheet open={sheet === 'later'} close={() => setSheet(null)}>
        <SheetHead>Send later</SheetHead>
        <SheetRow label="Add it to Later" lead={<Clock />} onPress={() => void send({ start: 'later' })} />
        <SheetRow label="Tomorrow morning" lead={<Clock />} aside={laterHint(tomorrowMorning(c.now))} onPress={() => void send({ runAt: tomorrowMorning(c.now) })} />
        <SheetRow label="Monday morning" lead={<Clock />} aside={laterHint(mondayMorning(c.now))} onPress={() => void send({ runAt: mondayMorning(c.now) })} />
        <TimeBox lead={<Clock />} value={typed} onChange={setTyped} placeholder="Or type: 3h, fri 6pm, tomorrow 9am"
          onSubmit={() => { if (moment) void send({ runAt: moment.ts }); }} onLine={() => { if (moment) void send({ runAt: moment.ts }); }}
          line={!typed.trim() ? null : moment ? { text: moment.hint, tone: 'ok' } : { text: 'Not a time yet', tone: 'unread' }} />
      </TypingSheet>
    </Wall>
  );
}
