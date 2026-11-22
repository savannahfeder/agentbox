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
import { closeWords, COUNT_GAP, filterCount, moreToTheRight, phoneBoard, shownTabs, TAB_GAP, TABS, tabsScale, tabsTighten, type Row, type TabId } from '../lib/tabs';
import { evViewOf, keepEvView, myItems, type EvView } from '../lib/everything';
import { agentChoices, type Harness } from '../lib/agent-filter';
import { EverythingPlace } from '../ui/Everything';
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
import { Cloud, Gear, More, Pen, Pin, Repeat, Tick } from '../ui/icons';
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
const rowBox = (pressed: boolean) => ({ minHeight: 68, paddingVertical: 14, paddingLeft: size.inset, paddingRight: size.inset, backgroundColor: pressed ? color.fill : 'transparent' });
const rowTitle = { flexShrink: 1, fontSize: 16.5, lineHeight: 22, letterSpacing: -0.2 };
// A face rides the name's line, so a row's words keep the whole width.
const FACE = 20;
const nameLine = { flexDirection: 'row', alignItems: 'center', gap: 7 } as const;
/** A row's small second line: project, who, how long ago. */
const metaWords = () => ({ fontSize: 13.5, lineHeight: 18, color: color.faint });
const Dot = () => <T style={metaWords()}>·</T>;
/** What a row waits on, as the website writes a status: `mine` is what waits on you, in the orange. */
const Chip = ({ children, mine = false }: { children: string; mine?: boolean }) => <Caps tint={mine ? color.accent : color.dim} style={{ lineHeight: 18 }}>{children}</Caps>;

function ThreadRow({ row, first, unread, mate }: { row: Row; first: boolean; unread: boolean; mate: Teammate | null }) {
  const pick = useContext(Picking);
  const picking = pick.picked !== null;
  const on = !!pick.picked?.has(row.key);
  // "not started" or "2 tasks to approve" (Pages.tsx `RowCells`).
  const aside = row.held ? 'not started' : row.toApprove;
  const meta = metaWords();
  const acts = useContext(RowActs);
  return (
    <Swiped off={picking} onClose={() => acts.close(row.item)} onLater={() => acts.later(row.item)}>
    <Pressable onPress={() => (picking ? pick.toggle(row.key) : open(row.product, row.id))} onLongPress={() => pick.start(row.key)} delayLongPress={350}
      accessibilityLabel={picking ? `${row.title}, ${on ? 'selected' : 'not selected'}` : unread ? `${row.title}, unread` : undefined} accessibilityState={picking ? { checked: on } : undefined}
      style={({ pressed }) => rowBox(pressed)}>
      <Parted first={first} />
      {/* The unread dot in the margin, level with the title's first line. */}
      {unread && <View style={{ position: 'absolute', left: 7, top: 22, width: 7, height: 7, borderRadius: 4, backgroundColor: color.accent }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {picking && <View style={{ width: 22, height: 22, marginRight: 12, borderWidth: 1.5, borderRadius: 11, borderColor: on ? color.text : color.lineStrong, backgroundColor: on ? color.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on && <Tick size={13} tint={color.bg} />}</View>}
        {row.running && <View style={{ marginRight: row.cloud ? 6 : 8 }}><RunningMark cloud={row.cloud}><Cloud /></RunningMark></View>}
        {/* A thread a teammate's run sent you says whose it is before its title (teammates/row-lead.tsx). */}
        {mate && <View style={{ marginRight: 7 }}><TeammateMark t={mate} /></View>}
        <T numberOfLines={2} style={{ ...rowTitle, fontFamily: unread ? font.semibold : font.regular }}>
          {mate ? <Text style={{ color: color.dim }}>{`${mate.name}  `}</Text> : null}
          {row.title}
        </T>
        {/* A closed thread keeps no pin. */}
        {row.item?.pinned && row.item.status !== 'done' && <View accessibilityLabel="Pinned" style={{ marginLeft: 8 }}><Pin /></View>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 7 }}>
        {!!aside && <><Chip mine={!row.held}>{aside}</Chip><Dot /></>}
        {/* Sent from the phone and not yet taken: the web app's status word (status-word.ts). */}
        {row.queued && <><T style={{ ...meta, color: color.dim }}>Queued</T><Dot /></>}
        {row.away && <><T style={{ ...meta, color: color.dim }}>Computer offline</T><Dot /></>}
        {row.priority && <View accessibilityLabel={row.priority === 'urgent' ? 'Urgent' : 'High priority'}><PriorityBars level={row.priority === 'urgent' ? 4 : 3} /></View>}
        {row.agent && <><T style={{ ...meta, color: color.dim }}>{row.agent}</T><Dot /></>}
        <T numberOfLines={1} style={{ ...meta, color: color.dim, flexShrink: 1 }}>{row.projectName}</T>
        <Dot />
        <T style={meta}>{row.when}</T>
      </View>
    </Pressable>
    </Swiped>
  );
}

/** A message in a group that names you, at the top of Needs you until you read the group past it (team/rooms/MentionRows.tsx). */
function MentionRow({ m, first, now, open }: { m: MentionRowData; first: boolean; now: number; open: () => void }) {
  const meta = metaWords();
  return (
    <Pressable onPress={open} accessibilityLabel={`${m.byName || 'Someone'} mentioned you in ${m.roomName}, unread`}
      style={({ pressed }) => rowBox(pressed)}>
      <Parted first={first} />
      <View style={{ position: 'absolute', left: 7, top: 22, width: 7, height: 7, borderRadius: 4, backgroundColor: color.accent }} />
      <View style={nameLine}>
        <Face name={m.byName || 'Someone'} size={FACE} />
        <T numberOfLines={1} style={{ ...rowTitle, fontFamily: font.semibold }}>{m.byName || 'Someone'}</T>
      </View>
      <T numberOfLines={2} style={{ fontSize: 15, lineHeight: 21, color: color.dim, marginTop: 2 }}>{m.body}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 7 }}>
        <T numberOfLines={1} style={{ ...meta, color: color.dim, flexShrink: 1 }}>{`# ${m.roomName}`}</T>
        <Dot />
        <T style={meta}>{updatedWords(m.at, now)}</T>
      </View>
    </Pressable>
  );
}

/** An AI teammate asking you something, at the top of Needs you with the mentions, until you answer it. */
function QuestionRow({ mate, text, at, first, now, open }: { mate: Teammate; text: string; at: number; first: boolean; now: number; open: () => void }) {
  const meta = metaWords();
  return (
    <Pressable onPress={open} accessibilityLabel={`${mate.name} asks you: ${text}`}
      style={({ pressed }) => rowBox(pressed)}>
      <Parted first={first} />
      <View style={{ position: 'absolute', left: 7, top: 22, width: 7, height: 7, borderRadius: 4, backgroundColor: color.accent }} />
      <View style={nameLine}>
        <TeammateMark t={mate} size={FACE} />
        <T numberOfLines={1} style={{ ...rowTitle, fontFamily: font.semibold }}>{mate.name}</T>
      </View>
      <T numberOfLines={2} style={{ fontSize: 15, lineHeight: 21, color: color.dim, marginTop: 2 }}>{text}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 7 }}>
        <Chip mine>Asks you</Chip>
        <Dot />
        <T style={meta}>{updatedWords(at, now)}</T>
      </View>
    </Pressable>
  );
}

/** Repeating tasks above what is put off, as the desktop's Later tab has them (List.tsx). */
function RepeatRows({ repeats, items, now }: { repeats: PhoneRepeat[]; items: WorkItem[]; now: number }) {
  const meta = metaWords();
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ marginRight: 9 }}><Repeat /></View>
              <T numberOfLines={2} style={{ ...rowTitle, flex: 1 }}>{r.title}</T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 7 }}>
              <Chip>{repeatTag(r)}</Chip>
              <Dot />
              {r.waiting && <><T style={{ ...meta, color: color.dim }}>Queued</T><Dot /></>}
              <T numberOfLines={1} style={{ ...meta, color: color.dim, flexShrink: 1 }}>{r.productName}</T>
              <Dot />
              <T numberOfLines={1} style={{ ...meta, flexShrink: 1 }}>{`Next ${words.when}`}</T>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The tabs under the title, inside the top bar, with Groups fifth while it
 * is on: a pill each, the picked one filled. They stay at the top ("all that
 * stuff is best placed at the top") and scroll sideways when they do not fit. */
function Tabs({ on, counts, pick, team }: { on: PlaceId; counts: Record<PlaceId, number>; pick: (t: PlaceId) => void; team: boolean }) {
  const [span, setSpan] = useState({ view: 0, content: 0, x: 0 });
  const tabs = bottomTabs(team);
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
function Board({ columns, foot, inset = 12 }: { columns: ReturnType<typeof phoneBoard>; foot: number; inset?: number }) {
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
                {e.agent && <T style={{ fontSize: 12.5, color: color.dim, marginRight: 8 }}>{e.agent}</T>}
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
  const onEverything = teamMode && place !== 'inbox' && place !== 'chats' && !onFiles;
  // In progress, Later and Done are your own card's work on Everything else.
  const [mineTab, setMineTab] = useState<Exclude<TabId, 'inbox'>>('progress');
  const [evView, setEvViewRaw] = useState<EvView>(() => evViewOf(appStore));
  const setEvView = (v: EvView) => { setEvViewRaw(v); keepEvView(v, appStore); };
  const tab: TabId = onEverything ? mineTab : place === 'everything' || place === 'chats' || place === 'files' || teamMode ? 'inbox' : place;
  const openGroup = (id: string) => { groups.setLast(id); setChatGroup(place); setPlace('chats'); };
  // A command from Search (app/search.tsx).
  useEffect(() => {
    const w = c.wanted;
    if (!w) return;
    c.takeWanted();
    setChatGroup(w.group ? 'chats' : null);
    if (w.menu) setMenu(true);
    if (w.place !== 'inbox' && w.place !== 'chats' && w.place !== 'everything' && w.place !== 'files' && teamMode) { setMineTab(w.place); setPlace('everything'); } else setPlace(w.place);
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
  const board = useMemo(() => (!teamMode && display.view === 'board' ? phoneBoard(c.view, c.tabs, display, c.now, agent) : null), [teamMode, display, c.view, c.tabs, c.now, agent]);
  // Your card's board: your own threads, and what waits on you is Needs you, so it is no column (whose-board.ts).
  const mineBoard = useMemo(() => (onEverything && evView === 'board'
    ? phoneBoard({ ...c.view, items: myItems(c.view.items) }, c.tabs, display, c.now, agent).filter((col) => col.state !== 'waiting') : null), [onEverything, evView, display, c.view, c.tabs, c.now, agent]);
  const rowOf = useMemo(() => new Map(Object.values(c.tabs).flat().map((r) => [r.key, r])), [c.tabs]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [closing, setClosing] = useState(false);
  const [pickedMenu, setPickedMenu] = useState(false);
  const [pickingLevel, setPickingLevel] = useState(false);
  useEffect(() => { setPicked(null); }, [place, tab]);
  const [laterOne, setLaterOne] = useState<WorkItem | null>(null);
  const rowActs = useMemo(() => ({ close: (i: WorkItem) => { void c.closeAll([i]); }, later: (i: WorkItem) => setLaterOne(i) }), [c.closeAll]);
  if (!c.opened) return <Wall><Waiting /></Wall>;
  if (!c.signedIn) return <Redirect href="/sign-in" />;
  // Under your own card, your threads without your AI teammates' runs, which their cards hold.
  const rows = onEverything ? myItems(shown.rows[tab].map((r) => ({ ...r, labels: r.item?.labels }))) as typeof shown.rows[TabId] : shown.rows[tab];
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
  const counts = { inbox: shown.rows.inbox.length + mentions.length + asks.length, progress: shown.rows.progress.length, snoozed: shown.rows.snoozed.length + c.repeats.length, done: shown.rows.done.length, everything: 0, chats: teammatesWaiting(c) + (groups.on ? groups.unread : 0), files: 0 };
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
  const agents = agentChoices(board || mineBoard ? Object.values(c.tabs).flat() : c.tabs[tab], display, c.now, agent);
  const menuCount = () => {
    const drawnBoard = onEverything ? mineBoard : board;
    const wholeBoard = !drawnBoard ? null : onEverything
      ? phoneBoard({ ...c.view, items: myItems(c.view.items) }, c.tabs, unfiltered, c.now).filter((col) => col.state !== 'waiting')
      : phoneBoard(c.view, c.tabs, unfiltered, c.now);
    const above = mentionsShown ? mentions.length + asks.length : repeatsShown ? c.repeats.length : 0;
    return filterCount({ rows: shown.rows[tab], whole: c.tabs[tab], mineOnly: onEverything, above, board: drawnBoard, wholeBoard });
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
          : <ChatsPlace tabs={<Tabs on="chats" counts={counts} pick={setPlace} team />} openGroup={(id) => { groups.setLast(id); setChatGroup('chats'); }} />}
      </Wall>
    );
  }
  if (onFiles) return <Wall><FilesPlace tabs={<Tabs on="files" counts={counts} pick={setPlace} team={teamMode} />} /></Wall>;
  // With a team on, List and Board in the View menu are Everything else's (App.tsx `headerDisplay`).
  // Needs you is always a list, so it lights List; Board there opens Everything else's board.
  const shownView = teamMode && !onEverything ? 'list' : evView;
  const headerDisplay = teamMode ? { ...display, view: shownView } : display;
  const onHeaderDisplay = !teamMode ? setDisplay : (d: Display) => {
    if (d.view !== shownView) {
      setEvView(d.view as EvView);
      if (!onEverything && d.view === 'board') { setPlace('everything'); setMenu(false); }
    }
    setDisplay({ ...d, view: display.view });
  };
  const threadRow = (i: WorkItem, first: boolean) => {
    const r = rowOf.get(`${i.product}/${i.id}`);
    return r ? <ThreadRow key={r.key} row={r} first={first} unread={c.unread(i)} mate={mateOf(i, c.team)} /> : null;
  };
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
  // Your card's words for its list; its board's columns already say them.
  const mineTabs = evView === 'list' ? (
    <View style={{ flexDirection: 'row', gap: 14, marginLeft: 8 }}>
      {TABS.filter((t) => t.id !== 'inbox').map((t) => (
        <Pressable key={t.id} onPress={() => setMineTab(t.id as typeof mineTab)} accessibilityRole="tab" accessibilityState={{ selected: mineTab === t.id }} hitSlop={6}>
          <T style={{ fontSize: 13, color: mineTab === t.id ? color.text : color.faint }}>{t.label}</T>
        </Pressable>
      ))}
    </View>
  ) : undefined;
  return (
    <Picking.Provider value={picking}>
    <RowActs.Provider value={rowActs}>
    <Wall>
      <TopBar title="Inbox" right={<>
        <IconButton label="Search threads" onPress={() => router.push('/search')}><Magnifier size={18} /></IconButton>
        {penUp && <IconButton label="New thread" onPress={() => router.push('/new')}><Pen size={18} tint={color.dim} /></IconButton>}
        <ViewButton display={display} agent={agent} open={menu} onPress={() => setMenu(!menu)} />
        <IconButton label="Settings" onPress={() => router.push('/settings')}><Gear /></IconButton>
      </>} below={board ? undefined : <Tabs on={onEverything ? 'everything' : tab} counts={counts} pick={setPlace} team={teamMode} />} />
      <StatusNotice message={notice?.message} next={notice?.next} />
      {onEverything
        ? <EverythingPlace mine={mineBoard ? <Board columns={mineBoard} foot={foot} inset={size.inset} /> : list} mineTabs={mineTabs} row={threadRow} openGroup={openGroup} />
        : board ? <Board columns={board} foot={foot} /> : list}
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
      {menu && <ViewMenu display={headerDisplay} onDisplay={onHeaderDisplay} agent={agent} agents={agents} onAgent={setAgent} products={c.view.products} items={c.view.items} {...menuCount()} tab={tab} close={() => setMenu(false)}
        onSelect={rows.length && !board ? () => { setMenu(false); setPicked(new Set()); } : undefined} />}
      <LaterSheet visible={!!laterOne} onClose={() => setLaterOne(null)} onPick={(until, label) => { const i = laterOne; setLaterOne(null); if (i) void c.laterAll([i], until, label); }}
        onNow={laterOne && inLater([laterOne], c.now) ? () => { const i = laterOne; setLaterOne(null); void c.laterAll([i], 0); } : undefined} />
    </Wall>
    </RowActs.Provider>
    </Picking.Provider>
  );
}
