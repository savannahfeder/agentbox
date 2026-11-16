// Files on the phone: every file a thread sent, newest first, to search, open,
// or follow back to its thread (renderer/src/files/FilesPlace.tsx, drawn small).
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { KIND_PLURAL, kindsIn, sizeWords } from '../../../renderer/src/files/files-shown';
import { updatedWords } from '../../../renderer/src/threads/page-rules';
import type { FileKind } from '../../../renderer/src/types';
import { filesOnPhone, phoneFiles, type PhoneFile } from '../lib/files-place';
import { linkToShare, openingOf, pictureLink, pictureSource } from '../lib/files';
import { router } from '../lib/router';
import { useCloud } from '../state/cloud';
import { showFile } from './Files';
import { Magnifier } from './Filters';
import { Caret, Gear } from './icons';
import { share } from './LinkMenu';
import { Waiting } from './LogoOrbit';
import { IconButton, Sheet, SheetHead, SheetRow, SheetSep, T, TopBar } from './parts';
import { color, corner, font, size } from './theme';

const THUMB = 36;

const openThread = (product: string, id: string) => router.push({ pathname: '/thread/[product]/[id]', params: { product, id } });

function KindGlyph({ kind }: { kind: FileKind | null }) {
  const d = {
    image: 'M3 4.5h10v7H3z M3.5 11l3-3 2 2 1.5-1.5 2.5 2.5',
    film: 'M3 4.5h10v7H3z M7 6.3v3.4l2.8-1.7z',
    deck: 'M3 4h10v6.5H3z M8 10.5V13 M6 13h4',
    page: 'M2.5 3.5h11v9h-11z M2.5 6h11',
    table: 'M2.5 3h11v10h-11z M2.5 6.4h11 M2.5 9.7h11 M6.2 6.4V13',
    code: 'M6 5 3 8l3 3 M10 5l3 3-3 3',
  }[kind as string] ?? 'M4 2.5h5l3 3v8H4z M9 2.5v3h3 M6 8.5h4 M6 10.8h4';
  return <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke={color.faint} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round"><Path d={d} /></Svg>;
}

function Lead({ file }: { file: PhoneFile }) {
  const c = useCloud();
  const link = file.kind === 'image' && !file.big ? pictureLink(c.view.places, c.links, file.product, file.path) : null;
  const [broken, setBroken] = useState(false);
  return (
    <View style={{ width: THUMB, height: THUMB, borderRadius: corner.small, borderWidth: 1, borderColor: color.line, backgroundColor: color.fill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {link && !broken
        ? <Image source={pictureSource(link)} cachePolicy="memory-disk" contentFit="cover" onError={() => setBroken(true)} style={{ width: THUMB, height: THUMB }} />
        : <KindGlyph kind={file.kind} />}
    </View>
  );
}

function FileRow({ file, first, now, open, hold }: { file: PhoneFile; first: boolean; now: number; open: () => void; hold: () => void }) {
  const small = { fontSize: 11, lineHeight: 20, color: color.faint };
  const from = file.threads[0];
  return (
    <Pressable onPress={open} onLongPress={hold} delayLongPress={350} accessibilityRole="button" accessibilityLabel={`Open ${file.name}`} accessibilityHint="Hold for the thread it came from"
      style={({ pressed }) => ({ minHeight: 64, paddingVertical: 12, paddingLeft: size.inset, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? color.fill : 'transparent' })}>
      {!first && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
      <Lead file={file} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T numberOfLines={1} style={{ fontSize: 16, lineHeight: 21.6, letterSpacing: -0.16, color: file.big ? color.dim : color.text }}>{file.name}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 8 }}>
          <T numberOfLines={1} style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 20, letterSpacing: 0.55, textTransform: 'uppercase', color: color.dim, flexShrink: 0, maxWidth: '40%' }}>{file.projectName}</T>
          <T style={small}>·</T>
          {file.big
            ? <T numberOfLines={1} style={{ ...small, flexShrink: 1 }}>{`${sizeWords(file.bytes)}, too big for your phone`}</T>
            : <>
              <T numberOfLines={1} style={{ ...small, flexShrink: 1 }}>{from.title}</T>
              <T style={small}>·</T>
              <T style={{ ...small, flexShrink: 0 }}>{updatedWords(file.at, now)}</T>
            </>}
        </View>
      </View>
    </Pressable>
  );
}

function Chip({ label, on, onPress, trail }: { label: string; on: boolean; onPress: () => void; trail?: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ height: 28, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: corner.small,
        borderColor: on ? color.lineStrong : color.line, backgroundColor: on || pressed ? color.picked : 'transparent' })}>
      <T style={{ fontSize: 13, lineHeight: 17, color: on ? color.text : color.dim }}>{label}</T>
      {trail}
    </Pressable>
  );
}

export function FilesPlace({ tabs }: { tabs: ReactNode }) {
  const c = useCloud();
  const files = useMemo(() => phoneFiles(c.rows.threads, c.view.products, c.view.aliases), [c.rows.threads, c.view.products, c.view.aliases]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<FileKind | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [held, setHeld] = useState<PhoneFile | null>(null);
  const [pulling, setPulling] = useState(false);
  const projects = useMemo(() => [...new Set(files.map((f) => f.projectName))], [files]);
  const place = project && projects.includes(project) ? project : null;
  const kinds = kindsIn(filesOnPhone(files, { project: place }));
  const k = kind && kinds.includes(kind) ? kind : null;
  const shown = filesOnPhone(files, { query, kind: k, project: place });

  const open = (f: PhoneFile) => {
    const o = openingOf(c.view.places, c.links, f.product, f.path);
    if (o.kind === 'refused') { c.say(o.error); return; }
    if (o.kind === 'elsewhere') { void WebBrowser.openBrowserAsync(o.link); return; }
    if (o.kind === 'picture') {
      const among = shown.filter((s) => s.product === f.product && s.kind === 'image' && !s.big).map((s) => s.path);
      showFile(f.product, f.path, among.length ? among : [f.path]);
      return;
    }
    showFile(f.product, f.path);
  };
  const heldLink = held && !held.big ? linkToShare(openingOf(c.view.places, c.links, held.product, held.path)) : null;
  const leave = (then: () => void) => { setHeld(null); then(); };

  return (
    <>
      <TopBar title="Files" right={<IconButton label="Settings" onPress={() => router.push('/settings')}><Gear /></IconButton>} below={tabs} />
      {files.length > 0 && (
        <View style={{ paddingTop: 12, paddingBottom: 6, gap: 10 }}>
          <View style={{ marginHorizontal: size.inset, height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderWidth: 1, borderRadius: corner.small, borderColor: color.line, backgroundColor: color.field }}>
            <Magnifier size={15} tint={color.faint} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search files" placeholderTextColor={color.faint} accessibilityLabel="Search files"
              autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing"
              style={[{ flex: 1, height: 38, fontFamily: font.regular, fontSize: 15, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: size.inset, gap: 6, alignItems: 'center' }}>
            {projects.length > 1 && <>
              <Chip label={place ?? 'All projects'} on={!!place} onPress={() => setChoosing(true)} trail={<Caret size={10} tint={color.faint} />} />
              <View style={{ width: 1, height: 16, marginHorizontal: 4, backgroundColor: color.line }} />
            </>}
            <Chip label="All" on={!k} onPress={() => setKind(null)} />
            {kinds.map((x) => <Chip key={x} label={KIND_PLURAL[x]} on={k === x} onPress={() => setKind(k === x ? null : x)} />)}
          </ScrollView>
        </View>
      )}
      <FlatList
        data={shown}
        keyExtractor={(f) => f.key}
        renderItem={({ item, index }) => <FileRow file={item} first={index === 0} now={c.now} open={() => open(item)} hold={() => setHeld(item)} />}
        refreshControl={<RefreshControl tintColor={color.dim} refreshing={pulling} onRefresh={async () => { setPulling(true); await c.refresh(); setPulling(false); }} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={c.loading ? <Waiting list /> : <T style={{ paddingHorizontal: size.inset, paddingTop: 28, fontSize: 15, lineHeight: 23, color: color.dim }}>{files.length ? 'No file matches.' : 'Nothing in Files yet.'}</T>}
        contentContainerStyle={{ paddingBottom: Math.max(40, c.approvalRoom + 16) }}
      />
      <Sheet open={choosing} close={() => setChoosing(false)}>
        <SheetHead>Project</SheetHead>
        <SheetRow label="All projects" on={!place} onPress={() => { setProject(null); setChoosing(false); }} />
        {projects.map((p) => <SheetRow key={p} label={p} on={place === p} onPress={() => { setProject(p); setChoosing(false); }} />)}
      </Sheet>
      <Sheet open={!!held} close={() => setHeld(null)}>
        {held && <>
          <T numberOfLines={1} style={{ paddingTop: 6, paddingHorizontal: 14, paddingBottom: 10, fontSize: 13, color: color.faint }}>{held.name}</T>
          {held.threads.length === 1
            ? <SheetRow label="Open the thread it came from" onPress={() => leave(() => openThread(held.threads[0].product, held.threads[0].id))} />
            : <>
              <SheetHead>Open the thread it came from</SheetHead>
              {held.threads.map((t) => <SheetRow key={`${t.product}/${t.id}`} label={t.title} aside={updatedWords(t.at, c.now)} onPress={() => leave(() => openThread(t.product, t.id))} />)}
            </>}
          {heldLink && <><SheetSep /><SheetRow label="Share or copy link" onPress={() => leave(() => share(heldLink))} /></>}
        </>}
      </Sheet>
    </>
  );
}
