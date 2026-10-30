// The New thread form, as the phone layout draws it (phone.css `.tc-card`): a
// row each for where it goes, the model, the project and the priority, the
// message under them, and attaching a file or picture at the foot. The New
// thread page wears it whole; the empty inbox draws it open on the page, as
// the web app does (Pages.tsx `InboxClear`).
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { readRule, repeatPresets } from '../../../renderer/src/format';
import { engineModelLabel } from '../../../renderer/src/models';
import { ruleLabel } from '../../../shared/repeats.mjs';
import { readSettingsRows } from '../../../renderer/src/phone-rows';
import { priorityIdOf, priorityLabelOf, priorityValueOf } from '../../../renderer/src/priority';
import { agentChoices, agentWordFor, laterHint, momentFromWords, mondayMorning, projectSwatch, tomorrowMorning, type Harness } from '../../../renderer/src/threads/composer-rules';
import { computerAgents } from '../../../renderer/src/web-settings';
import type { Choices } from '../lib/actions';
import { newThreadChoices, onceAtATime, openingChoices, openingEngine, openingFor, pickEffort, pickEngine, pickModel, pickProject, projectNow } from '../lib/compose';
import { useDraft } from '../lib/drafts';
import { computerOf } from '../lib/settings-view';
import { appStore } from '../platform/persist';
import { useCloud } from '../state/cloud';
import { AttachSheet, Attached } from './Attach';
import { DictationProblem, Listening, MicButton, useDictation } from './Dictation';
import { Caret, Clip, Clock, Repeat } from './icons';
import { TimeBox, TypingSheet } from './Later';
import { Pickable, PriorityBars, Sheet, SheetHead, SheetRow, SheetSep, T } from './parts';
import { ModelSheet, PrioritySheet, barsFor } from './Pickers';
import { color, font, size } from './theme';

const Swatch = ({ slug }: { slug: string }) => <View style={{ width: 9, height: 9, backgroundColor: projectSwatch(slug) }} />;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: size.inset, borderBottomWidth: 1, borderBottomColor: color.line }}>
      <T style={{ width: 84, fontSize: 15, color: color.dim }}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{children}</View>
    </View>
  );
}

/** Everything the form holds, and its send; `sent` runs once a thread has gone. */
export function useNewThread(sent: () => void) {
  const c = useCloud();
  const projects = c.view.products;
  // Her words, files and priority outlive the page (lib/drafts.ts); the
  // project, model and level are the ones she last picked (lib/compose.ts).
  const draft = useDraft('new', appStore);
  const [opening] = useState(() => openingChoices(projects, appStore));
  const [picked, setPicked] = useState<string | null>(null);
  const product = projectNow(projects, picked, appStore) ?? '';
  // WHICH CODING AGENTS THE COMPUTER OFFERS, off its settings copy
  // (w-24119e8784): To read "Agent" and every thread went to Claude Code,
  // whatever the computer had. Claude Code alone until the copy is read.
  const [agents, setAgents] = useState(() => computerAgents(null));
  useEffect(() => {
    const cloud = c.cloud;
    if (!cloud?.signedIn()) return;
    let gone = false;
    readSettingsRows((t, q) => cloud.select(t, q))
      .then((rows) => { if (!gone) setAgents(computerAgents(computerOf(rows))); })
      .catch(() => { /* Claude Code alone, as before */ });
    return () => { gone = true; };
  }, [c.cloud]);
  const codex = { codexModels: agents.codexModels, codexDefault: agents.codexDefault };
  const offered = agentChoices(agents.engines);
  const [pickedEngine, setPickedEngine] = useState<Harness | null>(null);
  const engine: Harness = offered.some((e) => e.id === pickedEngine) ? (pickedEngine as Harness) : openingEngine(appStore, agents.engines);
  // Each agent's model and level kept apart, as the site's card keeps them.
  const [chosen, setChosen] = useState<Partial<Record<Harness, { model: string; effort: string | null }>>>(() => ({ claude: { model: opening.model, effort: opening.effort } }));
  const { model, effort } = chosen[engine] ?? openingFor(appStore, engine, agents.codexDefault);
  const choose = (next: Partial<{ model: string; effort: string | null }>) => setChosen((was) => ({ ...was, [engine]: { model, effort, ...next } }));
  const [sheet, setSheet] = useState<'to' | 'model' | 'project' | 'priority' | 'attach' | 'later' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectName = useMemo(() => projects.find((p) => p.slug === product)?.name ?? '', [projects, product]);
  const canSend = (!!draft.text.trim() || draft.files.length > 0) && !!product && !busy;

  const sendNow = async (later: Choices = {}) => {
    if (!canSend) return;
    setSheet(null); setBusy(true); setError(null);
    pickProject(appStore, product);
    try {
      const saved = await c.attach(product, draft.files);
      const harness = newThreadChoices({ priority: draft.priority, engine, model, effort, engineCount: agents.engines.length, ...codex });
      await c.send({ kind: 'new', product, text: draft.text, saved, choices: { ...harness, ...later } }, null);
      // The draft goes only once the thread has: a failed send keeps every word on the page.
      draft.take();
      sent();
    } catch (err) { setError(`Not sent: ${String((err as Error)?.message ?? err)}`); } finally { setBusy(false); }
  };
  // Busy is drawn a frame late; two quick presses must still send once.
  const latest = useRef(sendNow);
  latest.current = sendNow;
  const [send] = useState(() => onceAtATime((later?: Choices) => latest.current(later)));
  const talk = useDictation(draft, () => void send());
  return {
    draft, product, projectName, projects, model, effort, sheet, setSheet, busy, error, setError, canSend, send, talk,
    agents, offered, engine, codex,
    pickProject: (slug: string) => { setPicked(slug); pickProject(appStore, slug); },
    pickEngine: (id: Harness) => { setPickedEngine(id); pickEngine(appStore, id); },
    pickModel: (id: string) => { choose({ model: id }); pickModel(appStore, id, engine, agents.codexDefault); },
    pickEffort: (id: string) => choose({ effort: pickEffort(appStore, effort, id, engine) }),
  };
}
export type NewThread = ReturnType<typeof useNewThread>;

/** Send and its Send later caret. */
export function SendButtons({ form }: { form: NewThread }) {
  const { canSend, talk, send, busy, setSheet } = form;
  return (
    <View style={{ flexDirection: 'row', opacity: canSend ? 1 : 0.45 }}>
      <Pressable disabled={!canSend} onPress={() => (talk.on ? talk.send() : void send())} accessibilityRole="button" accessibilityLabel="Send"
        style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: color.accent, opacity: pressed ? 0.85 : 1 })}>
        <T style={{ fontSize: 15, fontFamily: font.medium, color: '#fff' }}>{busy ? 'Sending…' : 'Send'}</T>
      </Pressable>
      <Pressable disabled={!canSend} onPress={() => setSheet('later')} accessibilityRole="button" accessibilityLabel="Send later"
        style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent, borderLeftWidth: 1, borderLeftColor: 'rgba(26, 24, 23, 0.28)', opacity: pressed ? 0.85 : 1 })}>
        <Caret />
      </Pressable>
    </View>
  );
}

/** The four rows and the message. `inline` is the empty inbox's: a shorter box that does not take the keyboard on its own. */
export function NewThreadFields({ form, inline = false, onFocus, onBlur }: { form: NewThread; inline?: boolean; onFocus?: () => void; onBlur?: () => void }) {
  const { draft, talk, product, projectName, model, setSheet, error, agents, offered, engine, codex } = form;
  return (
    <>
      <Field label="To">
        {offered.length > 1
          ? <Pickable style={{ fontSize: 15 }} onPress={() => setSheet('to')}>{agentWordFor(agents.engines, engine)}</Pickable>
          : <T style={{ fontSize: 15 }}>Agent</T>}
      </Field>
      <Field label="Model"><Pickable style={{ fontSize: 15 }} onPress={() => setSheet('model')}>{engineModelLabel(engine, model, codex)}</Pickable></Field>
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
      {/* Typing stops dictation with the words kept; tapping the box does not (web-speech.ts). */}
      <TextInput multiline autoFocus={!inline} value={draft.text} placeholder="What do you need done?" placeholderTextColor={color.faint}
        onChangeText={(t) => { if (talk.active()) talk.leave(); draft.setText(t); }} onFocus={onFocus} onBlur={onBlur}
        style={[{ flex: inline ? undefined : 1, minHeight: inline ? 120 : 160, padding: 16, fontFamily: font.regular, fontSize: 16, lineHeight: 24.8, color: color.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
      <View style={{ paddingHorizontal: 16, paddingBottom: draft.files.length || error || draft.dropped ? 14 : 0, gap: 10 }}>
        <Attached files={draft.files} drop={(i) => draft.setFiles((f) => f.filter((_, n) => n !== i))} />
        {draft.dropped > 0 && (
          <T style={{ fontSize: 13, color: color.dim }}>
            {draft.dropped === 1 ? 'One file is too big to keep. Leaving this page loses it.' : `${draft.dropped} files are too big to keep. Leaving this page loses them.`}
          </T>
        )}
        {error && <T style={{ fontSize: 13, color: color.dim }}>{error}</T>}
        <DictationProblem talk={talk} />
      </View>
    </>
  );
}

/** Attach a file or picture, the microphone, and on the inbox Send itself. */
export function NewThreadFoot({ form, foot = 0, send }: { form: NewThread; foot?: number; send?: ReactNode }) {
  const { talk, setSheet } = form;
  return (
    <View style={{ height: 52 + foot, paddingBottom: foot, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: color.line }}>
      {talk.on ? (
        <View style={{ flex: 1, flexDirection: 'row', paddingLeft: 16, paddingRight: 12 }}><Listening talk={talk} /></View>
      ) : (
        <>
          <Pressable onPress={() => setSheet('attach')} accessibilityRole="button" accessibilityLabel="Attach a file or picture"
            style={({ pressed }) => ({ flex: 1, height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? color.fill : 'transparent' })}>
            <Clip />
            <T style={{ fontSize: 15, color: color.dim }}>{send ? 'Attach' : 'Attach a file or picture'}</T>
          </Pressable>
          <View style={{ marginRight: send ? 4 : 8 }}><MicButton talk={talk} /></View>
          {send && <View style={{ marginRight: 12 }}>{send}</View>}
        </>
      )}
    </View>
  );
}

/** The pickers the form opens. */
export function NewThreadSheets({ form, now }: { form: NewThread; now: number }) {
  const { draft, sheet, setSheet, model, effort, projects, product, send, setError, offered, engine, codex } = form;
  const [typed, setTyped] = useState('');
  const moment = momentFromWords(typed, now);
  // The rule's grammar reads first, as the desktop's When box does: "every friday 5pm" also holds a time.
  const read = readRule(typed);
  const rule = read && 'rule' in read ? read.rule : null;
  const typedSend = () => { if (rule) void send({ repeat: rule }); else if (moment) void send({ runAt: moment.ts }); };
  return (
    <>
      <Sheet open={sheet === 'to'} close={() => setSheet(null)}>
        <SheetHead>To</SheetHead>
        {offered.map((a) => <SheetRow key={a.id} label={a.label} on={a.id === engine} onPress={() => { form.pickEngine(a.id); setSheet(null); }} />)}
      </Sheet>
      <ModelSheet open={sheet === 'model'} close={() => setSheet(null)} model={model} effort={effort} engine={engine} codex={codex}
        pickModel={form.pickModel} pickEffort={form.pickEffort} />
      <PrioritySheet open={sheet === 'priority'} close={() => setSheet(null)} value={priorityValueOf(draft.priority ?? 'medium')} pick={(v) => draft.setPriority(priorityIdOf(v))} />
      <AttachSheet open={sheet === 'attach'} close={() => setSheet(null)} add={(more) => draft.setFiles((f) => [...f, ...more])} fail={setError} />
      <Sheet open={sheet === 'project'} close={() => setSheet(null)}>
        <SheetHead>Project</SheetHead>
        {projects.map((p) => <SheetRow key={p.slug} label={p.name} on={p.slug === product} lead={<Swatch slug={p.slug} />} onPress={() => { form.pickProject(p.slug); setSheet(null); }} />)}
      </Sheet>
      {/* Send later, as the desktop's composer offers it (composer-rules.ts). */}
      <TypingSheet open={sheet === 'later'} close={() => setSheet(null)}>
        <SheetHead>Send later</SheetHead>
        <SheetRow label="Add it to Later" lead={<Clock />} onPress={() => void send({ start: 'later' })} />
        <SheetRow label="Tomorrow morning" lead={<Clock />} aside={laterHint(tomorrowMorning(now))} onPress={() => void send({ runAt: tomorrowMorning(now) })} />
        <SheetRow label="Monday morning" lead={<Clock />} aside={laterHint(mondayMorning(now))} onPress={() => void send({ runAt: mondayMorning(now) })} />
        {/* Repeat it, the desktop's own presets (format.ts `repeatPresets`): a rule whose runs are the threads. */}
        <SheetSep />
        {repeatPresets(now).flatMap((r) => (r.rule ? [r.rule] : []).map((rule) => (
          <SheetRow key={r.label} label={r.label} lead={<Repeat size={15} />} onPress={() => void send({ repeat: rule })} />
        )))}
        <TimeBox lead={<Clock />} value={typed} onChange={setTyped} placeholder="Or type: 3h, fri 6pm, every monday 9am"
          onSubmit={typedSend} onLine={typedSend}
          line={!typed.trim() ? null : rule ? { text: `Repeats ${ruleLabel(rule)}`, tone: 'ok' } : moment ? { text: moment.hint, tone: 'ok' } : { text: 'Not a time yet', tone: 'unread' }} />
      </TypingSheet>
    </>
  );
}

/**
 * The empty inbox's form. A thread arriving while you type takes the inbox's
 * place; your words go on to the New thread page, as the web app moves them
 * into its dialog.
 */
export function InboxComposer() {
  const c = useCloud();
  const form = useNewThread(() => {});
  const typing = useRef(false);
  const text = useRef(form.draft.text);
  text.current = form.draft.text;
  useEffect(() => () => { if (typing.current && text.current.trim()) router.push('/new'); }, []);
  return (
    <View style={{ borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.card }}>
      <NewThreadFields form={form} inline onFocus={() => { typing.current = true; }} onBlur={() => { typing.current = false; }} />
      <NewThreadFoot form={form} send={<SendButtons form={form} />} />
      <NewThreadSheets form={form} now={c.now} />
    </View>
  );
}
