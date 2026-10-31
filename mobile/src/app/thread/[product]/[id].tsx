// One thread, as the phone layout draws it: the conversation, the agent's
// last word, the threads it filed, the options it still offers, and the reply
// box that opens into the desktop's sentence. A press leaves a command for the
// Mac and shows at once as waiting for it.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import { isImageName } from '../../../../../renderer/src/attachments';
import { KEEP_OPEN, type CloseOption } from '../../../../../renderer/src/close-asks-first';
import { foldedReply } from '../../../../../renderer/src/folded-reply';
import { closesTheTask, type ParsedOption } from '../../../../../renderer/src/format';
import { MODE_WORDS } from '../../../../../renderer/src/modes';
import { DEFAULT_MODEL, modelLabelOf } from '../../../../../renderer/src/models';
import { priorityLabelOf, priorityValueOf } from '../../../../../renderer/src/priority';
import { clock, dayHeading } from '../../../../../renderer/src/thread-history';
import { stateWordOf } from '../../../../../renderer/src/threads/summary-rules';
import { summaryOf, threadState } from '../../../../../shared/thread-cards.mjs';
import { arrivedAt } from '../../../../../renderer/src/unread';
import type { Choices, Press } from '../../../lib/actions';
import { useDraft } from '../../../lib/drafts';
import { typedWords } from '../../../lib/files';
import { threadOf, type FiledRow, type Thread } from '../../../lib/thread';
import { askUnderAnswer, CHOICES_FOLDED, foldKey, foldedKeys, pageOf, splitHeadline, spotIn, stepIn, toggleFold } from '../../../lib/one-page';
import { mateOf } from '../../../lib/teammates';
import { TeammateMark } from '../../../ui/Teammates';
import { screenGate } from '../../../lib/thread-gate';
import { liveOf, offersOf, shownLevel, summaryParts, type Offers } from '../../../lib/thread-offers';
import { waitFacts } from '../../../../../renderer/src/phone-rows';
import { replySender, type ReplyDeps } from '../../../lib/thread-reply';
import { atEnd, keptPlace } from '../../../lib/thread-scroll';
import { appStore } from '../../../platform/persist';
import { useCloud } from '../../../state/cloud';
import { AttachSheet, Attached } from '../../../ui/Attach';
import { SentFiles, ThreadFiles, useMessageFiles } from '../../../ui/Files';
import { Back, Chevron, Clip, DoneMark, More, Panel } from '../../../ui/icons';
import { Waiting } from '../../../ui/LogoOrbit';
import { Markdown, type MessageFiles } from '../../../ui/Markdown';
import { footRoom, IconButton, Pickable, PriorityBars, RunningMark, T, TopBar, Wall } from '../../../ui/parts';
import { ModelSheet, ModeSheet, PrioritySheet, barsFor } from '../../../ui/Pickers';
import { ThreadMenu } from '../../../ui/ThreadMenu';
import { DictationProblem, Listening, MicButton, useDictation } from '../../../ui/Dictation';
import { ActLine, FiledList, FocusActions, LiveLine, OptionsCard, RunLine, WorkLine } from '../../../ui/ThreadParts';
import { color, font, size } from '../../../ui/theme';

const when = (at: number) => (at ? `${dayHeading(at)} ${clock(at)}` : '');
// The dark look's `--code-minus`, which a message her Mac refused says why in.
const REFUSED = '#e28f82';

/** A thread's state as the desktop marks it (`.th-st.s-*`, threads/pages.css). */
function StateDot({ state }: { state: string }) {
  if (state === 'running') return <RunningMark />;
  const dot = { width: 12, height: 12, borderRadius: 6 };
  if (state === 'scheduled') return <View style={{ ...dot, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.faint }} />;
  return <View style={{ ...dot, backgroundColor: state === 'waiting' ? color.accent : color.faint }} />;
}

type Kind = 'msg' | 'same' | 'act' | 'work';
const kindOf = (n: any): Kind => (n.kind === 'run' ? 'work' : n.kind === 'work' ? (n.yours ? 'act' : 'work') : n.same && !n.resumed ? 'same' : 'msg');
// The thread's 22px column and the pulls between its blocks (styles.css `.thread-block`).
function gapBefore(prev: Kind, cur: Kind, afterGap: boolean) {
  if (cur === 'same') return 8;
  if (afterGap) return 22;
  if (prev === 'work' && cur === 'work') return 5;
  if (prev === 'act' && cur === 'act') return 9;
  if ((prev === 'work' && cur === 'act') || (prev === 'act' && cur === 'work')) return 14;
  if ((prev === 'msg' || prev === 'same') && cur === 'work') return 8;
  return 22;
}

function Said({ e, starts, ends, product, dir, files, sendNow, openOrigin, name }: {
  e: any; starts: boolean; ends: boolean; product: string; dir: string | null; files: MessageFiles; sendNow?: () => void; openOrigin: () => void;
  /** A teammate's run is signed with its name. */
  name?: string;
}) {
  const yours = e.who === 'you';
  const words = yours ? typedWords(e.text ?? '') : '';
  return (
    <View style={[
      starts ? { marginTop: 16, paddingTop: 22, borderTopWidth: 1, borderTopColor: color.lineStrong } : null,
      ends ? { marginBottom: 16, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: color.lineStrong } : null,
    ]}>
      {(!e.same || e.resumed) && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 3, flexWrap: 'wrap' }}>
          <T style={yours ? { fontSize: 14, lineHeight: 22.4, fontFamily: font.semibold } : { fontSize: 14, lineHeight: 22.4, color: color.dim }}>{yours ? 'You' : name ?? 'The agent'}</T>
          <T style={{ fontSize: 12.5, lineHeight: 20, color: e.refused ? REFUSED : e.pending ? color.dim : color.faint, flexShrink: 1 }} numberOfLines={2}>
            {e.refused ? `Not sent: ${e.refused}` : e.pending ? (e.cloud ? 'Working in Agentbox Cloud' : 'Waiting for your computer') : when(e.at)}
          </T>
          {e.pending && !e.refused && !e.cloud && sendNow && (
            <T onPress={sendNow} suppressHighlighting accessibilityRole="button"
              style={{ fontSize: 12.5, lineHeight: 20, color: color.dim, textDecorationLine: 'underline' }}>Send now</T>
          )}
          {!!e.on && <T onPress={openOrigin} suppressHighlighting accessibilityRole="button" numberOfLines={1} style={{ fontSize: 12.5, lineHeight: 20, color: color.faint, flexShrink: 1 }}>{`on ${e.on}`}</T>}
        </View>
      )}
      <View style={e.pending ? { opacity: 0.82 } : null}>
        {/* Her words as typed; the files the app wrote into them are drawn, not read out. */}
        {yours ? (
          <>
            {!!words.trim() && <T selectable style={{ fontSize: 17, lineHeight: 26.35, fontFamily: font.medium }}>{words}</T>}
            <SentFiles text={e.text ?? ''} product={product} />
          </>
        ) : <Markdown text={e.text ?? ''} dir={dir} files={files} />}
      </View>
    </View>
  );
}

const StopMark = () => <Svg width={9} height={9} viewBox="0 0 12 12"><Rect x={1.5} y={1.5} width={9} height={9} fill={color.dim} /></Svg>;

function Dock({ thread, offers, busy, setBusy, stop, setError, foldedChoices = 0, showChoices }: {
  thread: Thread; offers: Offers; busy: boolean; setBusy: (on: boolean) => void; stop: () => void; setError: (m: string | null) => void;
  /** With the choices folded, how many there are and the way back to them (OneThingAtATime.tsx `ChoicesShow`). */
  foldedChoices?: number; showChoices?: () => void;
}) {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const item = thread.item;
  // Her words and files outlive the screen, a draft per thread (lib/drafts.ts).
  const draft = useDraft({ product: item.product, id: item.id }, appStore);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [picked, setPicked] = useState<Choices>({});
  const [sheet, setSheet] = useState<'priority' | 'mode' | 'model' | 'attach' | null>(null);
  const ready = !!draft.text.trim() || draft.files.length > 0;
  const priority = picked.priority ?? priorityValueOf(shownLevel(item));
  const model = picked.model ?? item.model ?? DEFAULT_MODEL;
  const mode = picked.permissionMode ?? 'auto';
  const folded = foldedReply(draft.text, draft.files.map((f) => ({ name: f.name, image: isImageName(f.name) })));
  const deps = useRef<ReplyDeps | null>(null);
  deps.current = {
    draft,
    busy: setBusy,
    attach: (files) => c.attach(item.product, files),
    send: (text, choices, undone) => c.send({ kind: 'reply', text, choices }, item, { undone }),
    failed: (m) => setError(`Not sent: ${m}`),
  };
  const [send] = useState(() => replySender(() => deps.current!, (sent) => { if (sent) { setPicked({}); setOpen(false); } }));
  const talk = useDictation(draft, () => void send(picked));
  const typing = useRef<ComponentRef<typeof TextInput>>(null);
  // A box that only listened, and heard nothing, folds away as an empty one does on blur.
  useEffect(() => { if (!talk.on && !talk.problem && !ready && !sheet && !typing.current?.isFocused()) setOpen(false); }, [talk.on]);
  const foot = footRoom(inset);
  const card = { borderWidth: 1, backgroundColor: color.fill };
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 16 + foot, paddingTop: 8 }}>
      {!open ? (
        <View style={{ ...card, borderColor: color.line, height: 43, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Reply" style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center' }}>
            <T numberOfLines={1} style={{ flex: 1, fontSize: 14.5, color: folded.draft ? color.dim : color.faint, paddingHorizontal: 16 }}>{folded.text}</T>
            {!!folded.files && <T style={{ fontSize: 12, color: color.faint, paddingRight: 12 }}>{folded.files}</T>}
            <T style={{ fontSize: 13, color: color.dim, marginRight: 4, textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }}>{modelLabelOf(model)}</T>
          </Pressable>
          {foldedChoices > 0 && (
            <Pressable onPress={showChoices} accessibilityRole="button" accessibilityLabel={`Show the ${foldedChoices} choices`} hitSlop={6}
              style={{ height: 32, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <T style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>{foldedChoices}</T>
              <Chevron up size={13} />
            </Pressable>
          )}
          <View style={{ marginRight: 4 }}><MicButton talk={{ ...talk, start: () => { setOpen(true); talk.start(); } }} /></View>
        </View>
      ) : (
        <View style={{ ...card, borderColor: color.lineStrong }}>
          {/* Typing stops dictation with the words kept; tapping the box does not (web-speech.ts). */}
          <TextInput ref={typing} autoFocus={!talk.active()} multiline value={draft.text} placeholder="What should the agent do next?" placeholderTextColor={color.faint}
            onChangeText={(t) => { if (talk.active()) talk.leave(); draft.setText(t); }}
            onBlur={() => { if (!ready && !sheet && !talk.active()) setOpen(false); }}
            style={[{ minHeight: 92, maxHeight: 220, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 6, fontFamily: font.regular, fontSize: 15.5, lineHeight: 24, color: color.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          {(draft.files.length > 0 || failed || draft.dropped > 0 || (!talk.on && !!talk.problem)) && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
              <Attached files={draft.files} drop={(i) => draft.setFiles((f) => f.filter((_, n) => n !== i))} />
              {draft.dropped > 0 && <T style={{ fontSize: 13, color: color.dim }}>{draft.dropped === 1 ? 'One file is too big to keep. Leaving this thread loses it.' : `${draft.dropped} files are too big to keep. Leaving this thread loses them.`}</T>}
              {failed && <T style={{ fontSize: 13, color: color.dim }}>{failed}</T>}
              <DictationProblem talk={talk} />
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 9, paddingBottom: 10, paddingLeft: 12, paddingRight: 14 }}>
            {talk.on ? (
              <Listening talk={talk} lead={4} />
            ) : (
            <>
            <Pressable onPress={() => setSheet('attach')} accessibilityLabel="Attach a file or picture" accessibilityRole="button" hitSlop={4}
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -4 }}>
              <Clip />
            </Pressable>
            <View style={{ marginLeft: -10, marginRight: -4 }}><MicButton talk={talk} /></View>
            <T style={{ flex: 1, fontSize: 13, lineHeight: 21, color: color.faint }}>
              <Pickable style={{ fontSize: 13, color: color.dim }} onPress={() => setSheet('priority')}>{priorityLabelOf(shownLevel({ priority }))}</Pickable>
              {' priority. In '}
              <Pickable style={{ fontSize: 13, color: color.dim }} onPress={() => setSheet('mode')}>{MODE_WORDS[mode as keyof typeof MODE_WORDS] ?? mode}</Pickable>
              {' Mode. On '}
              {/* A no-break space, so a model's name never splits over two lines. */}
              <Pickable style={{ fontSize: 13, color: color.dim }} onPress={() => setSheet('model')}>{modelLabelOf(model).replace(/ /g, ' ')}</Pickable>
              {'.'}
            </T>
            {/* One slot: Stop while it is in progress and the box is empty, Send once anything is typed (Focus.tsx). */}
            {offers.stop && !ready ? (
              <Pressable onPress={stop} accessibilityRole="button" accessibilityLabel={thread.running ? 'Stop this agent' : 'Stop this task'}
                style={({ pressed }) => ({ height: 29, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : 'transparent' })}>
                <StopMark />
                <T style={{ fontSize: 13, fontFamily: font.medium, color: color.dim }}>Stop</T>
              </Pressable>
            ) : (
              <Pressable disabled={busy || !ready} accessibilityRole="button" onPress={() => void send(picked)}
                style={({ pressed }) => ({ height: 29, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : 'transparent', opacity: busy || !ready ? 0.5 : 1 })}>
                <T style={{ fontSize: 13, fontFamily: font.semibold }}>{busy ? 'Sending…' : 'Send'}</T>
              </Pressable>
            )}
            </>
            )}
          </View>
        </View>
      )}
      <AttachSheet open={sheet === 'attach'} close={() => setSheet(null)} add={(more) => { setFailed(null); draft.setFiles((f) => [...f, ...more]); }} fail={setFailed} />
      <PrioritySheet open={sheet === 'priority'} close={() => setSheet(null)} value={priority} pick={(v) => setPicked((p) => ({ ...p, priority: v }))} />
      <ModeSheet open={sheet === 'mode'} close={() => setSheet(null)} value={mode} pick={(v) => setPicked((p) => ({ ...p, permissionMode: v }))} />
      <ModelSheet open={sheet === 'model'} close={() => setSheet(null)} model={model} effort={picked.effort ?? item.effort ?? null}
        pickModel={(v) => setPicked((p) => ({ ...p, model: v }))} pickEffort={(v) => setPicked((p) => ({ ...p, effort: v }))} />
    </View>
  );
}

function Summary({ thread, now, close }: { thread: Thread; now: number; close: () => void }) {
  const item = thread.item;
  // Context and Done, the summary's two lines, with the desktop's fallbacks.
  const told = summaryOf(item);
  const { steps, updated } = summaryParts(item, now);
  const level = shownLevel(item);
  const inset = useSafeAreaInsets();
  const heading = { fontFamily: font.mono, fontSize: 10.5, letterSpacing: 0.84, textTransform: 'uppercase' as const, color: color.faint };
  const row = (label: string, value: ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 20 }}>
      <T style={{ width: 92, fontSize: 13, lineHeight: 20, color: color.faint }}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{value}</View>
    </View>
  );
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <TopBar left={<IconButton label="Back" onPress={close}><Back /></IconButton>} title={<T numberOfLines={1} style={{ fontSize: 15, paddingHorizontal: 6 }}>{thread.title}</T>} />
        {/* `.ts-panel`'s 20px 16px 40px, its title's line 22px under the bar; the home bar is the phone's own. */}
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: size.inset, paddingTop: 21, paddingBottom: 40 + inset.bottom }}>
          <View style={{ gap: 22 }}>
            <T style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.16, fontFamily: font.medium }}>{thread.title}</T>
            {!!told.problem.trim() && (
              <View style={{ gap: 9 }}>
                <T style={heading}>Context</T>
                <T style={{ fontSize: 13.5, lineHeight: 21, color: color.dim }}>{told.problem}</T>
              </View>
            )}
            {steps.length > 0 && (
              <View style={{ gap: 9 }}>
                <T style={heading}>Done</T>
                {steps.map((l, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color.faint, marginTop: 8 }} />
                    <T style={{ flex: 1, fontSize: 13.5, lineHeight: 21, color: color.dim }}>{l}</T>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: color.line, paddingTop: 22, marginTop: 28, gap: 14 }}>
            {row('Status', <><StateDot state={threadState(item)} /><T style={{ fontSize: 13.5, lineHeight: 20 }}>{stateWordOf(item, threadState(item))}</T></>)}
            {row('Priority', <><PriorityBars level={barsFor(priorityValueOf(level))} /><T style={{ fontSize: 13.5, lineHeight: 20 }}>{priorityLabelOf(level)}</T></>)}
            {row('Owner', <T style={{ fontSize: 13.5, lineHeight: 20 }}>You</T>)}
            {row('Project', <T style={{ fontSize: 13.5, lineHeight: 20 }}>{thread.projectName}</T>)}
            {updated && row('Updated', <T style={{ fontSize: 13.5, lineHeight: 20 }}>{updated}</T>)}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function ThreadScreen() {
  const { product, id } = useLocalSearchParams<{ product: string; id: string }>();
  const c = useCloud();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [summary, setSummary] = useState(false);
  // The left-out middle, asked back; dropped on leaving the thread (ItemThread.tsx).
  const [whole, setWhole] = useState(false);
  // Close asked first while filed tasks wait (close-asks-first.ts).
  const [asking, setAsking] = useState(false);
  // Send now was pressed and her Mac has not taken her words yet.
  const [cutting, setCutting] = useState(false);
  // What came before the newest answer, opened from its fold (lib/one-page.ts).
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [contextWhole, setContextWhole] = useState(false);
  const [foldedRounds, setFoldedRounds] = useState(() => foldedKeys(appStore.getItem(CHOICES_FOLDED)));
  useEffect(() => { setWhole(false); setAsking(false); setCutting(false); setEarlierOpen(false); setContextWhole(false); }, [product, id]);
  const thread = useMemo(() => threadOf(c.rows, c.view, String(product), String(id), { whole, tabs: c.tabs }), [c.rows, c.view, c.tabs, product, id, whole]);
  const { dir, files } = useMessageFiles(String(product), String(id));
  const waiting = !!thread?.events.some((e: any) => e.kind !== 'work' && e.pending);
  useEffect(() => { if (!waiting) setCutting(false); }, [waiting]);
  // Read once opened, and again when an answer lands while it is open (App.tsx `focusedArrival`).
  const arrived = thread ? arrivedAt(thread.item) : 0;
  useEffect(() => { if (thread) c.markSeen(thread.item); }, [product, id, arrived, !!thread]);

  // Her place: the end is followed only while she rests there (thread-bottom.ts).
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const resting = useRef(true);
  const sizes = useRef({ y: 0, view: 0, content: 0 });
  const anchor = useRef<number | null>(null);
  const footList = useRef(0);
  // A page opens on its name; only a conversation with no answer yet opens at its end, to follow it.
  const placedOn = useRef<string | null>(null);

  const back =() => (router.canGoBack() ? router.back() : router.replace('/'));
  const gate = screenGate(c);
  if (gate === 'wait') return <Wall><Waiting /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;
  if (!thread) {
    return (
      <Wall>
        <TopBar left={<IconButton label="Back" onPress={back}><Back /></IconButton>} />
        {c.loading ? <Waiting list /> : <T style={{ padding: size.inset, color: color.dim }}>This thread is not on your phone.</T>}
      </Wall>
    );
  }
  const item = thread.item;
  const mate = mateOf(item, c.team);
  const page = pageOf(item, thread.events, thread.outcome, thread.after, earlierOpen);
  if (placedOn.current !== `${product}/${id}`) {
    placedOn.current = `${product}/${id}`;
    resting.current = !page.answer && !thread.outcome && page.from === 0;
  }
  // Its place in Needs you, with the arrows that walk it (OneThingAtATime.tsx `QueueNav`).
  const spot = spotIn(c.tabs.inbox, { product: String(product), id: String(id) });
  const step = (dir: 1 | -1) => {
    const to = stepIn(c.tabs.inbox, { product: String(product), id: String(id) }, dir);
    if (to) router.setParams({ product: to.product, id: to.id });
  };
  const roundKey = foldKey(item);
  const choicesFolded = foldedRounds.includes(roundKey);
  const foldChoices = () => {
    const now = toggleFold(foldedRounds, roundKey);
    setFoldedRounds(now);
    appStore.setItem(CHOICES_FOLDED, JSON.stringify(now));
  };
  const facts = { session: thread.session, inProgress: thread.inProgress, now: c.now };
  const offers = offersOf(item, facts);
  // With what the computer says of it while nothing runs, so waiting its turn reads Queued.
  const live = liveOf(item, { ...facts, ...waitFacts(c.view, item.id) });
  const press = async (p: Press, on: any = item, then?: () => void) => {
    setBusy(true); setError(null);
    try { await c.send(p, on); then?.(); return true; } catch (err) { setError(String((err as Error)?.message ?? err)); return false; } finally { setBusy(false); }
  };
  const openThread = (to: { product: string; id: string }) => router.push({ pathname: '/thread/[product]/[id]', params: { product: to.product, id: to.id } });
  const close = () => { if (thread.closeAsk) setAsking(true); else void press({ kind: 'close' }, item, back); };
  const answerAsk = async (option: CloseOption) => {
    setAsking(false);
    if (option.act === 'decide') { scroll.current?.scrollTo({ y: Math.max(0, footList.current - 80), animated: true }); return; }
    for (const kid of thread.waitingFiled) {
      if (!(await press(option.act === 'start' ? { kind: 'approve-filed' } : { kind: 'close' }, kid.item))) return;
    }
    await press({ kind: 'close' }, item, back);
  };
  const pick = (o: ParsedOption) => (closesTheTask(o.text) ? close() : void press({ kind: 'pick', option: o }));
  const filedPresses = {
    open: (r: FiledRow) => openThread(r.item),
    approve: (r: FiledRow) => void press({ kind: 'approve-filed' }, r.item),
    here: (r: FiledRow) => void press({ kind: 'do-here', child: r.item, parent: item }, r.item),
    dismiss: (r: FiledRow) => void press({ kind: 'close' }, r.item),
  };
  const sendNow = offers.sendNow && !cutting ? () => { setCutting(true); void press({ kind: 'send-now' }); } : undefined;
  const openOrigin = () => { if (thread.parent) openThread(thread.parent); };
  const below = [
    ...(offers.back ? [{ label: offers.back.label, dim: offers.back.dim, onPress: () => void press({ kind: 'later', until: 0 }) }] : []),
    ...(offers.sendBack ? [{ label: 'send back to agent', onPress: () => void press({ kind: 'send-back' }) }] : []),
  ];

  let prev: Kind | null = null;
  let afterGap = false;
  const blocks = page.answer ? [] : thread.nodes.map((n: any, k: number) => {
    // Answered since: the page is drawn from that answer down.
    if ((n.kind === 'run' ? n.items[n.items.length - 1]?.i : n.i) < page.from) return null;
    const kind = kindOf(n);
    const marginTop = prev === null ? 0 : gapBefore(prev, kind, afterGap);
    const joined = prev === 'act' && kind === 'act';
    const ends = n.kind === 'run' ? n.items[n.items.length - 1]?.i : n.i;
    prev = kind;
    afterGap = ends === thread.gapAfter;
    const tail = thread.filedOnTurn.get(ends);
    // CSS collapses the fold's 18px top margin into a turn's 16px bottom one; React Native adds them.
    const endsTurn = n.kind !== 'run' && n.kind !== 'work' && thread.turnEnds[k];
    return (
      <View key={`${n.at}-${ends}-${k}`} style={{ marginTop }}>
        {n.kind === 'run' ? <RunLine items={n.items} />
          : n.kind === 'work' ? (n.yours ? <ActLine act={n} joined={joined} /> : <WorkLine work={n} />)
          : <Said e={n} starts={thread.turnStarts[k]} ends={thread.turnEnds[k]} product={item.product} dir={dir} files={files} sendNow={sendNow} openOrigin={openOrigin} name={mate?.name} />}
        {tail && <FiledList rows={tail} label="Filed from this thread" inTurn {...filedPresses} />}
        {afterGap && (
          <Pressable onPress={() => { anchor.current = sizes.current.content - sizes.current.y; setWhole(true); }} accessibilityRole="button" style={{ marginTop: endsTurn ? 18 - 16 : 18 }}>
            <T style={{ fontSize: 13, lineHeight: 20.8, color: color.faint }}>{thread.gapWords}</T>
          </Pressable>
        )}
      </View>
    );
  });

  return (
    <Wall>
      <TopBar
        left={<IconButton label="Back" width={34} onPress={back}><Back /></IconButton>}
        right={<>
          {spot && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.99, textTransform: 'uppercase', color: color.dim, marginRight: 2 }}>{`${spot.pos} of ${spot.total}`}</T>
              <IconButton label="Previous thread" width={32} onPress={() => step(-1)}><View style={{ opacity: spot.index <= 0 ? 0.35 : 1 }}><Chevron up /></View></IconButton>
              <IconButton label="Next thread" width={32} onPress={() => step(1)}><View style={{ opacity: spot.pos >= spot.total ? 0.35 : 1 }}><Chevron /></View></IconButton>
            </View>
          )}
          <IconButton label="Show the summary" width={spot ? 36 : 44} onPress={() => setSummary(true)}><Panel /></IconButton>
          {/* Done in a box of its own, left of the dots, as the desktop draws it (threads/ThreadMenu.tsx). */}
          {threadState(item) !== 'done' && (
            <Pressable onPress={close} disabled={busy} accessibilityRole="button" accessibilityLabel="Mark done"
              style={({ pressed }) => ({ height: 30, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 9, paddingRight: 12, marginRight: 4, borderWidth: 1, borderColor: pressed ? color.lineStrong : color.line, backgroundColor: pressed ? color.picked : 'transparent' })}>
              <DoneMark />
              <T style={{ fontSize: 13, color: color.dim }}>Done</T>
            </Pressable>
          )}
          <IconButton label="More" width={30} onPress={() => setMenu(true)}><More /></IconButton>
          <View style={{ width: 16 }} />
        </>}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: size.inset, paddingTop: 8, paddingBottom: 24 }}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
            sizes.current = { y: contentOffset.y, view: layoutMeasurement.height, content: contentSize.height };
            resting.current = atEnd(sizes.current);
          }}
          onContentSizeChange={(_w, h) => {
            sizes.current.content = h;
            if (anchor.current !== null) {
              const y = keptPlace(anchor.current, h);
              anchor.current = null;
              scroll.current?.scrollTo({ y, animated: false });
            } else if (resting.current) scroll.current?.scrollToEnd({ animated: false });
          }}
          onLayout={() => { if (resting.current) scroll.current?.scrollToEnd({ animated: false }); }}>
          {/* The name heads the page, the largest type on it, with the Context under a thin line (one-thing-at-a-time.css). */}
          <View style={{ marginBottom: 18 }}>
            <T selectable style={{ fontFamily: font.medium, fontSize: 27, lineHeight: 33.75, letterSpacing: -0.405, marginBottom: 6 }}>{page.title}</T>
            {page.toggle && (
              <Pressable onPress={() => { const open = !earlierOpen; setEarlierOpen(open); setWhole(true); resting.current = open; }} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
                <T style={{ fontSize: 12.5, lineHeight: 18, color: color.faint, textDecorationLine: 'underline', textDecorationColor: color.lineStrong }}>{page.toggle}</T>
              </Pressable>
            )}
            {!!page.context && (
              <Pressable onPress={() => setContextWhole(!contextWhole)} accessibilityRole="button" accessibilityState={{ expanded: contextWhole }}
                style={{ borderLeftWidth: 2, borderLeftColor: color.lineStrong, paddingLeft: 14 }}>
                <T numberOfLines={contextWhole ? undefined : 3} style={{ fontSize: 13.5, lineHeight: 20.9, color: color.faint }}>{page.context}</T>
              </Pressable>
            )}
          </View>
          {page.answer ? (
            <View>
              {/* A teammate's answer is signed with its mark, name and time (OneThingAtATime.tsx `QueueAnswer`). */}
              {mate && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                  <TeammateMark t={mate} />
                  <T style={{ fontSize: 14, color: color.dim }}>{mate.name}</T>
                  <T style={{ fontFamily: font.mono, fontSize: 10.5, color: color.faint }}>{when(page.answer.at)}</T>
                </View>
              )}
              {page.answer.headline && <T selectable style={{ fontFamily: font.semibold, fontSize: 17, lineHeight: 24.65, marginBottom: 8 }}>{page.answer.headline}</T>}
              {!!page.answer.rest.trim() && <Markdown text={page.answer.rest} dir={dir} files={files} />}
              {page.appNote && <T style={{ fontSize: 13, lineHeight: 19, marginTop: 14, color: color.faint }}>{page.appNote}</T>}
            </View>
          ) : blocks}
          {/* The thread's foot sits one 22px gap under its last block; the answer's 28 is under that (`.outcome`). */}
          {!page.answer && <View style={{ height: 22 }} />}
          {!page.answer && thread.outcome && (
            <View style={{ marginTop: 28 }}>
              {/* A teammate's answer is signed with its mark, name and time (OneThingAtATime.tsx `QueueAnswer`). */}
              {mate ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                  <TeammateMark t={mate} />
                  <T style={{ fontSize: 14, fontFamily: font.medium }}>{mate.name}</T>
                  <T style={{ fontSize: 12.5, color: color.faint }}>{when(thread.outcome.at)}</T>
                </View>
              ) : thread.outcome.label && (
                <T style={{ fontSize: 12, letterSpacing: 0.84, textTransform: 'uppercase', fontFamily: font.semibold, color: color.faint, marginBottom: 7 }}>{thread.outcome.label}</T>
              )}
              <Markdown text={thread.outcome.text} dir={dir} files={files} />
            </View>
          )}
          {thread.after.length > 0 && (
            <View style={{ marginTop: 22, gap: 9 }}>
              {thread.after.map((a: any, k: number) => <ActLine key={`${a.at}-${k}`} act={a} joined={k > 0} />)}
            </View>
          )}
          <View onLayout={(e) => { footList.current = e.nativeEvent.layout.y; }}>
            <FiledList rows={thread.filedAtFoot} label="Filed from this thread" {...filedPresses} />
          </View>
          {asking && thread.closeAsk ? (
            <OptionsCard ask={thread.closeAsk.ask} options={thread.closeAsk.options} busy={busy} pick={(o) => void answerAsk(o as CloseOption)}
              keep={{ label: KEEP_OPEN, onKeep: () => setAsking(false) }} />
          ) : null}
          {live && <LiveLine live={live} />}
          <ThreadFiles item={item} product={item.product} />
          <FocusActions actions={below} />
          {error && <T style={{ fontSize: 13, color: color.dim, marginTop: 16 }}>{error}</T>}
        </ScrollView>
        {/* The choices sit over the reply box, where the thumb is, and fold away from their small arrow (Focus.tsx `one-choices`). */}
        {thread.options.length > 0 && !asking && !choicesFolded && (
          <ScrollView style={{ flexGrow: 0, flexShrink: 0, maxHeight: 260, marginHorizontal: 12, marginTop: 8 }} keyboardShouldPersistTaps="handled">
            <OptionsCard foot onFold={foldChoices} ask={askUnderAnswer(thread.ask, page.answer?.headline ?? splitHeadline(thread.outcome?.text ?? '').headline)} options={thread.options} busy={busy} pick={pick} dir={dir} files={files} />
          </ScrollView>
        )}
        <Dock thread={thread} offers={offers} busy={busy} setBusy={setBusy} setError={setError} stop={() => void press({ kind: 'stop' })}
          foldedChoices={thread.options.length > 0 && !asking && choicesFolded ? thread.options.length : 0} showChoices={foldChoices} />
      </KeyboardAvoidingView>
      <ThreadMenu open={menu} close={() => setMenu(false)} now={c.now} laterNow={offers.laterNow} runNow={offers.runNow} moveToCloud={offers.moveToCloud}
        onLater={(until, label) => void press({ kind: 'later', until, label }, item, back)}
        onBack={() => void press({ kind: 'later', until: 0 })}
        onRunNow={() => void press({ kind: 'run-now' })}
        onMoveToCloud={() => void press({ kind: 'move-to-cloud' })}
        pinned={item.status === 'done' || item.waitsForMac ? null : !!item.pinned}
        onPin={(pin) => void press({ kind: 'pin', pinned: pin })}
        onUnread={() => { c.markUnseen(item); back(); }}
        onClose={close} />
      {summary && <Summary thread={thread} now={c.now} close={() => setSummary(false)} />}
    </Wall>
  );
}
