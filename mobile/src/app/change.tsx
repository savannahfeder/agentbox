// One file of a finished run's change, opened from the change card under a
// thread's answer: its added and removed lines, as the desktop's code pane draws them.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signed } from '../../../renderer/src/change-figures';
import { fileOnPhone } from '../../../renderer/src/phone-links';
import { changedFileIn, changeKeyOf, codeLines, computerIdOf, type CodeLine } from '../lib/change';
import { router } from '../lib/router';
import { useCloud } from '../state/cloud';
import { readLink } from '../ui/Files';
import { Back } from '../ui/icons';
import { IconButton, T, TopBar, Wall } from '../ui/parts';
import { Skeleton } from '../ui/Skeleton';
import { color, font } from '../ui/theme';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
// The change is one file for every changed file, so it is read once per version.
const read = new Map<string, Promise<string>>();

export default function ChangeScreen() {
  const { product, id, path } = useLocalSearchParams<{ product: string; id: string; path: string }>();
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const at = fileOnPhone(c.view.places, c.links, String(product), changeKeyOf(computerIdOf(c.view.aliases, String(id))));
  const link = at.ok ? at.link : null;
  const name = at.ok ? (!at.sent && at.found.entry.n) || at.link : null;
  const [got, setGot] = useState<{ name: string; text: string } | { name: string; error: string } | null>(null);
  useEffect(() => {
    if (!name || !link) return;
    let live = true;
    if (!read.has(name)) read.set(name, readLink(link).catch((e) => { read.delete(name); throw e; }));
    read.get(name)!.then((t) => { if (live) setGot({ name, text: t }); }, () => { if (live) setGot({ name, error: 'This change could not be read.' }); });
    return () => { live = false; };
  }, [name, link]);
  const text = got && got.name === name ? got : null;

  const file = useMemo(() => (text && 'text' in text ? changedFileIn(text.text, String(path)) : null), [text, path]);
  const lines = useMemo(() => (file ? codeLines(file) : []), [file]);
  const said = !at.ok ? at.error : text && 'error' in text ? text.error : text && !file ? 'This file is not in the change any more.' : null;

  return (
    <Wall>
      <TopBar noReview left={<IconButton label="Back" onPress={back}><Back /></IconButton>}
        title={<T numberOfLines={1} ellipsizeMode="head" style={{ fontFamily: font.mono, fontSize: 13.5, paddingLeft: 10, paddingRight: 6 }}>{String(path)}</T>}
        right={file ? <View style={{ flexDirection: 'row', gap: 8, paddingRight: 12 }}>{signed(file).map(({ sign, text: t }) => (
          <T key={sign} style={{ fontFamily: font.mono, fontSize: 12.5, color: sign === '+' ? color.plus : color.minus }}>{t}</T>
        ))}</View> : null} />
      {said ? <T style={{ padding: 28, textAlign: 'center', fontSize: 14, color: color.faint }}>{said}</T>
        : !file ? <Skeleton />
          : <FlatList data={lines} keyExtractor={(l) => l.key} renderItem={({ item }) => <Line line={item} />}
              initialNumToRender={60} windowSize={11} contentContainerStyle={{ paddingTop: 6, paddingBottom: 24 + inset.bottom }} />}
    </Wall>
  );
}

function Line({ line }: { line: CodeLine }) {
  if (line.kind === 'said') {
    return <T style={{ paddingTop: 12, paddingBottom: 6, paddingHorizontal: 16, fontSize: 13, lineHeight: 18, color: color.dim }}>{line.text}</T>;
  }
  if (line.kind === 'skip') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingRight: 14 }}>
        <View style={{ width: 40, height: 1, backgroundColor: color.line }} />
        <T style={{ fontSize: 12.5, color: color.faint }}>{line.lines === 1 ? '1 line' : `${line.lines} lines`}</T>
        <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
      </View>
    );
  }
  const bed = line.mark === '+' ? color.plusBed : line.mark === '-' ? color.minusBed : undefined;
  const ink = line.mark === '+' ? color.plus : line.mark === '-' ? color.minus : color.faint;
  const mono = { fontFamily: font.mono, fontSize: 12, lineHeight: 18.6 };
  return (
    <View style={{ flexDirection: 'row', backgroundColor: bed }}>
      <T style={{ ...mono, width: 36, paddingRight: 6, textAlign: 'right', color: color.faint, fontVariant: ['tabular-nums'] }}>{line.num ?? ''}</T>
      <T style={{ ...mono, width: 16, textAlign: 'center', color: ink }}>{line.mark === '=' ? '' : line.mark}</T>
      <T selectable style={{ ...mono, flex: 1, paddingRight: 12, color: color.text }}>{line.text}</T>
    </View>
  );
}
