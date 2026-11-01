// Threads, as the phone layout draws them (renderer/src/phone.css): the four
// tabs as words under the title, each row its title over the project and
// age, and a new thread under the thumb. Or, picked in View and filters, the
// board: one column a swipe.
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readDisplay, writeDisplay, filteredEmptyWords, updatedWords, type Display } from '../../../renderer/src/threads/page-rules';
import { Name } from '../../../shared/product-name.mjs';
import { InboxComposer } from '../ui/NewThreadForm';
import { phoneBoard, shownTabs, TABS, type Row, type TabId } from '../lib/tabs';
import { evViewOf, keepEvView, myItems, type EvView } from '../lib/everything';
import { EverythingPlace } from '../ui/Everything';
import { bottomTabs, type PlaceId } from '../lib/groups';
import { useGroups } from '../state/groups';
import { GroupsPlace } from '../ui/Groups';
import { ChatsPlace, TeammateMark, teammatesWaiting } from '../ui/Teammates';
import { Face } from '../ui/Groups';
import { mentionRows, type MentionRow as MentionRowData } from '../../../renderer/src/team/rooms/room-rules';
import { mateOf } from '../lib/teammates';
import type { Teammate } from '../../../renderer/src/types';
import { appStore } from '../platform/persist';
import { useCloud } from '../state/cloud';
import { Magnifier, StateGlyph, ViewButton, ViewMenu } from '../ui/Filters';
import { Cloud, Gear, Pen, Pin, Repeat, Tick } from '../ui/icons';
import { Waiting } from '../ui/LogoOrbit';
import { repeatRow, repeatTag } from '../../../renderer/src/repeat-words';
import type { PhoneRepeat } from '../../../renderer/src/phone-repeats';
import { barsFor } from '../ui/Pickers';
import { footRoom, IconButton, PriorityBars, RunningMark, T, TopBar, Wall } from '../ui/parts';
import { color, font, size } from '../ui/theme';

// The desktop's own words for an empty tab (renderer/src/threads/Pages.tsx `EmptyTab`).
const EMPTY: Record<Exclude<TabId, 'inbox'>, string> = {
  progress: 'Nothing is running.',
  snoozed: 'Nothing is waiting for later. "Add it to Later" on a new thread writes one down without starting it.',
  done: 'Nothing closed yet. A finished thread waits in Needs you until you close it.',
};

const open = (product: string, id: string) => router.push({ pathname: '/thread/[product]/[id]', params: { product, id } });

function ThreadRow({ row, first, unread, mate }: { row: Row; first: boolean; unread: boolean; mate: Teammate | null }) {
  // "not started" or "2 tasks to approve", faint after the title (Pages.tsx `RowCells`).
  const aside = row.held ? 'not started' : row.toApprove;
  const small = { fontSize: 11, lineHeight: 20, color: color.faint };
  return (
    <Pressable onPress={() => open(row.product, row.id)} accessibilityLabel={unread ? `${row.title}, unread` : undefined}
      style={({ pressed }) => ({ minHeight: 64, paddingTop: 14, paddingBottom: 14, paddingLeft: size.inset, paddingRight: 12, backgroundColor: pressed ? color.fill : 'transparent' })}>
      {/* The line over every row but the first, edge to 12px short of the right (`.row + .row::after`). */}
      {!first && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
      {/* The unread dot in the margin, level with the title's first line (phone.css `.row.unread::before`). */}
      {unread && <View style={{ position: 'absolute', left: 5, top: 22, width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {row.running && <View style={{ marginRight: row.cloud ? 6 : 8 }}><RunningMark cloud={row.cloud}><Cloud /></RunningMark></View>}
        {/* A thread a teammate's run sent you says whose it is before its title (teammates/row-lead.tsx). */}
        {mate && <View style={{ marginRight: 7 }}><TeammateMark t={mate} /></View>}
        <T numberOfLines={2} style={{ flexShrink: 1, fontSize: 16, lineHeight: 21.6, letterSpacing: -0.16 }}>
          {mate ? <Text style={{ color: color.dim }}>{`${mate.name}  `}</Text> : null}
          {row.title}{aside ? <Text style={{ color: color.faint }}>{`  ${aside}`}</Text> : null}
        </T>
        {/* Pinned, faint after the title as the desktop draws it (pages.css `.th-pin`); a closed thread keeps no pin. */}
        {row.item?.pinned && row.item.status !== 'done' && <View accessibilityLabel="Pinned" style={{ marginLeft: 8 }}><Pin /></View>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
        {/* Sent from the phone and not yet taken: the web app's status word (status-word.ts). */}
        {row.queued && <><T style={{ ...small, color: color.dim }}>Queued</T><T style={small}>·</T></>}
        <T numberOfLines={1} style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 20, letterSpacing: 0.55, textTransform: 'uppercase', color: color.dim, flexShrink: 1 }}>{row.projectName}</T>
        <T style={small}>·</T>
        <T style={small}>{row.when}</T>
      </View>
    </Pressable>
  );
}

/** A message in a group that names you, at the top of Needs you until you read the group past it (team/rooms/MentionRows.tsx). */
function MentionRow({ m, first, now, open }: { m: MentionRowData; first: boolean; now: number; open: () => void }) {
  const small = { fontSize: 11, lineHeight: 20, color: color.faint };
  return (
    <Pressable onPress={open} accessibilityLabel={`${m.byName || 'Someone'} mentioned you in ${m.roomName}, unread`}
      style={({ pressed }) => ({ minHeight: 64, paddingTop: 14, paddingBottom: 14, paddingLeft: size.inset, paddingRight: 12, backgroundColor: pressed ? color.fill : 'transparent' })}>
      {!first && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
      <View style={{ position: 'absolute', left: 5, top: 22, width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Face name={m.byName || 'Someone'} size={20} />
        <T numberOfLines={2} style={{ flexShrink: 1, fontSize: 16, lineHeight: 21.6, letterSpacing: -0.16 }}>
          <Text style={{ fontFamily: font.medium }}>{`${m.byName || 'Someone'}  `}</Text>
          <Text style={{ color: color.dim }}>{m.count > 1 ? `sent you ${m.count} messages` : m.body}</Text>
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
        <T numberOfLines={1} style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 20, letterSpacing: 0.55, textTransform: 'uppercase', color: color.dim, flexShrink: 1 }}>{`# ${m.roomName}`}</T>
        <T style={small}>·</T>
        <T style={small}>{updatedWords(m.at, now)}</T>
      </View>
    </Pressable>
  );
}

/** Repeating tasks above what is put off, as the desktop's Later tab has them (List.tsx). */
function RepeatRows({ repeats, items, now }: { repeats: PhoneRepeat[]; items: any[]; now: number }) {
  const small = { fontSize: 11, lineHeight: 20, color: color.faint };
  return (
    <View style={{ paddingBottom: 8 }}>
      <T style={{ paddingHorizontal: size.inset, paddingTop: 16, paddingBottom: 4, fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase', color: color.faint }}>Repeating</T>
      {repeats.map((r, i) => {
        const last = r.lastOccurrence ? items.find((it) => it.id === r.lastOccurrence) ?? null : null;
        const words = repeatRow(r, last, now);
        return (
          <Pressable key={`${r.product}/${r.id}`} onPress={() => router.push({ pathname: '/repeat/[product]/[id]', params: { product: r.product, id: r.id } })}
            style={({ pressed }) => ({ minHeight: 64, paddingTop: 14, paddingBottom: 14, paddingLeft: size.inset, paddingRight: 12, backgroundColor: pressed ? color.fill : 'transparent' })}>
            {i > 0 && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ marginRight: 9 }}><Repeat /></View>
              <T numberOfLines={2} style={{ flex: 1, fontSize: 16, lineHeight: 21.6, letterSpacing: -0.16 }}>
                {r.title}<Text style={{ color: color.faint }}>{`  ${repeatTag(r)}`}</Text>
              </T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
              {r.waiting && <><T style={{ ...small, color: color.dim }}>Queued</T><T style={small}>·</T></>}
              <T numberOfLines={1} style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 20, letterSpacing: 0.55, textTransform: 'uppercase', color: color.dim, flexShrink: 1 }}>{r.productName}</T>
              <T style={small}>·</T>
              <T numberOfLines={1} style={{ ...small, flexShrink: 1 }}>{`Next ${words.when}`}</T>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The tabs under the title, inside the top bar so one line runs under
 * both, with Groups fifth while it is on. They are the bottom bar as it was,
 * moved up: "the nav at the bottom is very good so just shift that ui upward,
 * without messing much with spacing". The bar's line along their top is gone,
 * since the title bar's is under them; they scroll sideways when they do not fit. */
function Tabs({ on, counts, pick, team }: { on: PlaceId; counts: Record<PlaceId, number>; pick: (t: PlaceId) => void; team: boolean }) {
  return (
    <View style={{ height: size.tabs, flexDirection: 'row', alignItems: 'center' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingLeft: size.inset, paddingRight: 8, gap: 22 }}>
        {bottomTabs(team).map((t) => (
          <Pressable key={t.id} onPress={() => pick(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on === t.id }}
            style={{ height: 32, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: on === t.id ? color.accent : 'transparent' }}>
            <T style={{ fontSize: 15, lineHeight: 30, color: on === t.id ? color.text : color.dim }}>{t.label}</T>
            {t.id !== 'done' && counts[t.id] > 0 && <T style={{ fontSize: 11, lineHeight: 30, fontFamily: font.medium, marginLeft: 13, color: color.faint }}>{counts[t.id]}</T>}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** An outlined button in the empty states (pages.css `.th-clear .th-new`). */
function Outlined({ label, onPress, lead }: { label: string; onPress: () => void; lead?: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ alignSelf: 'flex-start', height: 32, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : 'transparent' })}>
      {lead}
      <T style={{ fontSize: 14, color: color.text }}>{label}</T>
    </Pressable>
  );
}

const H2 = ({ children }: { children: string }) => <T style={{ fontFamily: font.medium, fontSize: 18, lineHeight: 23, letterSpacing: -0.18, marginBottom: 8 }}>{children}</T>;

/** The empty inbox is where the next thread starts: the New thread form drawn open on the page (Pages.tsx `InboxClear`). */
function InboxClear() {
  return (
    <View style={{ paddingTop: 32, paddingBottom: 40, paddingHorizontal: 12 }}>
      <View style={{ paddingHorizontal: 4, marginBottom: 8 }}><H2>Nothing needs you</H2></View>
      <InboxComposer />
    </View>
  );
}

/** Signed in to an account no computer has sent a project to (Pages.tsx `ConnectComputer`). */
function ConnectComputer({ email, signOut }: { email: string | null; signOut: () => void }) {
  const steps = [
    `Open ${Name} on your computer.`,
    <>In Settings › Phone, sign in{email ? <> as <Text style={{ fontFamily: font.semibold, color: color.text }}>{email}</Text></> : null}.</>,
    'Your threads show up here within a minute.',
  ];
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 }}>
      <H2>Connect your computer</H2>
      <View style={{ gap: 10, marginTop: 6, marginBottom: 26 }}>
        {steps.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
            <T style={{ width: 14, fontSize: 14, lineHeight: 21, color: color.faint }}>{i + 1}.</T>
            <T style={{ flex: 1, fontSize: 14, lineHeight: 21, color: color.dim }}>{s}</T>
          </View>
        ))}
      </View>
      <Outlined label="Use another account" onPress={signOut} />
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
function Board({ columns, foot, inset = 12 }: { columns: ReturnType<typeof phoneBoard>; foot: number; inset?: number }) {
  const { width } = useWindowDimensions();
  const col = Math.round((width - inset * 2) * 0.86);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={col + 12} decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: inset, gap: 12 }} style={{ flex: 1 }}>
      {columns.map((c) => (
        <ScrollView key={c.state} style={{ width: col }} contentContainerStyle={{ paddingBottom: 88 + foot }} showsVerticalScrollIndicator={false}>
          <View style={{ height: 38, paddingTop: 8, flexDirection: 'row', alignItems: 'center' }}>
            <StateGlyph state={c.state} />
            <T style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase', color: color.dim }}>{c.label}</T>
            <T style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, color: color.faint, marginLeft: 8 }}>{c.rows.length}</T>
          </View>
          {c.rows.length === 0 && <T style={{ fontSize: 13, color: color.faint, paddingVertical: 4, paddingHorizontal: 2 }}>Nothing here.</T>}
          {c.rows.map((e) => (
            <Pressable key={e.key} onPress={() => e.item && open(e.item.product, e.item.id)}
              style={({ pressed }) => ({ marginBottom: 10, paddingTop: 14, paddingHorizontal: 15, paddingBottom: 13, borderWidth: 1, borderColor: color.line, backgroundColor: pressed ? color.picked : color.fill })}>
              <T numberOfLines={3} style={{ fontSize: 14, lineHeight: 20, marginBottom: 14 }}>{e.title}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {e.live && <View style={{ marginRight: 8 }}><RunningMark /></View>}
                {e.priority !== null && <View style={{ marginRight: 8 }}><PriorityBars level={barsFor(e.priority)} /></View>}
                <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.mono, fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase', color: color.faint }}>{e.project}</T>
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
  // Where your messages go, asked once before the first (app/ai-notice.tsx).
  const askedNotice = useRef(false);
  useEffect(() => {
    if (askedNotice.current || c.preview || !c.signedIn || !c.noticeRead || c.notice) return;
    askedNotice.current = true;
    router.push('/ai-notice');
  }, [c.signedIn, c.noticeRead, c.notice, c.preview]);
  const inset = useSafeAreaInsets();
  const groups = useGroups();
  const [place, setPlace] = useState<PlaceId>('inbox');
  // A group opened from Chats or a card, drawn in Chats' place until you go back to where you were.
  const [chatGroup, setChatGroup] = useState<PlaceId | null>(null);
  // Groups and teammates both off on the computer while open: back to the threads.
  const teamMode = !!c.team || groups.on;
  const onChats = teamMode && place === 'chats';
  const onEverything = teamMode && place !== 'inbox' && place !== 'chats';
  // In progress, Later and Done are your own card's work on Everything else.
  const [mineTab, setMineTab] = useState<Exclude<TabId, 'inbox'>>('progress');
  const [evView, setEvViewRaw] = useState<EvView>(() => evViewOf(appStore));
  const setEvView = (v: EvView) => { setEvViewRaw(v); keepEvView(v, appStore); };
  const tab: TabId = onEverything ? mineTab : place === 'everything' || place === 'chats' || teamMode ? 'inbox' : place;
  const openGroup = (id: string) => { groups.setLast(id); setChatGroup(place); setPlace('chats'); };
  // A command from Search (app/search.tsx).
  useEffect(() => {
    const w = c.wanted;
    if (!w) return;
    c.takeWanted();
    setChatGroup(w.group ? 'chats' : null);
    if (w.menu) setMenu(true);
    if (w.place !== 'inbox' && w.place !== 'chats' && w.place !== 'everything' && teamMode) { setMineTab(w.place); setPlace('everything'); } else setPlace(w.place);
  }, [c.wanted]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pulling, setPulling] = useState(false);
  const [menu, setMenu] = useState(false);
  // Remembered between launches, as the site keeps it in the page's storage.
  const [display, setDisplayRaw] = useState<Display>(() => readDisplay('inbox', appStore));
  const setDisplay = (d: Display) => { setDisplayRaw(d); writeDisplay('inbox', d, appStore); };
  const order = useMemo(() => c.view.products.map((p) => p.slug), [c.view.products]);
  const shown = useMemo(() => shownTabs(c.tabs, display, c.now, order), [c.tabs, display, c.now, order]);
  const board = useMemo(() => (!teamMode && display.view === 'board' ? phoneBoard(c.view, c.tabs, display, c.now) : null), [teamMode, display, c.view, c.tabs, c.now]);
  // Your card's board: your own threads, and what waits on you is Needs you, so it is no column (whose-board.ts).
  const mineBoard = useMemo(() => (onEverything && evView === 'board'
    ? phoneBoard({ ...c.view, items: myItems(c.view.items) }, c.tabs, display, c.now).filter((col) => col.state !== 'waiting') : null), [onEverything, evView, display, c.view, c.tabs, c.now]);
  const rowOf = useMemo(() => new Map(Object.values(c.tabs).flat().map((r) => [r.key, r])), [c.tabs]);
  if (!c.opened) return <Wall><Waiting /></Wall>;
  if (!c.signedIn) return <Redirect href="/sign-in" />;
  // Under your own card, your threads without your AI teammates' runs, which their cards hold.
  const rows = onEverything ? myItems(shown.rows[tab].map((r) => ({ ...r, labels: r.item?.labels }))) as typeof shown.rows[TabId] : shown.rows[tab];
  // Later counts its repeating tasks too, as the desktop's does (App.tsx `scheduledCount`).
  // Messages in your groups that name you lead Needs you, and count in it (App.tsx `MentionRows`).
  const mentions = groups.on ? mentionRows(groups.state.mentions) : [];
  const openMention = (m: MentionRowData) => openGroup(m.roomId);
  const counts = { inbox: shown.rows.inbox.length + mentions.length, progress: shown.rows.progress.length, snoozed: shown.rows.snoozed.length + c.repeats.length, done: shown.rows.done.length, everything: 0, chats: teammatesWaiting(c) + (groups.on ? groups.unread : 0) };
  const repeatsShown = tab === 'snoozed' && c.repeats.length > 0;
  const mentionsShown = tab === 'inbox' && mentions.length > 0;
  const hidden = shown.whole[tab] - shown.rows[tab].length;
  const foot = footRoom(inset);
  const clear = () => setDisplay({ ...display, priorities: [], projects: [], updated: 'any', privacy: 'any' });
  // A permission card sits over the corner the pen is in, so the pen moves up to the bar (8fa6c548).
  const penUp = c.view.approvals.length > 0;
  // The empty inbox draws the form itself, so it needs no pen.
  const inboxEmpty = tab === 'inbox' && rows.length === 0 && hidden === 0 && !c.loading && !mentionsShown;
  if (c.connect) {
    return (
      <Wall>
        <TopBar title="Threads" right={<IconButton label="Settings" onPress={() => router.push('/settings')}><Gear /></IconButton>} />
        <ConnectComputer email={c.connect.email} signOut={c.signOut} />
      </Wall>
    );
  }
  if (onChats) {
    return (
      <Wall>
        {chatGroup && groups.on
          ? <GroupsPlace onBack={() => { setPlace(chatGroup); setChatGroup(null); }} />
          : <ChatsPlace tabs={<Tabs on="chats" counts={counts} pick={setPlace} team />} openGroup={(id) => { groups.setLast(id); setChatGroup('chats'); }} />}
      </Wall>
    );
  }
  // With a team on, List and Board in the View menu are Everything else's (App.tsx `headerDisplay`).
  const headerDisplay = teamMode ? { ...display, view: evView } : display;
  const onHeaderDisplay = !teamMode ? setDisplay : (d: Display) => {
    if (d.view !== evView) { setEvView(d.view as EvView); if (place === 'inbox') setPlace('everything'); }
    setDisplay({ ...d, view: display.view });
  };
  const threadRow = (i: any, first: boolean) => {
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
        : mentionsShown ? <View>{mentions.map((m, i) => <MentionRow key={m.id} m={m} first={i === 0} now={c.now} open={() => openMention(m)} />)}</View> : undefined}
      ListEmptyComponent={c.loading ? <Waiting list /> : repeatsShown || mentionsShown ? undefined : hidden > 0 ? <FilteredEmpty tab={tab} hidden={hidden} clear={clear} />
        : tab === 'inbox' ? <InboxClear />
          : <T style={{ paddingHorizontal: size.inset, paddingTop: 28, fontSize: 15, lineHeight: 23, color: color.dim }}>{EMPTY[tab]}</T>}
      contentContainerStyle={{ paddingBottom: 96 }}
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
    <Wall>
      <TopBar title={teamMode ? 'Inbox' : 'Threads'} right={<>
        <IconButton label="Search threads" onPress={() => router.push('/search')}><Magnifier size={18} /></IconButton>
        {penUp && <IconButton label="New thread" onPress={() => router.push('/new')}><Pen size={18} tint={color.dim} /></IconButton>}
        <ViewButton display={display} open={menu} onPress={() => setMenu(!menu)} />
        <IconButton label="Settings" onPress={() => router.push('/settings')}><Gear /></IconButton>
      </>} below={board ? undefined : <Tabs on={onEverything ? 'everything' : tab} counts={counts} pick={setPlace} team={teamMode} />} />
      {/* `.phone-status` (threads/pages.css): the line saying what you see may be out of date. */}
      {c.status && (
        <View accessibilityRole="alert" style={{ marginTop: 6, marginHorizontal: size.inset, marginBottom: 2, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: color.lineStrong }}>
          <T style={{ fontSize: 13, lineHeight: 18.2, color: color.dim }}>{c.status}</T>
        </View>
      )}
      {onEverything
        ? <EverythingPlace mine={mineBoard ? <Board columns={mineBoard} foot={foot} inset={size.inset} /> : list} mineTabs={mineTabs} row={threadRow} openGroup={openGroup} />
        : board ? <Board columns={board} foot={foot} /> : list}
      {!penUp && !(inboxEmpty && !board) && <Pressable accessibilityLabel="New thread" accessibilityRole="button" onPress={() => router.push('/new')}
        style={({ pressed }) => ({
          position: 'absolute', right: 20, bottom: foot + 16, width: 56, height: 56, borderRadius: 28,
          alignItems: 'center', justifyContent: 'center', backgroundColor: color.graphite, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
          shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, opacity: pressed ? 0.85 : 1,
        })}>
        <Pen />
      </Pressable>}
      {menu && <ViewMenu display={headerDisplay} onDisplay={onHeaderDisplay} products={c.view.products} items={c.view.items} shown={rows.length} total={shown.whole[tab]} tab={tab} close={() => setMenu(false)} />}
    </Wall>
  );
}
