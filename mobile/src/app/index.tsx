// Threads, as the phone layout draws them (renderer/src/phone.css): the four
// tabs as words under the title, each row its title over the project and
// age, and a new thread under the thumb. Or, picked in View and filters, the
// board: one column a swipe.
import { Redirect } from 'expo-router';
import { router } from '../lib/router';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { backWords, emptyTabWords, readDisplay, rowPriorityId, writeDisplay, filteredEmptyWords, updatedWords, type Display } from '../../../renderer/src/threads/page-rules';
import { InboxComposer } from '../ui/NewThreadForm';
import { closeWords, COUNT_GAP, filterCount, moreToTheRight, phoneBoard, shownTabs, TAB_GAP, tabsScale, tabsTighten, type Row, type TabId } from '../lib/tabs';
import { agentChoices, type Harness } from '../lib/agent-filter';
import { FilesPlace } from '../ui/FilesPlace';
import { bottomTabs, type PlaceId } from '../lib/groups';
import { useGroups } from '../state/groups';
import { GroupsPlace } from '../ui/Groups';
import { ChatsPlace, TeammateMark, teammatesWaiting } from '../ui/Teammates';
import { Face } from '../ui/Groups';
import { mentionRows } from '../../../renderer/src/team/rooms/room-rules';
import { mateOf, questionThread, questionsForYou } from '../lib/teammates';
import type { RoomMention as MentionRowData, Teammate, WorkItem } from '../../../renderer/src/types';
import { appStore } from '../platform/persist';
import { useCloud } from '../state/cloud';
import { Magnifier, StateGlyph, ViewButton, ViewMenu } from '../ui/Filters';
import { AgentMark, Cloud, Gear, More, Pen, Pin, Repeat, Tick } from '../ui/icons';
import { LaterSheet } from '../ui/Later';
import { inLater, pickedActs, pickedPriority, pickedResume } from '../lib/picked';
import { priorityIdOf, priorityLabelOf } from '../../../renderer/src/priority';
import { Waiting } from '../ui/LogoOrbit';
import { repeatRow, repeatTag } from '../../../renderer/src/repeat-words';
import type { PhoneRepeat } from '../../../renderer/src/phone-repeats';
import { barsFor, PriorityRows } from '../ui/Pickers';
import { Caps, footRoom, IconButton, Squish, PriorityBars, RunningMark, SheetRow, T, TopBar, Wall } from '../ui/parts';
import { color, corner, font, lift, size } from '../ui/theme';
import { StatusNotice } from '../ui/StatusNotice';
import { ComputerWait } from '../ui/Onboarding';
import { ALERTS_ASKED_KEY, FIRST_RUN, nextSetup } from '../lib/first-run';
import { skipWait, waitNotice, waitSkipped } from '../lib/computer-wait';
import { alertsHere } from '../platform/alerts';
import { previewWalksFirstRun } from '../lib/preview';
import { PEN } from '../lib/overlays';
import { Swiped } from '../ui/Swiped';
import { feel } from '../lib/feel';

const open = (product: string, id: string) => router.push({ pathname: '/thread/[product]/[id]', params: { product, id } });

// Picking threads to close together: long-press a row, or Select threads in View.
const RowActs = createContext<{ close: (i: WorkItem) => void; later: (i: WorkItem) => void }>({ close: () => {}, later: () => {} });
const Picking = createContext<{ picked: Set<string> | null; toggle: (key: string) => void; start: (key: string) => void }>({ picked: null, toggle: () => {}, start: () => {} });

/** The line over every row but the first, short of both edges. */
const Parted = ({ first }: { first: boolean }) => (first ? null : <View style={{ position: 'absolute', top: 0, left: size.inset, right: size.inset, height: 1, backgroundColor: color.rowLine }} />);
const rowBox = (pressed: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 14, paddingHorizontal: size.inset, backgroundColor: pressed ? color.fill : 'transparent' });
// One line height for every line of a row's words, so two lines are as tall whatever they say.
const LINE = 21;
const rowHead = { fontSize: 16, lineHeight: LINE, letterSpacing: -0.2 };
const rowWords = () => ({ fontSize: 15, lineHeight: LINE, color: color.dim });
const FACE = 20;
/** A row's small words: where it is from, how long ago. */
const metaWords = () => ({ fontSize: 13.5, lineHeight: 20, color: color.faint });
const Dot = () => <T style={metaWords()}>·</T>;
/** What a row waits on, as the website writes a status: `mine` is what waits on you, in the orange. */
const Chip = ({ children, mine = false }: { children: string; mine?: boolean }) => <Caps tint={mine ? color.accent : color.dim} style={{ lineHeight: 18 }}>{children}</Caps>;
/** The unread dot in the margin, level with who the row is from. */
const Unread = () => <View style={{ position: 'absolute', left: 7, top: 21, width: 7, height: 7, borderRadius: 4, backgroundColor: color.accent }} />;

/** Every row of the inbox: who and when on one line, then room for two lines of words, so no row is taller than the next. */
function Shape({ mark, who, where, when, ends, children }: { mark: ReactNode; who: string; where?: string; when?: string; ends?: ReactNode; children: ReactNode }) {
  const meta = metaWords();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 20, gap: 7 }}>
        {mark}
        <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.medium, fontSize: 14, lineHeight: 20 }}>{who}</T>
        {!!where && <><Dot /><T numberOfLines={1} style={{ ...meta, flexShrink: 2 }}>{where}</T></>}
        <View style={{ flex: 1, minWidth: 4 }} />
        {ends}
        {!!when && <T style={meta}>{when}</T>}
      </View>
      <View style={{ minHeight: LINE * 2, marginTop: 4 }}>{children}</View>
    </View>
  );
}

function ThreadRow({ row, first, unread, mate }: { row: Row; first: boolean; unread: boolean; mate: Teammate | null }) {
  const pick = useContext(Picking);
  const picking = pick.picked !== null;
  const on = !!pick.picked?.has(row.key);
  // "not started" or "2 tasks to approve" (Pages.tsx `RowCells`).
  const aside = row.held ? 'not started' : row.toApprove;
  const detail = !!aside || row.queued || row.away || !!row.summary;
  const acts = useContext(RowActs);
  return (
    <Swiped off={picking} onClose={() => acts.close(row.item)} onLater={() => acts.later(row.item)}>
    <Pressable onPress={() => (picking ? pick.toggle(row.key) : open(row.product, row.id))} onLongPress={() => pick.start(row.key)} delayLongPress={350}
      accessibilityLabel={picking ? `${row.title}, ${on ? 'selected' : 'not selected'}` : unread ? `${row.title}, unread` : undefined} accessibilityState={picking ? { checked: on } : undefined}
      style={({ pressed }) => rowBox(pressed)}>
      <Parted first={first} />
      {unread && <Unread />}
      {picking && <View style={{ width: 22, height: 22, marginRight: 12, borderWidth: 1.5, borderRadius: 11, borderColor: on ? color.text : color.lineStrong, backgroundColor: on ? color.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on && <Tick size={13} tint={color.bg} />}</View>}
      {/* A thread a teammate's run sent you is named for the teammate; any other for the agent that ran it. */}
      <Shape mark={mate ? <TeammateMark t={mate} size={FACE} /> : <AgentMark harness={row.harness} size={FACE} />} who={mate ? mate.name : row.harness === 'codex' ? 'Codex' : 'Claude Code'} where={row.projectName} when={row.when}
        ends={<>
          {/* A closed thread keeps no pin. */}
          {row.item?.pinned && row.item.status !== 'done' && <View accessibilityLabel="Pinned"><Pin /></View>}
          {row.priority && <View accessibilityLabel={row.priority === 'urgent' ? 'Urgent' : 'High priority'}><PriorityBars level={row.priority === 'urgent' ? 4 : 3} /></View>}
          {row.running && <RunningMark cloud={row.cloud}><Cloud /></RunningMark>}
        </>}>
        <T numberOfLines={detail ? 1 : 2} style={{ ...rowHead, fontFamily: unread ? font.semibold : font.regular }}>{row.title}</T>
        {detail && (
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: LINE, gap: 8 }}>
            {!!aside && <Chip mine={!row.held}>{aside}</Chip>}
            {/* Sent from the phone and not yet taken: the web app's status word (status-word.ts). */}
            {row.queued && <Chip>Queued</Chip>}
            {row.away && <Chip>Computer offline</Chip>}
            {!!row.summary && <T numberOfLines={1} style={{ ...rowWords(), flex: 1 }}>{row.summary}</T>}
          </View>
        )}
      </Shape>
    </Pressable>
    </Swiped>
  );
}

/** A message in a group that names you, at the top of Needs you until you read the group past it (team/rooms/MentionRows.tsx). */
function MentionRow({ m, first, now, open }: { m: MentionRowData; first: boolean; now: number; open: () => void }) {
  return (
    <Pressable onPress={open} accessibilityLabel={`${m.byName || 'Someone'} mentioned you in ${m.roomName}, unread`}
      style={({ pressed }) => rowBox(pressed)}>
      <Parted first={first} />
      <Unread />
      <Shape mark={<Face name={m.byName || 'Someone'} size={FACE} />} who={m.byName || 'Someone'} where={`# ${m.roomName}`} when={updatedWords(m.at, now)}>
        <T numberOfLines={2} style={{ ...rowWords(), color: color.text }}>{m.body}</T>
      </Shape>
    </Pressable>
  );
}

/** An AI teammate asking you something, at the top of Needs you with the mentions, until you answer it. */
function QuestionRow({ mate, text, at, first, now, open }: { mate: Teammate; text: string; at: number; first: boolean; now: number; open: () => void }) {
  return (
    <Pressable onPress={open} accessibilityLabel={`${mate.name} asks you: ${text}`}
      style={({ pressed }) => rowBox(pressed)}>
      <Parted first={first} />
      <Unread />
      <Shape mark={<TeammateMark t={mate} size={FACE} />} who={mate.name} when={updatedWords(at, now)}>
        <T numberOfLines={2} style={{ ...rowWords(), color: color.text }}>{text}</T>
      </Shape>
    </Pressable>
  );
}

/** Repeating tasks above what is put off, as the desktop's Later tab has them (List.tsx). */
function RepeatRows({ repeats, items, now }: { repeats: PhoneRepeat[]; items: WorkItem[]; now: number }) {
  return (
    <View style={{ paddingBottom: 8 }}>
      <Caps style={{ paddingHorizontal: size.inset, paddingTop: 16, paddingBottom: 2 }}>Repeating</Caps>
      {repeats.map((r, i) => {
        const last = r.lastOccurrence ? items.find((it) => it.id === r.lastOccurrence) ?? null : null;
        const words = repeatRow(r, last, now);
        return (
          <Pressable key={`${r.product}/${r.id}`} onPress={() => router.push({ pathname: '/repeat/[product]/[id]', params: { product: r.product, id: r.id } })}
            style={({ pressed }) => rowBox(pressed)}>
            <Parted first={i === 0} />
            <Shape mark={<View style={{ width: FACE, height: FACE, alignItems: 'center', justifyContent: 'center' }}><Repeat /></View>} who={repeatTag(r)} where={r.productName}>
              <T numberOfLines={1} style={rowHead}>{r.title}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: LINE, gap: 8 }}>
                {r.waiting && <Chip>Queued</Chip>}
                <T numberOfLines={1} style={{ ...rowWords(), flex: 1 }}>{`Next ${words.when}`}</T>
              </View>
            </Shape>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The tabs under the title, inside the top bar, with Groups fifth while it
 * is on: a pill each, the picked one filled. They stay at the top ("all that
 * stuff is best placed at the top") and scroll sideways when they do not fit. */
function Tabs({ on, counts, pick, team, board = false }: { on: PlaceId; counts: Record<PlaceId, number>; pick: (t: PlaceId) => void; team: boolean; board?: boolean }) {
  const [span, setSpan] = useState({ view: 0, content: 0, x: 0 });
  const tabs = bottomTabs(team, board);
  // The board's one tab is lit whichever state was open under it.
  if (board && on !== 'chats' && on !== 'files') on = 'inbox';
  const counted = tabs.filter((t) => t.id !== 'done' && counts[t.id] > 0).length;
  const [tight, setTight] = useState(false);
  useEffect(() => { setTight((now) => tabsTighten(span, now, { tabs: tabs.length, counted })); }, [span.view, span.content, tabs.length, counted]);
  const [fit, setFit] = useState({ scale: 1, measuredAt: 0 });
  useEffect(() => { setFit((now) => tabsScale(span, tight, now)); }, [span.view, span.content, tight]);
  const words = { fontSize: 15 * fit.scale, count: 12.5 * fit.scale };
  return (
    <View style={{ height: size.tabs, flexDirection: 'row', alignItems: 'center' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingLeft: size.inset - 12, paddingRight: 8, gap: tight ? TAB_GAP.tight : TAB_GAP.loose }}
        onLayout={(e) => { const view = e.nativeEvent.layout.width; setSpan((s) => ({ ...s, view })); }}
        onContentSizeChange={(content) => setSpan((s) => ({ ...s, content }))}
        onScroll={(e) => { const x = e.nativeEvent.contentOffset.x; setSpan((s) => ({ ...s, x })); }} scrollEventThrottle={32}>
        {tabs.map((t) => (
          <Pressable key={t.id} onPress={() => { if (on !== t.id) feel.pick(); pick(t.id); }} accessibilityRole="tab" accessibilityState={{ selected: on === t.id }}
            style={{ height: 36, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderRadius: corner.pill, backgroundColor: on === t.id ? color.graphite : 'transparent' }}>
            <T style={{ fontSize: words.fontSize, lineHeight: 20, fontFamily: font.medium, color: on === t.id ? color.ink : color.dim }}>{t.label}</T>
            {t.id !== 'done' && counts[t.id] > 0 && <T style={{ fontSize: words.count, lineHeight: 20, fontFamily: font.medium, marginLeft: tight ? COUNT_GAP.tight : COUNT_GAP.loose, color: on === t.id ? color.ink : color.faint, opacity: on === t.id ? 0.62 : 1 }}>{counts[t.id]}</T>}
          </Pressable>
        ))}
      </ScrollView>
      {moreToTheRight(span) && <EdgeFade />}
    </View>
  );
}

/** Tabs still past the edge fade out there, so the row reads as one that scrolls. */
function EdgeFade() {
  return (
    <Svg style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 32 }} width={32} height="100%" pointerEvents="none">
      <Defs><LinearGradient id="tabs-fade" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={color.bg} stopOpacity={0} /><Stop offset="1" stopColor={color.bg} stopOpacity={1} /></LinearGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#tabs-fade)" />
    </Svg>
  );
}

/** A quiet button in the empty states. */
function Outlined({ label, onPress, lead }: { label: string; onPress: () => void; lead?: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ alignSelf: 'flex-start', height: 40, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: corner.pill, backgroundColor: pressed ? color.picked : color.fill })}>
      {lead}
      <T style={{ fontSize: 15, fontFamily: font.medium, color: color.text }}>{label}</T>
    </Pressable>
  );
}

const H2 = ({ children }: { children: string }) => <T style={{ fontFamily: font.medium, fontSize: 22, lineHeight: 28, letterSpacing: -0.8, marginBottom: 10 }}>{children}</T>;

/** The empty inbox is where the next thread starts: the New thread form drawn open on the page (Pages.tsx `InboxClear`). */
function InboxClear() {
  return (
    <View style={{ paddingTop: 32, paddingBottom: 40, paddingHorizontal: 12 }}>
      <View style={{ paddingHorizontal: 4, marginBottom: 8 }}><H2>Nothing needs you</H2></View>
      <InboxComposer />
    </View>
  );
}

/** A tab only empty because of a filter says how many it hides (Pages.tsx `FilteredEmpty`). */
function FilteredEmpty({ tab, hidden, clear }: { tab: TabId; hidden: number; clear: () => void }) {
  const { head, line } = filteredEmptyWords(tab, hidden);
  return (
    <View style={{ paddingTop: 40, paddingBottom: 40, paddingLeft: 32, paddingRight: 24 }}>
      <View style={{ marginBottom: 14, marginLeft: -1 }}><Tick tint="rgba(238, 96, 24, 0.55)" /></View>
      <H2>{head}</H2>
      <T style={{ fontSize: 14, lineHeight: 21, color: color.faint, marginBottom: 22 }}>{line}</T>
      <Outlined label="Clear filters" onPress={clear} />
    </View>
  );
}

/** The board: a column a swipe, each scrolling on its own (phone.css `.th-board`). */
const SHADE = 16;
function Board({ columns, foot }: { columns: ReturnType<typeof phoneBoard>; foot: number }) {
  const inset = 12;
  const { width } = useWindowDimensions();
  const c0 = useCloud();
  const room = c0.approvalRoom;
  // Later's column leads with the repeating tasks, as the Later list does.
  const repeatsIn = (state: string) => (state === 'scheduled' ? c0.repeats : []);
  const col = Math.round((width - inset * 2) * 0.86);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={col + 12} decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: inset, gap: 12 }} style={{ flex: 1 }}>
      {columns.map((c) => (
        <ScrollView key={c.state} style={{ width: col + SHADE * 2, marginHorizontal: -SHADE }} contentContainerStyle={{ paddingHorizontal: SHADE, paddingBottom: Math.max(88 + foot, room + 16) }} showsVerticalScrollIndicator={false}>
          <View style={{ height: 38, paddingTop: 8, flexDirection: 'row', alignItems: 'center' }}>
            <StateGlyph state={c.state} />
            <T style={{ fontFamily: font.semibold, fontSize: 14, color: color.text }}>{c.label}</T>
            <T style={{ fontFamily: font.medium, fontSize: 13, color: color.faint, marginLeft: 8 }}>{c.rows.length + repeatsIn(c.state).length}</T>
          </View>
          {repeatsIn(c.state).map((r) => (
            <Pressable key={`${r.product}/${r.id}`} onPress={() => router.push({ pathname: '/repeat/[product]/[id]', params: { product: r.product, id: r.id } })}
              style={({ pressed }) => ({ marginBottom: 10, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 14, borderRadius: corner.card, backgroundColor: pressed ? color.raised : color.card, ...lift('card') })}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
                <View style={{ marginRight: 8, marginTop: 2 }}><Repeat /></View>
                <T numberOfLines={3} style={{ flex: 1, fontSize: 15.5, lineHeight: 21 }}>{r.title}</T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {r.waiting && <T style={{ fontSize: 12.5, color: color.dim, marginRight: 8 }}>Queued</T>}
                <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, color: color.faint }}>{r.productName}</T>
                <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, color: color.faint, marginLeft: 8 }}>{`Next ${repeatRow(r, r.lastOccurrence ? c0.view.items.find((it: any) => it.id === r.lastOccurrence) ?? null : null, c0.now).when}`}</T>
              </View>
            </Pressable>
          ))}
          {c.rows.map((e) => (
            <Pressable key={e.key} onPress={() => e.item && open(e.item.product, e.item.id)}
              style={({ pressed }) => ({ marginBottom: 10, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 14, borderRadius: corner.card, backgroundColor: pressed ? color.raised : color.card, ...lift('card') })}>
              <T numberOfLines={3} style={{ fontSize: 15.5, lineHeight: 21, marginBottom: 14 }}>{e.title}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {e.queued ? <T style={{ fontSize: 12.5, color: color.dim, marginRight: 8 }}>Queued</T> : e.live && <View style={{ marginRight: 8 }}><RunningMark /></View>}
                {rowPriorityId(e.priority) && <View style={{ marginRight: 8 }}><PriorityBars level={barsFor(e.priority!)} /></View>}
                {/* A teammate's run is named for the teammate, as its row in the list is. */}
                {(mateOf(e.item, c0.team)?.name ?? e.agent) && <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, color: color.dim, marginRight: 8 }}>{mateOf(e.item, c0.team)?.name ?? e.agent}</T>}
                <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, color: color.faint }}>{e.project}</T>
                {c.state === 'scheduled' && e.item && !!backWords(e.item, c0.now) && <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, color: color.faint, marginLeft: 8 }}>{backWords(e.item, c0.now)}</T>}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ))}
    </ScrollView>
  );
}

export default function Threads() {
  const c = useCloud();
  // The first run's steps after sign-in, in order (lib/first-run.ts); the computer's is drawn here.
  const walking = c.preview && previewWalksFirstRun();
  const [, setSkippedAt] = useState(0);
  const skipped = !!c.connect && waitSkipped(appStore, c.connect.email);
  const skip = () => { if (c.connect) skipWait(appStore, c.connect.email); setSkippedAt(Date.now()); };
  const notice = c.status ? { message: c.status, next: null } : waitNotice(c.connect);
  const next = c.preview && !walking ? null : nextSetup({
    signedIn: c.signedIn, started: !c.loading, connect: !!c.connect && !skipped, noticeAnswered: !!c.notice,
    alertsOn: !!c.alerts, alertsAsked: !!appStore.getItem(ALERTS_ASKED_KEY), alertsHere: alertsHere || walking,
  });
  useEffect(() => {
    if (!c.signedIn) { FIRST_RUN.reset(); return; }
    if (!c.noticeRead || (next !== 'messages' && next !== 'alerts') || !FIRST_RUN.take(next)) return;
    if (next === 'messages') router.push({ pathname: '/ai-notice', params: { first: '1' } });
    else router.push('/alerts');
  }, [next, c.noticeRead, c.signedIn]);
  const inset = useSafeAreaInsets();
  const groups = useGroups();
  const [place, setPlace] = useState<PlaceId>('inbox');
  // A group opened from Chats or a card, drawn in Chats' place until you go back to where you were.
  const [chatGroup, setChatGroup] = useState<PlaceId | null>(null);
  // Groups and teammates both off on the computer while open: back to the threads.
  const teamMode = !!c.team || groups.on;
  const onChats = teamMode && place === 'chats';
  const onFiles = place === 'files';
  const tab: TabId = place === 'chats' || place === 'files' ? 'inbox' : place;
  const openGroup = (id: string) => { groups.setLast(id); setChatGroup(place); setPlace('chats'); };
  // A command from Search (app/search.tsx).
  useEffect(() => {
    const w = c.wanted;
    if (!w) return;
    c.takeWanted();
    setChatGroup(w.group ? 'chats' : null);
    if (w.menu) setMenu(true);
    setPlace(w.place);
  }, [c.wanted]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pulling, setPulling] = useState(false);
  const [menu, setMenu] = useState(false);
  // Remembered between launches, as the site keeps it in the page's storage.
  const [display, setDisplayRaw] = useState<Display>(() => readDisplay('inbox', appStore));
  const setDisplay = (d: Display) => { setDisplayRaw(d); writeDisplay('inbox', d, appStore); };
  // Not kept between launches, as the desktop's filter is not.
  const [agent, setAgent] = useState<Harness | null>(null);
  const order = c.view.projectOrder;
  const shown = useMemo(() => shownTabs(c.tabs, display, c.now, order, agent), [c.tabs, display, c.now, order, agent]);
  const board = useMemo(() => (display.view === 'board' ? phoneBoard(c.view, c.tabs, display, c.now, agent) : null), [display, c.view, c.tabs, c.now, agent]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [closing, setClosing] = useState(false);
  const [pickedMenu, setPickedMenu] = useState(false);
  const [pickingLevel, setPickingLevel] = useState(false);
  useEffect(() => { setPicked(null); }, [place, tab]);
  const [laterOne, setLaterOne] = useState<WorkItem | null>(null);
  const rowActs = useMemo(() => ({ close: (i: WorkItem) => { void c.closeAll([i]); }, later: (i: WorkItem) => setLaterOne(i) }), [c.closeAll]);
  if (!c.opened) return <Wall><Waiting /></Wall>;
  if (!c.signedIn) return <Redirect href="/sign-in" />;
  const rows = shown.rows[tab];
  // Later counts its repeating tasks too, as the desktop's does (App.tsx `scheduledCount`).
  // Messages in your groups that name you lead Needs you, and count in it (App.tsx `MentionRows`).
  const mentions = groups.on ? mentionRows(groups.state.mentions, groups.state) : [];
  // A teammate's question waits where you read, not only in Chats; counted on every tab.
  // One asked in a thread opens it, as the desktop answers it there; already in Needs you, its row is that thread's.
  const inNeedsYou = new Set(shown.rows.inbox.map((r) => r.key));
  const asks = questionsForYou(c.team, c.teamPending)
    .map((q) => ({ ...q, thread: questionThread(q.question, c.view.items) }))
    .filter((q) => !q.thread || !inNeedsYou.has(`${q.thread.product}/${q.thread.id}`));
  const openMention = (m: MentionRowData) => openGroup(m.roomId);
  const counts = { inbox: shown.rows.inbox.length + mentions.length + asks.length, progress: shown.rows.progress.length, snoozed: shown.rows.snoozed.length + c.repeats.length, done: shown.rows.done.length, chats: teammatesWaiting(c) + (groups.on ? groups.unread : 0), files: 0 };
  const repeatsShown = tab === 'snoozed' && c.repeats.length > 0;
  const mentionsShown = tab === 'inbox' && (mentions.length > 0 || asks.length > 0);
  const hidden = shown.whole[tab] - shown.rows[tab].length;
  const foot = footRoom(inset);
  const picking = {
    picked,
    toggle: (key: string) => setPicked((p) => { const n = new Set(p ?? []); if (n.has(key)) n.delete(key); else n.add(key); return n; }),
    start: (key: string) => setPicked((p) => new Set([...(p ?? []), key])),
  };
  const closePicked = async () => {
    setClosing(true);
    try { await c.closeAll(rows.filter((r) => picked?.has(r.key)).map((r) => r.item)); setPicked(null); } finally { setClosing(false); }
  };
  const pickedItems = rows.filter((r) => picked?.has(r.key)).map((r) => r.item);
  const acts = pickedActs(pickedItems, { tab, unread: c.unread });
  const pickedDone = () => { setPickedMenu(false); setPickingLevel(false); setPicked(null); };
  const laterPicked = (until: number, label?: string) => { pickedDone(); void c.laterAll(pickedItems, until, label); };
  const working = (i: { id: string; product: string }) => c.view.running.some((r: { itemId: string; product: string }) => r.itemId === i.id && r.product === i.product);
  const resumable = pickedResume(pickedItems, working);
  const level = pickedPriority(pickedItems);
  const unfiltered: Display = { ...display, priorities: [], projects: [], updated: 'any', privacy: 'any' };
  const clear = () => { setDisplay(unfiltered); setAgent(null); };
  const agents = agentChoices(board ? Object.values(c.tabs).flat() : c.tabs[tab], display, c.now, agent);
  const menuCount = () => {
    const wholeBoard = board ? phoneBoard(c.view, c.tabs, unfiltered, c.now) : null;
    const above = mentionsShown ? mentions.length + asks.length : repeatsShown ? c.repeats.length : 0;
    return filterCount({ rows: shown.rows[tab], whole: c.tabs[tab], above, board, wholeBoard });
  };
  // A permission card sits over the corner the pen is in, so the pen moves up to the bar (8fa6c548).
  const penUp = c.view.approvals.length > 0;
  // The empty inbox draws the form itself, so it needs no pen.
  const inboxEmpty = tab === 'inbox' && rows.length === 0 && hidden === 0 && !c.loading && !mentionsShown;
  if (c.connect && !skipped) return <ComputerWait email={c.connect.email} signOut={c.signOut} skip={skip} />;
  if (onChats) {
    return (
      <Wall>
        {chatGroup && groups.on
          ? <GroupsPlace onBack={() => { setPlace(chatGroup); setChatGroup(null); }} />
          : <ChatsPlace tabs={<Tabs on="chats" counts={counts} pick={setPlace} team board={!!board} />} openGroup={(id) => { groups.setLast(id); setChatGroup('chats'); }} />}
      </Wall>
    );
  }
  if (onFiles) return <Wall><FilesPlace tabs={<Tabs on="files" counts={counts} pick={setPlace} team={teamMode} board={!!board} />} /></Wall>;
  const list = (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={({ item, index }) => <ThreadRow row={item} first={index === 0 && !repeatsShown && !mentionsShown} unread={c.unread(item.item)} mate={mateOf(item.item, c.team)} />}
      refreshControl={<RefreshControl tintColor={color.dim} refreshing={pulling} onRefresh={async () => { setPulling(true); await c.refresh(); setPulling(false); }} />}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={repeatsShown ? <RepeatRows repeats={c.repeats} items={c.view.items} now={c.now} />
        : mentionsShown ? <View>
          {asks.map((q, i) => <QuestionRow key={q.question.id} mate={q.mate} text={q.question.text ?? ''} at={q.question.ts} first={i === 0} now={c.now} open={() => (q.thread ? router.push({ pathname: '/thread/[product]/[id]', params: q.thread }) : router.push({ pathname: '/teammate/[id]', params: { id: q.mate.id } }))} />)}
          {mentions.map((m, i) => <MentionRow key={m.id} m={m} first={i === 0 && !asks.length} now={c.now} open={() => openMention(m)} />)}
        </View> : undefined}
      ListEmptyComponent={c.loading ? <Waiting list /> : repeatsShown || mentionsShown ? undefined : hidden > 0 ? <FilteredEmpty tab={tab} hidden={hidden} clear={clear} />
        : tab === 'inbox' ? <InboxClear />
          : <T style={{ paddingHorizontal: 24, paddingTop: 32, textAlign: 'center', fontSize: 14, lineHeight: 21, color: color.faint }}>{emptyTabWords(tab, false, counts.inbox)}</T>}
      contentContainerStyle={{ paddingBottom: Math.max(picked ? 120 : 96, c.approvalRoom + 16) }}
    />
  );
  return (
    <Picking.Provider value={picking}>
    <RowActs.Provider value={rowActs}>
    <Wall>
      <TopBar title="Inbox" right={<>
        <IconButton label="Search threads" onPress={() => router.push('/search')}><Magnifier size={18} /></IconButton>
        {penUp && <IconButton label="New thread" onPress={() => router.push('/new')}><Pen size={18} tint={color.dim} /></IconButton>}
        <ViewButton display={display} agent={agent} open={menu} onPress={() => setMenu(!menu)} />
        <IconButton label="Settings" onPress={() => router.push('/settings')}><Gear /></IconButton>
      </>} below={<Tabs on={tab} counts={board ? { ...counts, inbox: 0 } : counts} pick={setPlace} team={teamMode} board={!!board} />} />
      <StatusNotice message={notice?.message} next={notice?.next} />
      {board ? <Board columns={board} foot={foot} /> : list}
      {picked && (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: foot, height: 60, paddingLeft: 20, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: corner.pill, backgroundColor: color.pop, ...lift('float') }}>
          <T style={{ flex: 1, fontSize: 15, color: color.dim }}>{picked.size ? `${picked.size} selected` : 'Tap threads to select them'}</T>
          {picked.size > 0 && <IconButton label="More" onPress={() => setPickedMenu(true)}><More /></IconButton>}
          <Pressable onPress={() => setPicked(null)} accessibilityRole="button" style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: corner.pill, backgroundColor: pressed ? color.picked : 'transparent' })}>
            <T style={{ fontSize: 15, color: color.dim }}>Cancel</T>
          </Pressable>
          {acts.includes('close') && (
            <Pressable disabled={!picked.size || closing} onPress={() => void closePicked()} accessibilityRole="button"
              style={({ pressed }) => ({ height: 40, paddingHorizontal: 18, justifyContent: 'center', borderRadius: corner.pill, backgroundColor: pressed ? color.text : color.graphite, opacity: !picked.size || closing ? 0.4 : 1 })}>
              <T style={{ fontSize: 15, fontFamily: font.semibold, color: color.ink }}>{closing ? 'Closing…' : closeWords(picked.size)}</T>
            </Pressable>
          )}
        </View>
      )}
      {/* Later as one thread's More sheet has it, then the rest of the desktop's commands on ticked rows. */}
      <LaterSheet visible={pickedMenu} onClose={() => { setPickedMenu(false); setPickingLevel(false); }} onPick={laterPicked}
        onNow={inLater(pickedItems, c.now) ? () => laterPicked(0) : undefined}
        instead={pickingLevel && level ? <PriorityRows value={level.value} pick={(value) => { pickedDone(); void c.pressPicked(pickedItems, { kind: 'priority', value }); }} /> : undefined}>
        {resumable && <SheetRow label="Resume agents" aside={resumable.ids.length < resumable.of ? `${resumable.ids.length} of ${resumable.of}` : undefined}
          onPress={() => { pickedDone(); void c.pressPicked(pickedItems, { kind: 'resume' }); }} />}
        {level && <SheetRow label="Priority" aside={level.value === null ? undefined : priorityLabelOf(priorityIdOf(level.value))} onPress={() => setPickingLevel(true)} />}
        {acts.includes('read') && <SheetRow label="Mark read" onPress={() => { pickedItems.forEach((i) => c.markSeen(i)); pickedDone(); }} />}
        {acts.includes('unread') && <SheetRow label="Mark unread" onPress={() => { pickedItems.forEach((i) => c.markUnseen(i)); pickedDone(); }} />}
      </LaterSheet>
      {!picked && !penUp && !(inboxEmpty && !board) && <Squish accessibilityLabel="New thread" onPress={() => router.push('/new')}
        style={{
          position: 'absolute', right: PEN.right, bottom: foot + PEN.lift, width: PEN.size, height: PEN.size, borderRadius: PEN.size / 2,
          backgroundColor: color.graphite, ...lift('float'),
        }}>
        <Pen />
      </Squish>}
      {menu && <ViewMenu display={display} onDisplay={setDisplay} agent={agent} agents={agents} onAgent={setAgent} products={c.view.products} items={c.view.items} {...menuCount()} tab={tab} close={() => setMenu(false)}
        onSelect={rows.length && !board ? () => { setMenu(false); setPicked(new Set()); } : undefined} />}
      <LaterSheet visible={!!laterOne} onClose={() => setLaterOne(null)} onPick={(until, label) => { const i = laterOne; setLaterOne(null); if (i) void c.laterAll([i], until, label); }}
        onNow={laterOne && inLater([laterOne], c.now) ? () => { const i = laterOne; setLaterOne(null); void c.laterAll([i], 0); } : undefined} />
    </Wall>
    </RowActs.Provider>
    </Picking.Provider>
  );
}
