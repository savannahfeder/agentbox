// The New thread form, as the phone layout draws it (phone.css `.tc-card`): a
// row each for where it goes, the model, the project and the priority, the
// message under them, and attaching a file or picture at the foot. The New
// thread page wears it whole; the empty inbox draws it open on the page, as
// the web app does (Pages.tsx `InboxClear`).
import { router } from '../lib/router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { readRule, repeatPresets } from '../../../renderer/src/format';
import { engineModelLabel } from '../../../renderer/src/models';
import { ruleLabel } from '../../../shared/repeats.mts';
import { priorityIdOf, priorityLabelOf, priorityValueOf } from '../../../renderer/src/priority';
import { agentChoices, agentWordFor, autoOffered, laterHint, momentFromWords, mondayIsTomorrow, mondayMorning, projectSwatch, tomorrowMorning, type Harness } from '../../../renderer/src/threads/composer-rules';
import { splitSlug } from '../../../renderer/src/phone-rows';
import { AUTO_LABEL } from '../../../shared/auto-route.mts';
import type { Choices } from '../lib/actions';
import { newThreadChoices, onceAtATime, openingChoices, openingEngine, openingFor, openingRecipient, pickEffort, pickModel, projectNow, type Recipient } from '../lib/compose';
import { AutoMark, TeammateMark } from './Teammates';
import { roleOf } from '../lib/teammates';
import type { Teammate } from '../../../renderer/src/types';
import { useDraft, type Draft } from '../lib/drafts';
import { appStore } from '../platform/persist';
import { useCloud } from '../state/cloud';
import { useComputerAgents } from '../state/computer-agents';
import { useSendWhenOnline } from '../state/send-when-online';
import { AttachSheet, Attached } from './Attach';
import { withPicked } from '../lib/attach';
import { DictationProblem, Listening, MicButton, useDictation } from './Dictation';
import { Caret, Clip, Clock, Repeat } from './icons';
import { TimeBox, TypingSheet } from './Later';
import { Pickable, PriorityBars, Sheet, SheetHead, SheetRow, SheetSep, T } from './parts';
import { ModelSheet, PrioritySheet, barsFor } from './Pickers';
import { color, corner, font, size } from './theme';

const Swatch = ({ slug }: { slug: string }) => <View style={{ width: 9, height: 9, backgroundColor: projectSwatch(slug) }} />;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: size.inset, borderBottomWidth: 1, borderBottomColor: color.line }}>
      <T style={{ width: 84, fontSize: 15, color: color.dim }}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{children}</View>
    </View>
  );
}

/** Everything the form holds, and its send; `sent` runs once a thread has gone, `reopen` once its Undo has put the draft back. */
export function useNewThread(sent: () => void, reopen?: () => void) {
  const c = useCloud();
  const projects = c.view.products;
  // Your words, files and priority outlive the page (lib/drafts.ts); the
  // model and level are the ones last picked, the To and project this thread's own (lib/compose.ts).
  const draft = useDraft('new', appStore);
  const [opening] = useState(() => openingChoices(projects, appStore));
  const [picked, setPicked] = useState<string | null>(null);
  const product = projectNow(projects, picked) ?? '';
  const agents = useComputerAgents();
  const codex = { codexModels: agents.codexModels, codexDefault: agents.codexDefault };
  const offered = agentChoices(agents.engines);
  const [pickedEngine, setPickedEngine] = useState<Harness | null>(null);
  const engine: Harness = offered.some((e) => e.id === pickedEngine) ? (pickedEngine as Harness) : openingEngine(agents.engines, agents.workspace);
  // Each agent's model and level kept apart, as the site's card keeps them.
  const [chosen, setChosen] = useState<Partial<Record<Harness, { model: string; effort: string | null }>>>(() => ({ claude: { model: opening.model, effort: opening.effort } }));
  const { model, effort } = chosen[engine] ?? openingFor(appStore, engine, agents.codexDefault);
  const choose = (next: Partial<{ model: string; effort: string | null }>) => setChosen((was) => ({ ...was, [engine]: { model, effort, ...next } }));
  const [sheet, setSheet] = useState<'to' | 'model' | 'project' | 'priority' | 'attach' | 'later' | null>(null);
  const box = useRef<ComponentRef<typeof TextInput>>(null);
  const lastSheet = useRef(sheet);
  // A picked project, agent, model or priority hands the cursor back to the
  // message, once the sheet's fade is over: until then the sheet holds focus.
  useEffect(() => {
    const was = lastSheet.current;
    lastSheet.current = sheet;
    if (sheet !== null || !was || was === 'later') return;
    const t = setTimeout(() => box.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [sheet]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectName = useMemo(() => projects.find((p) => p.slug === product)?.name ?? '', [projects, product]);
  // WHO IT GOES TO, while the computer sends your AI teammates: Auto, an agent,
  // one of them, or someone new made for it (renderer/src/threads/ThreadComposer.tsx).
  const mates = useMemo(() => (c.team?.view.list ?? []).filter((t) => t.status === 'active'), [c.team]);
  const reach = !!c.team;
  const [pickedTo, setPickedTo] = useState<Recipient | null>(null);
  const recipient = pickedTo ?? openingRecipient(mates, reach);
  const autoHere = autoOffered(mates, reach);
  const onAuto = recipient.auto && autoHere && !recipient.mate;
  const mate: Teammate | 'new' | null = reach && recipient.mate === 'new' ? 'new' : mates.find((m) => m.id === recipient.mate) ?? null;
  const toWord = mate === 'new' ? 'Someone new' : mate ? mate.name : onAuto ? 'Auto' : null;
  const chooseTo = (r: Recipient) => setPickedTo(r);
  const canSend = (!!draft.text.trim() || draft.files.length > 0) && !!product && !busy && (!mate || !!draft.text.trim());

  // A teammate takes your words in your chat with it, not as a thread.
  const sendToMate = async () => {
    if (!mate) return;
    if (draft.files.length) throw new Error('A message to a teammate carries words only. Send files in a thread.');
    if (mate === 'new') {
      const where = splitSlug(product);
      if (!where || where.device !== c.team?.device) throw new Error('Pick a project on the computer that keeps your teammates.');
      await c.askTeammate('describe', { text: draft.text, product: where.project });
      c.say('Your new teammate is on its way. It asks you what it needs in Chats.');
    } else {
      await c.askTeammate('post', { text: draft.text, to: [mate.id], fresh: true });
      c.say(mate.paused ? `Sent to ${mate.name}, who is paused. It waits until you resume it in Chats.` : `Sent to ${mate.name}`);
    }
  };

  const sendNow = async (later: Choices = {}) => {
    if (!canSend) return;
    setSheet(null); setBusy(true); setError(null);
    try {
      if (mate) {
        await sendToMate();
        draft.take();
        sent();
        return;
      }
      const saved = await c.attach(product, draft.files);
      const harness = newThreadChoices({ priority: draft.priority, engine, model, effort, engineCount: agents.engines.length, ...codex });
      // Undo withdraws the thread, so its words and files come back to the box.
      // Taken from the page, not the store, which drops pictures too big to keep.
      const sending: Draft = { text: draft.text, files: draft.files, priority: draft.priority };
      const undone = () => { if (draft.restore(sending)) reopen?.(); };
      await c.send({ kind: 'new', product, to: projectName, text: draft.text, saved, choices: { ...harness, ...later, ...(onAuto ? { labels: [AUTO_LABEL] } : {}) } }, null, { undone });
      // The draft goes only once the thread has: a failed send keeps every word on the page.
      draft.take();
      offline.clear();
      sent();
    } catch (err) { setError(offline.failed(String((err as Error)?.message ?? err))); } finally { setBusy(false); }
  };
  // Busy is drawn a frame late; two quick presses must still send once.
  const latest = useRef(sendNow);
  latest.current = sendNow;
  const lastLater = useRef<Choices | undefined>(undefined);
  const [sendOnce] = useState(() => onceAtATime((later?: Choices) => latest.current(later)));
  const offline = useSendWhenOnline(() => {
    if (!canSend) { offline.clear(); setError(null); return; }
    void sendOnce(lastLater.current);
  });
  const send = (later?: Choices) => { offline.clear(); lastLater.current = later; return sendOnce(later); };
  const talk = useDictation(draft, () => void send());
  return {
    draft, box, product, projectName, projects, model, effort, sheet, setSheet, busy, error, setError, canSend, send, talk,
    agents, offered, engine, codex, mates, reach, autoHere, onAuto, mate, toWord,
    pickProject: (slug: string) => setPicked(slug),
    pickAuto: () => chooseTo({ to: 'agent', mate: null, auto: true }),
    pickMate: (id: string) => chooseTo({ to: 'agent', mate: id, auto: false }),
    pickEngine: (id: Harness) => { chooseTo({ to: 'agent', mate: null, auto: false }); setPickedEngine(id); },
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
        style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: color.accent, borderTopLeftRadius: corner.small, borderBottomLeftRadius: corner.small, opacity: pressed ? 0.85 : 1 })}>
        <T style={{ fontSize: 15, fontFamily: font.medium, color: '#fff' }}>{busy ? 'Sending…' : 'Send'}</T>
      </Pressable>
      {/* A message to a teammate goes now; it has no later. */}
      {!form.mate && (
        <Pressable disabled={!canSend} onPress={() => setSheet('later')} accessibilityRole="button" accessibilityLabel="Send later"
          style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent, borderLeftWidth: 1, borderLeftColor: 'rgba(26, 24, 23, 0.28)', borderTopRightRadius: corner.small, borderBottomRightRadius: corner.small, opacity: pressed ? 0.85 : 1 })}>
          <Caret />
        </Pressable>
      )}
    </View>
  );
}

/** The four rows and the message. `inline` is the empty inbox's: a shorter box that does not take the keyboard on its own. */
export function NewThreadFields({ form, inline = false, onFocus, onBlur }: { form: NewThread; inline?: boolean; onFocus?: () => void; onBlur?: () => void }) {
  const { draft, box, talk, product, projectName, model, setSheet, error, agents, offered, engine, codex, mate, onAuto, toWord } = form;
  // A teammate keeps its own model and project; someone new needs only the project it works in.
  const toMate = !!mate && mate !== 'new';
  return (
    <>
      <Field label="To">
        {offered.length > 1 || form.reach
          ? (
            <Pressable onPress={() => setSheet('to')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {mate && mate !== 'new' ? <TeammateMark t={mate} /> : mate === 'new' ? <TeammateMark t={null} /> : onAuto ? <AutoMark /> : null}
              {/* The row is the button; a second one inside it is a button in a button. */}
              <T style={{ fontSize: 15, textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }}>{toWord ?? agentWordFor(agents.engines, engine)}</T>
            </Pressable>
          )
          : <T style={{ fontSize: 15 }}>Agent</T>}
      </Field>
      {!mate && <Field label="Model"><Pickable style={{ fontSize: 15 }} onPress={() => setSheet('model')}>{engineModelLabel(engine, model, codex)}</Pickable></Field>}
      {!toMate && (
        <Field label={mate === 'new' ? 'Works in' : 'Project'}>
          <Pressable onPress={() => setSheet('project')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!!product && <Swatch slug={product} />}
            <T style={{ fontSize: 15, marginLeft: 6 }}>{projectName || 'Pick a project'}</T>
          </Pressable>
        </Field>
      )}
      {!mate && (
        <Field label="Priority">
          <Pressable onPress={() => setSheet('priority')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PriorityBars level={barsFor(priorityValueOf(draft.priority ?? 'medium'))} />
            <T style={{ fontSize: 15 }}>{priorityLabelOf(draft.priority ?? 'medium')}</T>
          </Pressable>
        </Field>
      )}
      {/* Typing stops dictation with the words kept; tapping the box does not (web-speech.ts). */}
      <TextInput ref={box} multiline autoFocus={!inline} value={draft.text} placeholder={toMate ? `Message ${(mate as Teammate).name}` : 'What do you need done?'} placeholderTextColor={color.faint}
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
        {form.autoHere && <SheetRow label="Auto" lead={<AutoMark />} aside="picks who when you send" on={form.onAuto} onPress={() => { form.pickAuto(); setSheet(null); }} />}
        {offered.map((a) => <SheetRow key={a.id} label={a.label} on={!form.onAuto && !form.mate && a.id === engine} onPress={() => { form.pickEngine(a.id); setSheet(null); }} />)}
        {form.reach && <><SheetSep /><SheetHead>Teammates</SheetHead></>}
        {form.mates.map((t) => (
          <SheetRow key={t.id} label={t.name} lead={<TeammateMark t={t} />} aside={t.paused ? 'Paused' : t.primary ? 'Primary' : roleOf(t) ?? undefined}
            on={form.mate !== 'new' && form.mate?.id === t.id} onPress={() => { form.pickMate(t.id); setSheet(null); }} />
        ))}
        {form.reach && <SheetRow label="Someone new" lead={<TeammateMark t={null} />} aside="makes a teammate for this" on={form.mate === 'new'} onPress={() => { form.pickMate('new'); setSheet(null); }} />}
      </Sheet>
      <ModelSheet open={sheet === 'model'} close={() => setSheet(null)} model={model} effort={effort} engine={engine} codex={codex}
        pickModel={form.pickModel} pickEffort={form.pickEffort} />
      <PrioritySheet open={sheet === 'priority'} close={() => setSheet(null)} value={priorityValueOf(draft.priority ?? 'medium')} pick={(v) => draft.setPriority(priorityIdOf(v))} />
      <AttachSheet open={sheet === 'attach'} close={() => setSheet(null)} add={(more) => draft.setFiles((f) => withPicked(f, more))} fail={setError} />
      <Sheet open={sheet === 'project'} close={() => setSheet(null)}>
        <SheetHead>Project</SheetHead>
        {projects.map((p) => <SheetRow key={p.slug} label={p.name} on={p.slug === product} lead={<Swatch slug={p.slug} />} onPress={() => { form.pickProject(p.slug); setSheet(null); }} />)}
      </Sheet>
      {/* Send later, as the desktop's composer offers it (composer-rules.ts). */}
      <TypingSheet open={sheet === 'later'} close={() => setSheet(null)}>
        <SheetHead>Send later</SheetHead>
        <SheetRow label="Add it to Later" lead={<Clock />} onPress={() => void send({ start: 'later' })} />
        <SheetRow label="Tomorrow morning" lead={<Clock />} aside={laterHint(tomorrowMorning(now))} onPress={() => void send({ runAt: tomorrowMorning(now) })} />
        {!mondayIsTomorrow(now) && <SheetRow label="Monday morning" lead={<Clock />} aside={laterHint(mondayMorning(now))} onPress={() => void send({ runAt: mondayMorning(now) })} />}
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
    <View style={{ borderWidth: 1, borderRadius: corner.card, overflow: 'hidden', borderColor: color.lineStrong, backgroundColor: color.card }}>
      <NewThreadFields form={form} inline onFocus={() => { typing.current = true; }} onBlur={() => { typing.current = false; }} />
      <NewThreadFoot form={form} send={<SendButtons form={form} />} />
      <NewThreadSheets form={form} now={c.now} />
    </View>
  );
}
