// One thread, as the phone layout draws it: the conversation, the agent's
// last word, the threads it filed, the options it still offers, and the reply
// box that opens into the desktop's sentence. A press leaves a command for the
// Mac and shows at once as waiting for it.
import { feel } from '../../../lib/feel';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { router } from '../../../lib/router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import { isImageName } from '../../../../../renderer/src/attachments';
import { type CloseOption } from '../../../../../renderer/src/close-asks-first';
import { foldedReply } from '../../../../../renderer/src/folded-reply';
import { closesTheTask, discardsTheChange, type ParsedOption } from '../../../../../renderer/src/format';
import { discardAsk } from '../../../../../renderer/src/discard-asks-first';
import { MODE_WORDS } from '../../../../../renderer/src/modes';
import { priorityLabelOf, priorityValueOf } from '../../../../../renderer/src/priority';
import { clock, dayHeading } from '../../../../../renderer/src/thread-history';
import { threadState } from '../../../../../shared/thread-cards.mts';
import { arrivedAt } from '../../../../../renderer/src/unread';
import { dayClock } from '../../../lib/back-at';
import type { Choices, Press, PressedItem } from '../../../lib/actions';
import { readDraftOf, restoreDraftOf, takeDraftOf, useDraft, type Draft } from '../../../lib/drafts';
import { typedWords } from '../../../lib/files';
import { threadOf, type FiledRow, type Thread, type ThreadEvent, type ThreadNode, type ThreadSaid } from '../../../lib/thread';
import { askUnderAnswer, CHOICES_FOLDED, foldKey, foldedKeys, pageOf, splitHeadline, toggleFold, walkKeeping } from '../../../lib/one-page';
import { needsYouOrder, needsYouSpot, stepOver } from '../../../lib/needs-you';
import { shownTabs } from '../../../lib/tabs';
import { readDisplay } from '../../../../../renderer/src/threads/page-rules';
import { mentionRows } from '../../../../../renderer/src/team/rooms/room-rules';
import { useGroups } from '../../../state/groups';
import { mateOf, questionThread, questionsForYou } from '../../../lib/teammates';
import { TeammateMark, ThreadQuestions } from '../../../ui/Teammates';
import { screenGate } from '../../../lib/thread-gate';
import { liveOf, moveChoices, offersOf, ruleFor, shownLevel, type Offers } from '../../../lib/thread-offers';
import { madeThreadOf, phoneSlug, waitFacts } from '../../../../../renderer/src/phone-rows';
import { madeHere } from '../../../../../shared/phone-snapshot.mts';
import { replySender, type ReplyDeps } from '../../../lib/thread-reply';
import { atEnd, followsHerSend, keptPlace, yoursIn } from '../../../lib/thread-scroll';
import { appStore } from '../../../platform/persist';
import { useCloud } from '../../../state/cloud';
import { useComputerAgents } from '../../../state/computer-agents';
import { replyChoices, replyModel } from '../../../lib/compose';
import { useSendWhenOnline } from '../../../state/send-when-online';
import { AttachSheet, Attached } from '../../../ui/Attach';
import { withAttachments, withPicked } from '../../../lib/attach';
import { SentFiles, ThreadFiles, useMessageFiles } from '../../../ui/Files';
import { Back, Chevron, Clock, Cross, DoneMark, More, Plus } from '../../../ui/icons';
import { TimeBox, TypingSheet } from '../../../ui/Later';
import { replyLaterRows } from '../../../lib/later';
import { agentChoices, laterHint, momentFromWords } from '../../../../../renderer/src/threads/composer-rules';
import { Waiting } from '../../../ui/LogoOrbit';
import { Markdown, type MessageFiles } from '../../../ui/Markdown';
import { Selectable } from '../../../ui/Selectable';
import { ChoiceButton, footRoom, IconButton, PriorityBars, RunningMark, SendKey, Sheet, SheetHead, SheetRow, T, TopBar, Wall } from '../../../ui/parts';
import { barsFor, ModelSheet, ModeSheet, PrioritySheet } from '../../../ui/Pickers';
import { ThreadMenu } from '../../../ui/ThreadMenu';
import { DictationProblem, Listening, MicButton, useDictation } from '../../../ui/Dictation';
import { ActLine, ChangeCard, FiledList, FocusActions, LiveLine, OptionsCard, RunLine, WorkLine } from '../../../ui/ThreadParts';
import { color, corner, font, lift, size } from '../../../ui/theme';

const when = (at: number) => (at ? `${dayHeading(at)} ${clock(at)}` : '');


type Kind = 'msg' | 'same' | 'act' | 'work';
const kindOf = (n: ThreadNode): Kind => (n.kind === 'run' ? 'work' : n.kind === 'work' ? (n.yours ? 'act' : 'work') : n.same && !n.resumed ? 'same' : 'msg');
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
  e: ThreadSaid; starts: boolean; ends: boolean; product: string; dir: string | null; files: MessageFiles; sendNow?: () => void; openOrigin: () => void;
  /** A teammate's run is signed with its name. */
  name?: string;
}) {
  const yours = e.who === 'you';
  const words = yours ? typedWords(e.text ?? '') : '';
  return (
    <View style={[starts ? { marginTop: 14 } : null, ends ? { marginBottom: 14 } : null]}>
      {(!e.same || e.resumed) && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: yours ? 'flex-end' : 'flex-start', gap: 10, marginBottom: yours ? 5 : 3, flexWrap: 'wrap' }}>
          {/* Your own words are the bubble on the right; only the agent's are signed. */}
          {!yours && <T style={{ fontSize: 14, lineHeight: 22.4, fontFamily: font.medium, color: color.dim }}>{name ?? 'The agent'}</T>}
          <T style={{ fontSize: 12.5, lineHeight: 20, color: e.refused ? color.minus : e.pending ? color.dim : color.faint, flexShrink: 1 }} numberOfLines={2}>
            {e.refused ? `Not sent: ${e.refused}` : e.pending ? (e.sent ? 'Sent' : e.cloud ? 'Working in Agentbox Cloud' : e.toCloud ? 'Waiting for Agentbox Cloud' : e.scheduled ? `Scheduled for ${dayClock(e.scheduled)}` : 'Waiting for your computer') : when(e.at)}
          </T>
          {e.pending && !e.refused && !e.cloud && !e.toCloud && !e.scheduled && !e.sent && sendNow && (
            <T onPress={sendNow} suppressHighlighting accessibilityRole="button"
              style={{ fontSize: 12.5, lineHeight: 20, fontFamily: font.semibold, color: color.text }}>Send now</T>
          )}
          {!!e.on && <T onPress={openOrigin} suppressHighlighting accessibilityRole="button" numberOfLines={1} style={{ fontSize: 12.5, lineHeight: 20, color: color.faint, flexShrink: 1 }}>{`on ${e.on}`}</T>}
        </View>
      )}
      <View style={e.pending ? { opacity: 0.82 } : null}>
        {/* Her words as typed; the files the app wrote into them are drawn, not read out. */}
        {yours ? (
          <>
            {!!words.trim() && (
              <View accessibilityLabel={`You: ${words}`} style={{ alignSelf: 'flex-end', maxWidth: '88%', paddingVertical: 10, paddingHorizontal: 16, borderRadius: corner.card, borderBottomRightRadius: 6, backgroundColor: color.picked }}>
                <Selectable style={{ fontSize: 16.5, lineHeight: 24 }}>{words}</Selectable>
              </View>
            )}
            <SentFiles text={e.text ?? ''} product={product} />
          </>
        ) : <Markdown text={e.text ?? ''} dir={dir} files={files} />}
      </View>
    </View>
  );
}

const StopMark = () => <Svg width={9} height={9} viewBox="0 0 12 12"><Rect x={1.5} y={1.5} width={9} height={9} fill={color.dim} /></Svg>;

function Dock({ thread, offers, busy, setBusy, stop, setError, foldedChoices = 0, showChoices, onTyped }: {
  thread: Thread; offers: Offers; busy: boolean; setBusy: (on: boolean) => void; stop: () => void; setError: (m: string | null) => void;
  /** Whether the box holds anything to send, for the page's links that would send without it. */
  onTyped?: (typed: boolean) => void;
  /** With the choices folded, how many there are and the way back to them (OneThingAtATime.tsx `ChoicesShow`). */
  foldedChoices?: number; showChoices?: () => void;
}) {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const item = thread.item;
  // Her words and files outlive the screen, a draft per thread (lib/drafts.ts).
  const draft = useDraft({ product: item.product, id: item.id }, appStore);
  const [open, setOpen] = useState(false);
  // A kept draft opens with the cursor after its words, then the cursor is the person's again.
  const [caret, setCaret] = useState<{ start: number; end: number } | undefined>(undefined);
  const openReply = () => { setCaret({ start: draft.text.length, end: draft.text.length }); setOpen(true); };
  const [failed, setFailed] = useState<string | null>(null);
  const [picked, setPicked] = useState<Choices>({});
  const [sheet, setSheet] = useState<'priority' | 'mode' | 'model' | 'attach' | 'later' | 'stop' | null>(null);
  const [typedLater, setTypedLater] = useState('');
  const [stopping, setStopping] = useState(false);
  useEffect(() => { if (!offers.stop) setStopping(false); }, [offers.stop]);
  const ready = !!draft.text.trim() || draft.files.length > 0;
  useEffect(() => { onTyped?.(ready); }, [ready]);
  const priority = picked.priority ?? priorityValueOf(shownLevel(item));
  const agents = useComputerAgents();
  const codex = { codexModels: agents.codexModels, codexDefault: agents.codexDefault };
  const { engine, model, label: modelLabel } = replyModel(item, picked, agents);
  const sendsAt = Number(picked.runAt) || 0;
  const typedAt = momentFromWords(typedLater, c.now);
  const sendAt = (at: number) => { setTypedLater(''); setSheet(null); setPicked((p) => ({ ...p, runAt: at || undefined })); };
  const mode = picked.permissionMode ?? 'auto';
  const priorityWord = priorityLabelOf(shownLevel({ priority }));
  const modeWord = MODE_WORDS[mode as keyof typeof MODE_WORDS] ?? mode;
  const folded = foldedReply(draft.text, draft.files.map((f) => ({ name: f.name, image: isImageName(f.name) })));
  const deps = useRef<ReplyDeps | null>(null);
  deps.current = {
    draft,
    busy: setBusy,
    attach: (files) => c.attach(item.product, files),
    send: (text, choices, undone) => c.send({ kind: 'reply', text, choices: replyChoices(item, choices, agents) }, item, { undone }),
    failed: (m) => setFailed(offline.failed(m)),
  };
  const [send] = useState(() => replySender(() => deps.current!, (sent) => { if (sent) { offline.clear(); setFailed(null); setPicked({}); setOpen(false); } }));
  const pickedNow = useRef(picked);
  pickedNow.current = picked;
  const offline = useSendWhenOnline(() => {
    if (!draft.text.trim() && !draft.files.length) { offline.clear(); setFailed(null); return; }
    void send(pickedNow.current);
  }, {
    key: `${item.product}:${item.id}`,
    send: () => {
      const key = { product: item.product, id: item.id };
      const taken: Draft = { text: draft.text, files: draft.files, priority: null };
      const choices = replyChoices(item, pickedNow.current, agents);
      return async (cloud) => {
        const saved = await cloud.attach(item.product, taken.files);
        await cloud.send({ kind: 'reply', text: withAttachments(taken.text, saved), choices }, item, { undone: () => { restoreDraftOf(key, taken, appStore); } });
        if (readDraftOf(key, appStore).text === taken.text) takeDraftOf(key, appStore);
      };
    },
  });
  useEffect(() => { if (offline.said) setFailed(offline.said); }, []);
  const sendByHand = () => { feel.thud(); offline.clear(); void send(picked); };
  const talk = useDictation(draft, sendByHand);
  const typing = useRef<ComponentRef<typeof TextInput>>(null);
  // A tap on the box's own buttons blurs the field before it lands; the box must not fold under it.
  const pressInside = useRef(false);
  // A box that only listened, and heard nothing, folds away as an empty one does on blur.
  useEffect(() => { if (!talk.on && !talk.problem && !ready && !sheet && !typing.current?.isFocused()) setOpen(false); }, [talk.on]);
  const foot = footRoom(inset);
  const card = { borderRadius: 26, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, ...lift('card') };
  const stopButton = (
    <Pressable onPress={() => setSheet('stop')} disabled={stopping} accessibilityRole="button" accessibilityLabel={thread.running ? 'Stop this agent' : 'Stop this task'}
      style={({ pressed }) => ({ height: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderRadius: corner.pill, backgroundColor: pressed ? color.lineStrong : color.picked, opacity: stopping ? 0.5 : 1 })}>
      {!stopping && <StopMark />}
      <T style={{ fontSize: 14, fontFamily: font.semibold, color: color.text }}>{stopping ? 'Stopping…' : 'Stop'}</T>
    </Pressable>
  );
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: Math.max(12, foot), paddingTop: 8 }}>
      {!open ? (
        <View style={{ ...card, height: 52, flexDirection: 'row', alignItems: 'center', paddingRight: 8 }}>
          <Pressable onPress={openReply} accessibilityRole="button" accessibilityLabel="Reply" style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center' }}>
            <T numberOfLines={1} style={{ flex: 1, fontSize: 16, color: folded.draft ? color.text : color.faint, paddingLeft: 20, paddingRight: 12 }}>{folded.text}</T>
            {!!folded.files && <T style={{ fontSize: 13, color: color.faint, paddingRight: 10 }}>{folded.files}</T>}
            <View style={{ height: 30, paddingHorizontal: 11, justifyContent: 'center', borderRadius: corner.pill, backgroundColor: color.fill, marginRight: 2 }}><T style={{ fontSize: 13, fontFamily: font.medium, color: color.dim }}>{modelLabel}</T></View>
          </Pressable>
          {foldedChoices > 0 && (
            <Pressable onPress={showChoices} accessibilityRole="button" accessibilityLabel={`Show the ${foldedChoices} choices`} hitSlop={6}
              style={{ height: 32, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <T style={{ fontFamily: font.medium, fontSize: 13, color: color.dim }}>{foldedChoices}</T>
              <Chevron up size={13} />
            </Pressable>
          )}
          <View><MicButton talk={{ ...talk, start: () => { setOpen(true); talk.start(); } }} /></View>
          {offers.stop && <View style={{ marginLeft: 2 }}>{stopButton}</View>}
        </View>
      ) : (
        <View style={{ ...card }} onTouchStartCapture={() => { pressInside.current = true; }}
          onTouchEnd={() => setTimeout(() => { pressInside.current = false; }, 400)}>
          {/* Typing stops dictation with the words kept; tapping the box does not (web-speech.ts). */}
          <TextInput ref={typing} autoFocus={!talk.active()} multiline value={draft.text} placeholder="What should the agent do next?" placeholderTextColor={color.faint}
            selection={caret} onFocus={() => setTimeout(() => setCaret(undefined), 0)}
            onChangeText={(t) => { if (talk.active()) talk.leave(); draft.setText(t); }}
            onBlur={() => { if (!ready && !sheet && !talk.active() && !pressInside.current) setOpen(false); }}
            style={[{ minHeight: 72, maxHeight: 220, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 6, fontFamily: font.regular, fontSize: 16.5, lineHeight: 24, color: color.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          {(draft.files.length > 0 || failed || draft.dropped > 0 || (!talk.on && !!talk.problem)) && (
            <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
              <Attached files={draft.files} drop={(i) => draft.setFiles((f) => f.filter((_, n) => n !== i))} />
              {draft.dropped > 0 && <T style={{ fontSize: 13, color: color.dim }}>{draft.dropped === 1 ? 'One file is too big to keep. Leaving this thread loses it.' : `${draft.dropped} files are too big to keep. Leaving this thread loses them.`}</T>}
              {failed && <T style={{ fontSize: 13, color: color.dim }}>{failed}</T>}
              <DictationProblem talk={talk} />
            </View>
          )}
          {/* The chips wrap under each other on a narrow screen; a choice's name never splits. */}
          {!talk.on && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingBottom: 8 }}>
              <ChoiceButton said={`Priority: ${priorityWord}`} onPress={() => setSheet('priority')} lead={<PriorityBars level={barsFor(priority)} />}>{priorityWord}</ChoiceButton>
              <ChoiceButton said={`Mode: ${modeWord}`} onPress={() => setSheet('mode')}>{modeWord}</ChoiceButton>
              <ChoiceButton said={`Model: ${modelLabel}`} onPress={() => setSheet('model')}>{modelLabel}</ChoiceButton>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10, paddingLeft: 10, paddingRight: 10 }}>
            {talk.on ? (
              <Listening talk={talk} lead={10} />
            ) : (
            <>
            <Pressable onPress={() => setSheet('attach')} accessibilityLabel="Attach a file or picture" accessibilityRole="button" hitSlop={4}
              style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? color.picked : color.fill })}>
              <Plus />
            </Pressable>
            <MicButton talk={talk} />
            <View style={{ flex: 1 }} />
            {/* One slot: Stop while it is in progress and the box is empty, Send once anything is typed (Focus.tsx). */}
            {offers.stop && !ready ? stopButton : (
              // Send later only sets the time; Send says it.
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pressable disabled={busy || !ready} onPress={() => setSheet('later')} accessibilityRole="button"
                  accessibilityLabel={sendsAt ? `Sends ${laterHint(sendsAt)}. Change when` : 'Send later'}
                  style={({ pressed }) => ({ height: 36, minWidth: 36, paddingHorizontal: sendsAt ? 11 : 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: corner.pill, backgroundColor: pressed ? color.picked : color.fill, opacity: busy || !ready ? 0.4 : 1 })}>
                  <Clock size={16} />
                  {sendsAt > 0 && <T style={{ fontSize: 13, fontFamily: font.medium, color: color.dim }}>{laterHint(sendsAt)}</T>}
                </Pressable>
                <SendKey disabled={busy || !ready} busy={busy} onPress={sendByHand} />
              </View>
            )}
            </>
            )}
          </View>
        </View>
      )}
      {/* Stop takes Send's place the moment a reply goes, so a tap there asks first. */}
      <Sheet open={sheet === 'stop'} close={() => setSheet(null)}>
        <SheetHead>{thread.running ? 'Stop this agent?' : 'Stop this task?'}</SheetHead>
        <SheetRow label="Stop the agent" onPress={() => { setSheet(null); setStopping(true); stop(); }} />
        <SheetRow label="Keep it running" onPress={() => setSheet(null)} />
      </Sheet>
      <AttachSheet open={sheet === 'attach'} close={() => setSheet(null)} add={(more) => { setFailed(null); draft.setFiles((f) => withPicked(f, more)); }} fail={setFailed} />
      <PrioritySheet open={sheet === 'priority'} close={() => setSheet(null)} value={priority} pick={(v) => setPicked((p) => ({ ...p, priority: v }))} />
      <ModeSheet open={sheet === 'mode'} close={() => setSheet(null)} value={mode} pick={(v) => setPicked((p) => ({ ...p, permissionMode: v }))} />
      <ModelSheet open={sheet === 'model'} close={() => setSheet(null)} model={model} effort={picked.effort ?? item.effort ?? null} engine={engine} codex={codex}
        pickModel={(v) => setPicked((p) => ({ ...p, model: v }))} pickEffort={(v) => setPicked((p) => ({ ...p, effort: v }))}
        agents={agentChoices(agents.engines)} pickEngine={(id) => setPicked((p) => ({ ...p, engine: id, model: undefined, effort: undefined }))} />
      <TypingSheet open={sheet === 'later'} close={() => { setTypedLater(''); setSheet(null); }}>
        <SheetHead>Send later</SheetHead>
        {replyLaterRows(c.now, sendsAt).map((r) => (
          <SheetRow key={r.label} label={r.label} on={r.on} lead={r.ts ? <Clock /> : <Cross size={15} />} aside={r.hint} onPress={() => sendAt(r.ts)} />
        ))}
        <TimeBox lead={<Clock />} value={typedLater} onChange={setTypedLater} placeholder="Or type: 3h, fri 6pm, tomorrow 9am"
          onSubmit={() => { if (typedAt) sendAt(typedAt.ts); }} onLine={() => { if (typedAt) sendAt(typedAt.ts); }}
          line={!typedLater.trim() ? null : typedAt ? { text: typedAt.hint, tone: 'ok' } : { text: 'Not a time yet', tone: 'unread' }} />
      </TypingSheet>
    </View>
  );
}

export default function ThreadScreen() {
  const { product, id } = useLocalSearchParams<{ product: string; id: string }>();
  const c = useCloud();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  // The left-out middle, asked back; dropped on leaving the thread (ItemThread.tsx).
  const [whole, setWhole] = useState(false);
  // Close asked first while filed tasks wait (close-asks-first.ts).
  const [asking, setAsking] = useState(false);
  // "Discard the change", held until it is asked again (discard-asks-first.ts).
  const [discarding, setDiscarding] = useState<ParsedOption | null>(null);
  // Send now was pressed and her Mac has not taken her words yet.
  const [cutting, setCutting] = useState(false);
  const [typed, setTyped] = useState(false);
  // What came before the newest answer, opened from its fold (lib/one-page.ts).
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [contextWhole, setContextWhole] = useState(false);
  const [foldedRounds, setFoldedRounds] = useState(() => foldedKeys(appStore.getItem(CHOICES_FOLDED)));
  useEffect(() => { setWhole(false); setAsking(false); setDiscarding(null); setCutting(false); setEarlierOpen(false); setContextWhole(false); }, [product, id]);
  const me = c.signedIn ? c.cloud?.session()?.user.id ?? null : null;
  const thread = useMemo(() => threadOf(c.rows, c.view, String(product), String(id), { whole, tabs: c.tabs, me }), [c.rows, c.view, c.tabs, product, id, whole, me]);
  const { dir, files } = useMessageFiles(String(product), String(id));
  const inset = useSafeAreaInsets();
  const waiting = !!thread?.events.some((e: ThreadEvent) => e.kind !== 'work' && e.pending);
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
  // What she just sent, a reply or a pick, lands at the end: the page follows it there.
  const yours = useRef<{ key: string; yours: number } | null>(null);
  const yoursNow = thread ? yoursIn(thread.events) : null;
  useEffect(() => {
    if (yoursNow === null) return;
    const key = `${product}/${id}`;
    if (followsHerSend(yours.current, key, yoursNow)) {
      resting.current = true;
      scroll.current?.scrollToEnd({ animated: true });
    }
    yours.current = { key, yours: yoursNow };
  }, [product, id, yoursNow]);
  const walked = useRef<{ product: string; id: string }[]>([]);
  const groups = useGroups();

  const back =() => (router.canGoBack() ? router.back() : router.replace('/'));
  // A thread sent from here, now made by the computer under its own id.
  const made = !thread ? madeThreadOf(c.rows, String(product), String(id)) : null;
  const sentFromHere = !thread && c.rows.commands.some((cmd) => cmd.kind === 'new' && madeHere(cmd.id) === String(id));
  useEffect(() => { if (made) router.replace({ pathname: '/thread/[product]/[id]', params: { product: String(product), id: made } }); }, [made]);
  const gate = screenGate(c);
  if (gate === 'wait') return <Wall><Waiting /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;
  if (!thread) {
    return (
      <Wall>
        <TopBar left={<IconButton label="Back" onPress={back}><Back /></IconButton>} />
        {c.loading ? <Waiting list /> : sentFromHere ? <Waiting list /> : <T style={{ padding: size.inset, color: color.dim }}>This thread is not on your phone.</T>}
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
  // The arrows walk Needs you, as OneThingAtATime.tsx `QueueNav` does; the count beside them was asked off.
  const here = { product: String(product), id: String(id) };
  const inbox = shownTabs(c.tabs, readDisplay('inbox', appStore), c.now, c.view.projectOrder).rows.inbox;
  const inNeedsYou = new Set(inbox.map((r) => r.key));
  const asks = questionsForYou(c.team, c.teamPending)
    .map((q) => ({ ...q, thread: questionThread(q.question, c.view.items) }))
    .filter((q) => !q.thread || !inNeedsYou.has(`${q.thread.product}/${q.thread.id}`));
  const walk = walkKeeping(needsYouOrder(asks, groups.on ? mentionRows(groups.state.mentions, groups.state) : [], inbox), here, walked.current);
  walked.current = walk;
  const walking = !!needsYouSpot(walk, here);
  const step = (dir: 1 | -1) => {
    const to = stepOver(walk, here, dir);
    if (to) router.setParams({ product: to.product, id: to.id });
  };
  const roundKey = foldKey(item);
  const choicesFolded = foldedRounds.includes(roundKey);
  const foldChoices = () => {
    const now = toggleFold(foldedRounds, roundKey);
    setFoldedRounds(now);
    appStore.setItem(CHOICES_FOLDED, JSON.stringify(now));
  };
  // With what the computer says of it while nothing runs, so waiting its turn reads Queued.
  const facts = { session: thread.session, inProgress: thread.inProgress, now: c.now, ...waitFacts(c.view, item.id) };
  const offers = offersOf(item, {
    ...facts,
    asking: c.view.approvals.some((a) => a.product === item.product && a.item === item.id),
    cloud: c.rows.projects.some((p) => p.cloud === true && phoneSlug(p.device, p.project) === item.product),
  });
  const live = liveOf(item, facts);
  const rule = ruleFor(item, c.repeats);
  const press = async (p: Press, on: PressedItem = item, then?: () => void) => {
    setBusy(true); setError(null);
    try { await c.send(p, on); then?.(); return true; } catch (err) { setError(String((err as Error)?.message ?? err)); return false; } finally { setBusy(false); }
  };
  const openThread = (to: { product: string; id: string }) => router.push({ pathname: '/thread/[product]/[id]', params: { product: to.product, id: to.id } });
  const close = () => { if (thread.closeAsk) setAsking(true); else void press({ kind: 'close' }, item, back); };
  const answerAsk = async (option: CloseOption) => {
    setAsking(false);
    if (option.act === 'keep') return;
    if (option.act === 'decide') { scroll.current?.scrollTo({ y: Math.max(0, footList.current - 80), animated: true }); return; }
    for (const kid of thread.waitingFiled) {
      if (!(await press(option.act === 'start' ? { kind: 'approve-filed' } : { kind: 'close' }, kid.item))) return;
    }
    await press({ kind: 'close' }, item, back);
  };
  const pick = (o: ParsedOption) => (closesTheTask(o.text) ? close() : discardsTheChange(o.text) ? setDiscarding(o) : void press({ kind: 'pick', option: o }));
  const answerDiscard = (answer: CloseOption) => {
    const option = discarding;
    setDiscarding(null);
    if (option && answer.act === 'discard') void press({ kind: 'pick', option });
  };
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
    // Sending back with words typed is Send; this link would leave them behind.
    ...(offers.sendBack && !typed ? [{ label: 'send back to agent', onPress: () => void press({ kind: 'send-back' }) }] : []),
    // The desktop's stopped bar ends "try again →" (Focus.tsx `stalled-bar`).
    ...(live?.state === 'stalled' && (offers.tryAgain || offers.restart)
      ? [{ label: 'try again', onPress: () => void press({ kind: offers.tryAgain ? 'try-again' : 'restart' }) }] : []),
  ];

  let prev: Kind | null = null;
  let afterGap = false;
  const blocks = page.answer ? [] : thread.nodes.map((n: ThreadNode, k: number) => {
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
      <TopBar noReview
        left={<IconButton label="Back" onPress={back}><Back /></IconButton>}
        right={<>
          {walking && (
            <>
              <IconButton bare label="Previous thread" onPress={() => step(-1)}><View style={{ opacity: stepOver(walk, here, -1) ? 1 : 0.35 }}><Chevron up /></View></IconButton>
              <IconButton bare label="Next thread" onPress={() => step(1)}><View style={{ opacity: stepOver(walk, here, 1) ? 1 : 0.35 }}><Chevron /></View></IconButton>
            </>
          )}
          {/* Done in a box of its own, left of the dots, as the desktop draws it (threads/ThreadMenu.tsx). */}
          {threadState(item) !== 'done' && (
            <Pressable onPress={close} disabled={busy} accessibilityRole="button" accessibilityLabel="Mark done"
              style={({ pressed }) => ({ height: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 12, paddingRight: 15, borderRadius: corner.pill, backgroundColor: pressed ? color.picked : color.fill })}>
              <DoneMark tint={color.text} />
              <T style={{ fontSize: 14, fontFamily: font.medium, color: color.text }}>Done</T>
            </Pressable>
          )}
          <IconButton label="More" onPress={() => setMenu(true)}><More /></IconButton>
        </>}
      />
      {/* The permission card floats over the foot: the reply box sits 8pt above it and the queued cards' edges (14pt), its own foot room spent. */}
      <KeyboardAvoidingView style={{ flex: 1, paddingBottom: c.approvalRoom ? Math.max(0, c.approvalRoom + 6 - footRoom(inset)) : 0 }} behavior="padding">
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
            <T selectable style={{ fontFamily: font.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.5, marginBottom: 8 }}>{page.title}</T>
            {page.toggle && (
              <Pressable onPress={() => { const open = !earlierOpen; setEarlierOpen(open); setWhole(true); resting.current = open; }} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
                <T style={{ fontSize: 13.5, lineHeight: 18, fontFamily: font.medium, color: color.faint }}>{page.toggle}</T>
              </Pressable>
            )}
            {!!page.context && (
              <Pressable onPress={() => setContextWhole(!contextWhole)} accessibilityRole="button" accessibilityState={{ expanded: contextWhole }}
                style={{ borderRadius: corner.small, backgroundColor: color.fill, paddingVertical: 12, paddingHorizontal: 14 }}>
                <T numberOfLines={contextWhole ? undefined : 3} style={{ fontSize: 14.5, lineHeight: 21, color: color.dim }}>{page.context}</T>
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
                  <T style={{ fontSize: 12.5, color: color.faint }}>{when(page.answer.at)}</T>
                </View>
              )}
              {page.answer.headline && <Selectable style={{ fontFamily: font.semibold, fontSize: 17, lineHeight: 24.65, marginBottom: 8 }}>{page.answer.headline}</Selectable>}
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
                <T style={{ fontSize: 13, fontFamily: font.semibold, color: color.faint, marginBottom: 7 }}>{thread.outcome.label}</T>
              )}
              <Markdown text={thread.outcome.text} dir={dir} files={files} />
            </View>
          )}
          {thread.change && <ChangeCard change={thread.change} product={item.product} id={item.id} />}
          {thread.after.length > 0 && (
            <View style={{ marginTop: 22, gap: 9 }}>
              {thread.after.map((a, k: number) => <ActLine key={`${a.at}-${k}`} act={a} joined={k > 0} />)}
            </View>
          )}
          <View onLayout={(e) => { footList.current = e.nativeEvent.layout.y; }}>
            <FiledList rows={thread.filedAtFoot} label="Filed from this thread" {...filedPresses} />
          </View>
          {asking && thread.closeAsk ? (
            <OptionsCard ask={thread.closeAsk.ask} options={thread.closeAsk.options} busy={busy} pick={(o) => void answerAsk(o as CloseOption)} />
          ) : null}
          {live && <LiveLine live={live} />}
          <ThreadFiles item={item} product={item.product} />
          <FocusActions actions={below} />
          {error && <T style={{ fontSize: 13, color: color.dim, marginTop: 16 }}>{error}</T>}
        </ScrollView>
        {/* The choices sit over the reply box, where the thumb is, and fold away from their small arrow (Focus.tsx `one-choices`). */}
        {discarding && !asking && (
          <View style={{ marginHorizontal: 12, marginTop: 8 }}>
            <OptionsCard foot ask={discardAsk().ask} options={discardAsk().options} busy={busy} pick={(o) => answerDiscard(o as CloseOption)} />
          </View>
        )}
        {thread.options.length > 0 && !asking && !discarding && !choicesFolded && (
          <ScrollView style={{ flexGrow: 0, flexShrink: 0, maxHeight: 260, marginHorizontal: 12, marginTop: 8 }} keyboardShouldPersistTaps="handled">
            <OptionsCard foot onFold={foldChoices} ask={askUnderAnswer(thread.ask, page.answer?.headline ?? splitHeadline(thread.outcome?.text ?? '').headline)} options={thread.options} busy={busy} pick={pick} dir={dir} files={files} />
          </ScrollView>
        )}
        {mate && <ThreadQuestions item={item} />}
        <Dock thread={thread} offers={offers} busy={busy} setBusy={setBusy} setError={setError} stop={() => void press({ kind: 'stop' })}
          foldedChoices={thread.options.length > 0 && !asking && choicesFolded ? thread.options.length : 0} showChoices={foldChoices} onTyped={setTyped} />
      </KeyboardAvoidingView>
      <ThreadMenu open={menu} close={() => setMenu(false)} now={c.now} laterNow={offers.laterNow} runNow={offers.runNow} moveToCloud={offers.moveToCloud}
        onLater={(until, label) => void press({ kind: 'later', until, label, running: !!thread.running }, item, back)}
        onBack={() => void press({ kind: 'later', until: 0 })}
        onRunNow={() => void press({ kind: 'run-now' })}
        onMoveToCloud={() => void press({ kind: 'move-to-cloud' })}
        pinned={item.status === 'done' || item.waitsForMac ? null : !!item.pinned}
        onPin={(pin) => void press({ kind: 'pin', pinned: pin })}
        onUnread={() => { c.markUnseen(item); back(); }}
        tryAgain={offers.tryAgain} onTryAgain={() => void press({ kind: 'try-again' })}
        restart={offers.restart} onRestart={() => void press({ kind: 'restart' })}
        resume={offers.resume} onResume={() => void press({ kind: 'resume' })}
        reopen={offers.reopen} onReopen={() => void press({ kind: 'reopen' })}
        priority={offers.priority ? priorityValueOf(shownLevel(item)) : null} onPriority={(value) => void press({ kind: 'priority', value })}
        name={offers.rename ? thread.title : null} onRename={(label) => void press({ kind: 'rename', label })}
        projects={offers.move ? moveChoices(item, c.view.products) : []} onMove={(to) => void press({ kind: 'move', to: to.slug, name: to.name }, item, back)}
        place={offers.place} onPlace={(keep) => void press({ kind: 'keep-here', keep })}
        repeats={!!rule} onEndRepeat={() => { if (rule) void press({ kind: 'end-repeat', rule }); }}
        onReport={() => router.push({ pathname: '/settings/feedback', params: { report: `${product}/${id}`, title: item.title ?? '', answer: (page.answer ? [page.answer.headline, page.answer.rest].filter(Boolean).join('\n\n') : thread.outcome?.text ?? '').slice(0, 4000) } })}
        closed={threadState(item) === 'done'} />
    </Wall>
  );
}
