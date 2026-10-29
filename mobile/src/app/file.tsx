// A file opened from a thread. A picture, or a folder's pictures, opens large
// in a dark room as the phone site's PictureView does; a document reads in
// place and a page draws in place, as its document pane does; a film or a
// sound plays.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { MAX_ZOOM, fitScale } from '../../../renderer/src/picture-view';
import { docOnPhone, openingOf, pageOnPhone, pictureLink } from '../lib/files';
import { useCloud } from '../state/cloud';
import { readLink, useMessageFiles } from '../ui/Files';
import { Back } from '../ui/icons';
import { Markdown } from '../ui/Markdown';
import { PageFrame } from '../ui/PageFrame';
import { IconButton, T, TopBar, Wall } from '../ui/parts';
import { Player } from '../ui/Player';
import { Skeleton } from '../ui/Skeleton';
import { color } from '../ui/theme';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const nameOf = (src: string) => src.split('/').pop() ?? src;

export default function FileScreen() {
  const { product, src, among } = useLocalSearchParams<{ product: string; src: string; among?: string }>();
  const pictures = useMemo(() => { try { const a = JSON.parse(String(among ?? '')); return Array.isArray(a) && a.length ? a.map(String) : null; } catch { return null; } }, [among]);
  if (pictures) return <PictureRoom product={String(product)} pictures={pictures} start={Math.max(0, pictures.indexOf(String(src)))} />;
  return <OnItsOwn product={String(product)} src={String(src)} />;
}

/** A document, a page, a film or a sound, under a bar with its name (`.doc-pane` on the phone). */
function OnItsOwn({ product, src }: { product: string; src: string }) {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const o = openingOf(c.view.places, c.links, product, src);
  const card = { flex: 1, margin: 12, marginBottom: 12 + inset.bottom };
  let body;
  if (o.kind === 'doc') body = <Doc product={product} src={src} style={{ ...card, borderWidth: 1, borderColor: color.lineStrong, borderRadius: 3 }} />;
  else if (o.kind === 'page') body = <Page product={product} src={src} style={{ ...card, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: PAGE }} />;
  else if (o.kind === 'media') {
    const film = /\.(mp4|mov|m4v|webm)$/i.test(src);
    body = (
      <View style={{ ...card, borderWidth: 1, borderColor: color.line, backgroundColor: RAISED, justifyContent: film ? undefined : 'center', padding: film ? 0 : 16 }}>
        <Player link={o.link} film={film} style={film ? { flex: 1 } : { height: 36 }} />
      </View>
    );
  } else body = <Said words={o.kind === 'refused' ? o.error : 'This file is on your computer.'} />;
  return (
    <Wall>
      <TopBar left={<IconButton label="Back" width={34} onPress={back}><Back /></IconButton>}
        title={<T numberOfLines={1} style={{ fontSize: 15, paddingLeft: 10, paddingRight: 6 }}>{nameOf(src)}</T>} />
      {body}
    </Wall>
  );
}

const PAGE = '#282625';
const RAISED = '#2f2d2c';
const Said = ({ words }: { words: string }) => <T style={{ padding: 28, textAlign: 'center', fontSize: 14, color: color.faint }}>{words}</T>;

function Doc({ product, src, style }: { product: string; src: string; style: object }) {
  const c = useCloud();
  const { dir, files } = useMessageFiles(product);
  const [doc, setDoc] = useState<{ text: string } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    docOnPhone(c.view.places, c.links, product, src, readLink).then((r) => { if (live) setDoc(r.ok ? { text: r.text } : { error: r.error }); });
    return () => { live = false; };
  }, [product, src, c.signedAt]);
  return (
    <View style={style}>
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingHorizontal: 16, paddingBottom: 40 }}>
        {doc && ('text' in doc ? <Markdown doc text={doc.text} dir={dir} files={files} /> : <Said words={doc.error} />)}
      </ScrollView>
      {!doc && <View style={StyleSheet.absoluteFill}><Skeleton /></View>}
    </View>
  );
}

function Page({ product, src, style }: { product: string; src: string; style: object }) {
  const c = useCloud();
  const [page, setPage] = useState<{ html: string } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    pageOnPhone(c.view.places, c.links, product, src, readLink).then((r) => { if (live) setPage(r.ok ? { html: r.html } : { error: r.error }); });
    return () => { live = false; };
  }, [product, src, c.signedAt]);
  return <View style={style}>{page ? ('html' in page ? <PageFrame html={page.html} style={{ flex: 1 }} /> : <Said words={page.error} />) : <Skeleton />}</View>;
}

// The dark room's own ink, `--read-paper` over `--read-ground`.
const GROUND = '#0f1013';
const paper = (a: number) => `rgba(250, 251, 252, ${a})`;
const OUTSIDE = 'M13.5 4.5h6v6M19.5 4.5l-8 8M17.5 13.5v6h-13v-13h6';
const CROSS = 'M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4';
const Glyph = ({ d }: { d: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={paper(0.62)} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round"><Path d={d} /></Svg>
);
const glass = { backgroundColor: 'rgba(15, 16, 19, 0.34)' };

/**
 * Pictures opened large, one at a time, the others a swipe or a thumbnail
 * away. The site's room keeps 104px either side for its step arrows, which
 * on a phone leaves a picture a third of the screen wide; here the picture
 * takes the width, and a swipe is the step.
 */
function PictureRoom({ product, pictures, start }: { product: string; pictures: string[]; start: number }) {
  const c = useCloud();
  const { width, height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [index, setIndex] = useState(start);
  const list = useRef<FlatList<string>>(null);
  const many = pictures.length > 1;
  const linkOf = (p: string) => pictureLink(c.view.places, c.links, product, p);
  const shown = pictures[index] ?? pictures[0];
  const url = linkOf(shown);
  const go = (i: number) => { setIndex(i); list.current?.scrollToIndex({ index: i, animated: true }); };
  const stage = { top: inset.top + 86, bottom: inset.bottom + (many ? 116 : 40) };
  return (
    <View style={{ flex: 1, backgroundColor: GROUND }}>
      <Stack.Screen options={{ animation: 'fade' }} />
      {/* The picture's own colours, blurred, light the room. */}
      {!!url && <Image source={{ uri: url }} blurRadius={80} resizeMode="cover" style={{ position: 'absolute', left: -width * 0.12, top: -height * 0.12, width: width * 1.24, height: height * 1.24, opacity: 0.7 }} />}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs><RadialGradient id="room" cx="0.5" cy="0.5" r="0.5"><Stop offset="0.55" stopColor={GROUND} stopOpacity={0} /><Stop offset="1" stopColor={GROUND} stopOpacity={0.7} /></RadialGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#room)" />
      </Svg>
      <FlatList ref={list} data={pictures} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(p) => p}
        initialScrollIndex={start} getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScroll={(e) => { const i = Math.round(e.nativeEvent.contentOffset.x / width); if (i !== index && i >= 0 && i < pictures.length) setIndex(i); }}
        scrollEventThrottle={32}
        renderItem={({ item }) => <Shown uri={linkOf(item)} name={nameOf(item)} width={width} height={height} stage={stage} />} />
      <View style={{ position: 'absolute', top: inset.top + 16, left: 16, right: 16, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <View style={{ ...glass, height: 46, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
          <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, letterSpacing: 0.13, color: paper(0.86) }}>{nameOf(shown)}</T>
          {many && <T style={{ fontFamily: 'GeistMono_500Medium', fontSize: 11, letterSpacing: 1.32, color: paper(0.42) }}>{`${index + 1} / ${pictures.length}`}</T>}
        </View>
        <View style={{ ...glass, padding: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {!!url && (
            <Pressable onPress={() => void WebBrowser.openBrowserAsync(url)} accessibilityRole="button" accessibilityLabel="Open in the browser" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph d={OUTSIDE} />
            </Pressable>
          )}
          {!!url && <View style={{ width: 1, height: 18, marginHorizontal: 6, backgroundColor: paper(0.14) }} />}
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph d={CROSS} />
          </Pressable>
        </View>
      </View>
      {many && (
        <View style={{ position: 'absolute', bottom: inset.bottom + 24, left: 32, right: 32, alignItems: 'center' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ ...glass, flexGrow: 0, maxWidth: '100%' }} contentContainerStyle={{ padding: 8, gap: 8 }}>
            {pictures.map((p, i) => {
              const thumb = linkOf(p);
              return (
                <Pressable key={p} onPress={() => go(i)} accessibilityRole="imagebutton" accessibilityLabel={nameOf(p)}
                  style={{ padding: 3, borderWidth: 1, borderColor: i === index ? paper(0.85) : 'transparent', margin: -4 }}>
                  <View style={{ width: 72, height: 45, backgroundColor: paper(0.06), opacity: i === index ? 1 : 0.38, overflow: 'hidden' }}>
                    {!!thumb && <Image source={{ uri: thumb }} resizeMode="cover" style={{ width: 72, height: 45 }} />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/** One picture, fitted to the room and never drawn larger than it is; a pinch looks closer. */
function Shown({ uri, name, width, height, stage }: { uri: string | null | undefined; name: string; width: number; height: number; stage: { top: number; bottom: number } }) {
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!uri) return;
    let live = true;
    Image.getSize(uri, (w, h) => { if (live) setNatural({ w, h }); }, () => {});
    return () => { live = false; };
  }, [uri]);
  const box = { w: width - 32, h: height - stage.top - stage.bottom };
  const fit = fitScale(natural, box);
  return (
    <View style={{ width, height }}>
      <ScrollView style={{ position: 'absolute', top: stage.top, left: 16, width: box.w, height: box.h }} contentContainerStyle={{ width: box.w, height: box.h, alignItems: 'center', justifyContent: 'center' }}
        maximumZoomScale={MAX_ZOOM} minimumZoomScale={1} centerContent showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
        {!!uri && natural.w > 0 && (
          <Image source={{ uri }} accessibilityLabel={name} resizeMode="contain"
            style={{ width: natural.w * fit, height: natural.h * fit, borderWidth: 1, borderColor: paper(0.08) }} />
        )}
      </ScrollView>
    </View>
  );
}
