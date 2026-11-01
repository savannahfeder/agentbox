// Search, as the phone site draws it: the field takes the top bar, and every
// thread in every tab is found, closed ones too (App.tsx `hits`, List.tsx's row).
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { groupName } from '../lib/groups';
import { PHONE_LOOKS } from '../lib/look';
import { commandsFor, phoneCommands, THREADS_SHOWN, type PhoneCommand } from '../lib/palette';
import { phoneSearch, type Hit } from '../lib/tabs';
import { useCloud } from '../state/cloud';
import { useGroups } from '../state/groups';
import { useLook } from '../state/look';
import { PriorityBars, T, Wall } from '../ui/parts';
import { SETTINGS_PAGES } from '../ui/SettingsPages';
import { color, font, size } from '../ui/theme';

const Glass = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.faint} strokeWidth={1.1} strokeLinecap="round"><Circle cx={10.8} cy={10.8} r={6.6} /><Path d="M15.6 15.6 20 20" /></Svg>
);
const Out = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.faint} strokeWidth={1.1} strokeLinecap="round"><Path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" /></Svg>
);

/** A line of words with the found ones heavier (List.tsx `Hits`). */
function Runs({ runs, weight }: { runs: Hit['title']; weight: string }) {
  return <>{runs.map((r, i) => (r.hit ? <Text key={i} style={{ fontFamily: weight, color: color.text }}>{r.text}</Text> : r.text))}</>;
}

function HitRow({ hit, first, flush = false }: { hit: Hit; first: boolean; /** Right under the Threads label. */ flush?: boolean }) {
  const meta = { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.66, textTransform: 'uppercase' as const, color: color.faint };
  return (
    <Pressable onPress={() => router.push({ pathname: '/thread/[product]/[id]', params: { product: hit.product, id: hit.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 18, paddingTop: 19, paddingBottom: 15, paddingLeft: size.inset, paddingRight: 12, marginTop: first && !flush ? 14 : 0, backgroundColor: pressed ? color.fill : 'transparent' })}>
      {!first && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.line }} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T numberOfLines={1} style={{ fontSize: 14, lineHeight: 18.9, letterSpacing: -0.14 }}>
          <Runs runs={hit.title} weight={font.semibold} />
          {hit.toApprove ? <Text style={{ color: color.faint }}>{`  ${hit.toApprove}`}</Text> : null}
        </T>
        <T numberOfLines={1} style={{ marginTop: 3, fontSize: 13, lineHeight: 18.85, color: color.dim }}><Runs runs={hit.summary} weight={font.medium} /></T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 2, height: 18 }}>
        {hit.bars && <View style={{ opacity: hit.bars === 1 ? 0.7 : 0.75, transform: [{ translateY: 1 }] }}><PriorityBars level={hit.bars} /></View>}
        <T numberOfLines={1} style={meta}>{hit.projectName}</T>
        <T style={meta}>{hit.when}</T>
      </View>
    </Pressable>
  );
}

const SETTINGS_ROWS = SETTINGS_PAGES.map((p) => ({ id: p.id, label: p.label }));

const Label = ({ children }: { children: string }) => (
  <T style={{ paddingHorizontal: size.inset, paddingTop: 16, paddingBottom: 4, fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase', color: color.faint }}>{children}</T>
);

function CommandRow({ label, aside, onPress }: { label: string; aside?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: size.inset, paddingRight: 16, backgroundColor: pressed ? color.fill : 'transparent' })}>
      <T numberOfLines={1} style={{ flex: 1, fontSize: 15.5, lineHeight: 21 }}>{label}</T>
      {aside ? <T style={{ fontSize: 12.5, color: color.faint }}>{aside}</T> : null}
    </Pressable>
  );
}

export default function Search() {
  const c = useCloud();
  const g = useGroups();
  const { pick: pickLook } = useLook();
  const inset = useSafeAreaInsets();
  const [q, setQ] = useState('');
  // "See all" is the whole list of threads, as it was before there were commands.
  const [all, setAll] = useState(false);
  const hits = useMemo(() => phoneSearch(c.view, q, c.now, c.tabs), [c.view, q, c.now, c.tabs]);
  const found = q.trim() ? hits : [];
  const commands = useMemo(() => commandsFor(q, phoneCommands({
    team: !!c.team || g.on,
    mates: c.team?.view.list ?? [],
    groups: g.on ? g.state.rooms.map((r) => ({ id: r.id, name: groupName(r) })) : [],
    looks: PHONE_LOOKS,
    pages: SETTINGS_ROWS,
  })), [q, c.team, g.on, g.state.rooms]);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const run = ({ act }: PhoneCommand) => {
    if ('look' in act) { pickLook(act.look); leave(); return; }
    if ('push' in act) { if (router.canGoBack()) router.replace(act.push as never); else router.push(act.push as never); return; }
    if ('group' in act) { g.setLast(act.group); c.goTo({ place: 'chats', group: true }); leave(); return; }
    c.goTo({ place: act.go, menu: act.menu });
    leave();
  };
  return (
    <Wall>
      <View style={{ paddingTop: inset.top, borderBottomWidth: 1, borderBottomColor: color.line, backgroundColor: color.bg }}>
        <View style={{ height: size.topBar, justifyContent: 'center', paddingLeft: size.inset, paddingRight: 48 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: color.lineStrong, paddingBottom: 9, marginTop: 8 }}>
            <Glass />
            <TextInput value={q} onChangeText={(t) => { setQ(t); setAll(false); }} autoFocus placeholder="Search" placeholderTextColor={color.faint}
              autoCorrect={false} autoCapitalize="none" spellCheck={false} returnKeyType="search" accessibilityLabel="Search threads"
              style={[{ flex: 1, minWidth: 0, padding: 0, fontFamily: font.medium, fontSize: 15, letterSpacing: -0.075, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
            <Pressable onPress={() => router.back()} accessibilityLabel="Close search" accessibilityRole="button" hitSlop={10}
              style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
              <Out />
            </Pressable>
          </View>
        </View>
      </View>
      {c.status && (
        <View accessibilityRole="alert" style={{ marginTop: 6, marginHorizontal: size.inset, marginBottom: 2, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: color.lineStrong }}>
          <T style={{ fontSize: 13, lineHeight: 18.2, color: color.dim }}>{c.status}</T>
        </View>
      )}
      <FlatList
        data={all ? found : found.slice(0, THREADS_SHOWN)}
        keyExtractor={(h) => h.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item, index }) => <HitRow hit={item} first={index === 0} flush={!all} />}
        ListHeaderComponent={!all && found.length > 0 ? <Label>Threads</Label> : undefined}
        ListFooterComponent={all ? undefined : (
          <>
            {found.length > THREADS_SHOWN && <CommandRow label={`See all ${found.length} threads`} onPress={() => setAll(true)} />}
            {commands.length > 0 && found.length > 0 && <Label>Commands</Label>}
            {commands.map((cmd) => <CommandRow key={cmd.id} label={cmd.label} aside={cmd.aside} onPress={() => run(cmd)} />)}
          </>
        )}
        ListEmptyComponent={q.trim() && commands.length === 0 ? <T style={{ paddingVertical: 80, paddingHorizontal: 40, textAlign: 'center', fontSize: 14, color: color.faint }}>{`Nothing matches “${q}”.`}</T> : undefined}
        contentContainerStyle={{ paddingBottom: 40 + inset.bottom }}
      />
    </Wall>
  );
}
