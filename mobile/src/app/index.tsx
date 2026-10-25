// Threads, as the phone layout draws them (renderer/src/phone.css): the four
// tabs as words along the bottom, each row its title over the project and
// age, and a new thread under the thumb. Or, picked in View and filters, the
// board: one column a swipe.
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readDisplay, writeDisplay, filteredEmptyWords, type Display } from '../../../renderer/src/threads/page-rules';
import { phoneBoard, shownTabs, TABS, type Row, type TabId } from '../lib/tabs';
import { appStore } from '../platform/persist';
import { useCloud } from '../state/cloud';
import { Magnifier, StateGlyph, ViewButton, ViewMenu } from '../ui/Filters';
import { Cloud, Gear, Pen, Tick } from '../ui/icons';
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

function ThreadRow({ row, first }: { row: Row; first: boolean }) {
  // "not started" or "2 tasks to approve", faint after the title (Pages.tsx `RowCells`).
  const aside = row.held ? 'not started' : row.toApprove;
  return (
    <Pressable onPress={() => open(row.product, row.id)}
      style={({ pressed }) => ({ minHeight: 64, paddingTop: 14, paddingBottom: 14, paddingLeft: size.inset, paddingRight: 12, backgroundColor: pressed ? color.fill : 'transparent' })}>
      {/* The line over every row but the first, edge to 12px short of the right (`.row + .row::after`). */}
      {!first && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {row.running && <View style={{ marginRight: row.cloud ? 6 : 8 }}><RunningMark cloud={row.cloud}><Cloud /></RunningMark></View>}
        <T numberOfLines={2} style={{ flex: 1, fontSize: 16, lineHeight: 21.6, letterSpacing: -0.16 }}>
          {row.title}{aside ? <Text style={{ color: color.faint }}>{`  ${aside}`}</Text> : null}
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
        <T numberOfLines={1} style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 20, letterSpacing: 0.55, textTransform: 'uppercase', color: color.dim, flexShrink: 1 }}>{row.projectName}</T>
        <T style={{ fontSize: 11, lineHeight: 20, color: color.faint }}>·</T>
        <T style={{ fontSize: 11, lineHeight: 20, color: color.faint }}>{row.when}</T>
      </View>
    </Pressable>
  );
}

function Tabs({ on, counts, pick, foot }: { on: TabId; counts: Record<TabId, number>; pick: (t: TabId) => void; foot: number }) {
  return (
    <View style={{ height: size.tabs + foot, paddingBottom: foot, borderTopWidth: 1, borderTopColor: color.line, flexDirection: 'row', alignItems: 'center' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingLeft: size.inset, paddingRight: 8, gap: 22 }}>
        {TABS.map((t) => (
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const H2 = ({ children }: { children: string }) => <T style={{ fontFamily: font.medium, fontSize: 18, lineHeight: 23, letterSpacing: -0.18, marginBottom: 8 }}>{children}</T>;

/** Nothing needs you, and whether work is moving without you (Pages.tsx `InboxClear`). */
function InboxClear({ running, scheduled, go }: { running: number; scheduled: number; go: (t: TabId) => void }) {
  const link = (words: string, tab: TabId) => (
    <Text onPress={() => go(tab)} suppressHighlighting style={{ color: color.text, textDecorationLine: 'underline', textDecorationColor: color.lineStrong }}>{words}</Text>
  );
  return (
    <View style={{ paddingTop: 40, paddingBottom: 40, paddingLeft: 32, paddingRight: 24 }}>
      <H2>Nothing needs you</H2>
      <T style={{ fontSize: 14, lineHeight: 21, color: color.dim, marginBottom: 22 }}>
        {running > 0 ? <>{link(plural(running, 'thread is running', 'threads are running'), 'progress')}. Each one lands here when it needs you.</>
          : scheduled > 0 ? <>{link(plural(scheduled, 'thread is scheduled', 'threads are scheduled'), 'snoozed')}. Nothing else is open.</>
            : 'Start a thread and an agent picks it up.'}
      </T>
      <Outlined label="New thread" lead={<Pen size={15} tint={color.text} />} onPress={() => router.push('/new')} />
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
function Board({ columns, foot }: { columns: ReturnType<typeof phoneBoard>; foot: number }) {
  const { width } = useWindowDimensions();
  const col = Math.round((width - 24) * 0.86);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={col + 12} decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }} style={{ flex: 1 }}>
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
              style={({ pressed }) => ({ marginBottom: 10, paddingTop: 14, paddingHorizontal: 15, paddingBottom: 13, borderWidth: 1, borderColor: color.line, backgroundColor: pressed ? color.picked : 'rgba(255, 255, 255, 0.035)' })}>
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
  const [tab, setTab] = useState<TabId>('inbox');
  const [pulling, setPulling] = useState(false);
  const [menu, setMenu] = useState(false);
  // Remembered between launches, as the site keeps it in the page's storage.
  const [display, setDisplayRaw] = useState<Display>(() => readDisplay('inbox', appStore));
  const setDisplay = (d: Display) => { setDisplayRaw(d); writeDisplay('inbox', d, appStore); };
  const order = useMemo(() => c.view.products.map((p) => p.slug), [c.view.products]);
  const shown = useMemo(() => shownTabs(c.tabs, display, c.now, order), [c.tabs, display, c.now, order]);
  const board = useMemo(() => (display.view === 'board' ? phoneBoard(c.view, c.tabs, display, c.now) : null), [display, c.view, c.tabs, c.now]);
  if (!c.opened) return <Wall><View /></Wall>;
  if (!c.signedIn) return <Redirect href="/sign-in" />;
  const rows = shown.rows[tab];
  const counts = { inbox: shown.rows.inbox.length, progress: shown.rows.progress.length, snoozed: shown.rows.snoozed.length, done: shown.rows.done.length };
  const hidden = shown.whole[tab] - rows.length;
  const foot = footRoom(inset);
  const clear = () => setDisplay({ ...display, priorities: [], projects: [], updated: 'any', privacy: 'any' });
  return (
    <Wall>
      <TopBar title="Threads" right={<>
        <IconButton label="Search threads" onPress={() => router.push('/search')}><Magnifier size={18} /></IconButton>
        <ViewButton display={display} open={menu} onPress={() => setMenu(!menu)} />
        <IconButton label="Settings" onPress={() => router.push('/settings')}><Gear /></IconButton>
      </>} />
      {/* `.phone-status` (threads/pages.css): the line saying what you see may be out of date. */}
      {c.status && (
        <View accessibilityRole="alert" style={{ marginTop: 6, marginHorizontal: size.inset, marginBottom: 2, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: color.lineStrong }}>
          <T style={{ fontSize: 13, lineHeight: 18.2, color: color.dim }}>{c.status}</T>
        </View>
      )}
      {board ? <Board columns={board} foot={foot} /> : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item, index }) => <ThreadRow row={item} first={index === 0} />}
          refreshControl={<RefreshControl tintColor={color.dim} refreshing={pulling} onRefresh={async () => { setPulling(true); await c.refresh(); setPulling(false); }} />}
          ListEmptyComponent={c.loading ? undefined : hidden > 0 ? <FilteredEmpty tab={tab} hidden={hidden} clear={clear} />
            : tab === 'inbox' ? <InboxClear running={c.tabs.progress.length} scheduled={c.tabs.snoozed.length} go={setTab} />
              : <T style={{ paddingHorizontal: size.inset, paddingTop: 28, fontSize: 15, lineHeight: 23, color: color.dim }}>{EMPTY[tab]}</T>}
          contentContainerStyle={{ paddingBottom: 96 }}
        />
      )}
      <Pressable accessibilityLabel="New thread" accessibilityRole="button" onPress={() => router.push('/new')}
        style={({ pressed }) => ({
          position: 'absolute', right: 20, bottom: (board ? 0 : size.tabs) + foot + 16, width: 56, height: 56, borderRadius: 28,
          alignItems: 'center', justifyContent: 'center', backgroundColor: color.graphite, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
          shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, opacity: pressed ? 0.85 : 1,
        })}>
        <Pen />
      </Pressable>
      {!board && <Tabs on={tab} counts={counts} pick={setTab} foot={foot} />}
      {menu && <ViewMenu display={display} onDisplay={setDisplay} products={c.view.products} items={c.view.items} shown={rows.length} total={shown.whole[tab]} tab={tab} close={() => setMenu(false)} />}
    </Wall>
  );
}
