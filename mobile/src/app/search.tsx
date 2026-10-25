// Search, as the phone site draws it: the field takes the top bar, and every
// thread in every tab is found, closed ones too (App.tsx `hits`, List.tsx's row).
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { phoneSearch, type Hit } from '../lib/tabs';
import { useCloud } from '../state/cloud';
import { PriorityBars, T, Wall } from '../ui/parts';
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

function HitRow({ hit, first }: { hit: Hit; first: boolean }) {
  const meta = { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.66, textTransform: 'uppercase' as const, color: color.faint };
  return (
    <Pressable onPress={() => router.push({ pathname: '/thread/[product]/[id]', params: { product: hit.product, id: hit.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 18, paddingTop: 19, paddingBottom: 15, paddingLeft: size.inset, paddingRight: 12, marginTop: first ? 14 : 0, backgroundColor: pressed ? color.fill : 'transparent' })}>
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

export default function Search() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const hits = useMemo(() => phoneSearch(c.view, q, c.now, c.tabs), [c.view, q, c.now, c.tabs]);
  return (
    <Wall>
      <View style={{ paddingTop: inset.top, borderBottomWidth: 1, borderBottomColor: color.line, backgroundColor: color.bg }}>
        <View style={{ height: size.topBar, justifyContent: 'center', paddingLeft: size.inset, paddingRight: 48 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: color.lineStrong, paddingBottom: 9, marginTop: 8 }}>
            <Glass />
            <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search people or messages" placeholderTextColor={color.faint}
              autoCorrect={false} autoCapitalize="none" spellCheck={false} returnKeyType="search" accessibilityLabel="Search threads"
              style={{ flex: 1, minWidth: 0, padding: 0, fontFamily: font.medium, fontSize: 15, letterSpacing: -0.075, color: color.text }} />
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
        data={hits}
        keyExtractor={(h) => h.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item, index }) => <HitRow hit={item} first={index === 0} />}
        ListEmptyComponent={q.trim() ? <T style={{ paddingVertical: 80, paddingHorizontal: 40, textAlign: 'center', fontSize: 14, color: color.faint }}>{`Nothing matches “${q}”.`}</T> : undefined}
        contentContainerStyle={{ paddingBottom: 40 + inset.bottom }}
      />
    </Wall>
  );
}
