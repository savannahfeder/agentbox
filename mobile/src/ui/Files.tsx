// How a thread's messages reach the files they name on the phone app, and the
// tiles for its documents and designs (MessageFiles.tsx on the phone site).
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { docKind } from '../../../renderer/src/doc-pane';
import { fileGlance, type Glance } from '../../../renderer/src/file-glance';
import { folderTitle } from '../../../renderer/src/mentions';
import { docOnPhone, folderPictures, linkToShare, openingOf, pageOnPhone, pictureLink, pictureShapeOf, sentEmbeds, threadFilePaths, typedWords } from '../lib/files';
import { withDeadline } from '../lib/deadline';
import { useCloud } from '../state/cloud';
import { offerLink } from './LinkMenu';
import { Skeleton } from './Skeleton';
import { Markdown, type MessageFiles } from './Markdown';
import { PageFrame } from './PageFrame';
import { T } from './parts';
import { color, font } from './theme';

export const readLink = async (url: string) => {
  const res = await withDeadline(fetch)(url);
  if (!res.ok) throw new Error('This page could not be read.');
  return res.text();
};

/** The viewer for a file, a page, a film, or pictures to step through (app/file.tsx). */
export function showFile(product: string, src: string, among?: string[]) {
  router.push({ pathname: '/file', params: { product, src, ...(among?.length ? { among: JSON.stringify(among) } : {}) } });
}

/** The project's folder on the phone and the lookups a message draws its files with. */
export function useMessageFiles(product: string, thread?: string): { dir: string | null; files: MessageFiles } {
  const c = useCloud();
  const { places, products, items } = c.view;
  const dir = products.find((p: { slug: string }) => p.slug === product)?.dir || null;
  // Every read of her rows makes the view anew; the lookups read the newest
  // through `latest` and are made again only when her files change, so a
  // message is not read again, nor a player started again, every five seconds.
  const latest = useRef({ places, items, links: c.links, say: c.say });
  latest.current = { places, items, links: c.links, say: c.say };
  const place = places.get(product);
  const shape = `${place?.files.size ?? 0}|${place?.folders.size ?? 0}|${c.signedAt}`;
  const files = useMemo<MessageFiles>(() => ({
    picture: (src) => pictureLink(latest.current.places, latest.current.links, product, src),
    shape: (src) => pictureShapeOf(latest.current.places, product, src),
    media: (src) => pictureLink(latest.current.places, latest.current.links, product, src) ?? null,
    folder: (src) => {
      const found = folderPictures(latest.current.places, product, src);
      const name = (id: string) => latest.current.items.find((i: { id: string; title?: string }) => i.id === id)?.title ?? null;
      return found && { title: folderTitle(src, { thread, name }), pictures: found.pictures, total: found.total };
    },
    hold: (src) => {
      const { places, links, say } = latest.current;
      offerLink(linkToShare(openingOf(places, links, product, src)), src.replace(/\/+$/, '').split('/').pop() || src, say);
    },
    open: (src, among) => {
      const { places, links, say } = latest.current;
      const o = openingOf(places, links, product, src);
      switch (o.kind) {
        case 'web': void (/^mailto:/i.test(o.url) ? Linking.openURL(o.url) : WebBrowser.openBrowserAsync(o.url)); return;
        case 'elsewhere': void WebBrowser.openBrowserAsync(o.link); return;
        case 'refused': say(o.error); return;
        case 'folder':
          if (o.pictures.length) showFile(product, o.pictures[0], o.pictures);
          else say('This folder is on your computer.');
          return;
        case 'picture': showFile(product, src, among?.length ? among : [src]); return;
        default: showFile(product, src);
      }
    },
  }), [product, thread, shape]);
  return { dir, files };
}

/** The files a message you sent carries, under its words: draw `typedWords(text)` as the words. */
export function SentFiles({ text, product }: { text: string; product: string }) {
  const { dir, files } = useMessageFiles(product);
  const embeds = sentEmbeds(text);
  if (!embeds.length) return null;
  return (
    <View style={{ marginTop: typedWords(text).trim() ? 10 : 0, gap: 10 }}>
      {embeds.map((line, i) => <Markdown key={i} text={line} dir={dir} files={files} />)}
    </View>
  );
}

const KIND_LABEL: Record<string, string> = { html: 'Design', image: 'Picture', markdown: 'Document', code: 'Code', website: 'Website' };
// A tile's page is `--doc-page` (`color.sunk`); one still on its way is `--bg-raised` (`color.raised`).

/** Every design and document a thread names, as small framed tiles; one the phone cannot read gets none. */
export function ThreadFiles({ item, product }: { item: { id: string; result?: string | null; note?: string | null; body?: string | null; answer?: string | null }; product: string }) {
  const { dir, files } = useMessageFiles(product, item.id);
  const paths = useMemo(() => threadFilePaths(item, dir), [item.result, item.note, item.body, item.answer, dir]);
  if (!paths.length) return null;
  return (
    <View accessibilityLabel="Files" style={{ marginTop: 12, marginBottom: 20, gap: 10 }}>
      {paths.map((path) => <FileTile key={path} product={product} path={path} open={() => files.open(path)} hold={() => files.hold?.(path)} />)}
    </View>
  );
}

type Face = { glance: Glance; html?: string };

function FileTile({ product, path, open, hold }: { product: string; path: string; open: () => void; hold: () => void }) {
  const c = useCloud();
  const kind = docKind(path);
  // undefined until the first read answers; null for a file the phone cannot read.
  const [face, setFace] = useState<Face | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const places = c.view.places;
    const read = async (): Promise<Face | null | undefined> => {
      if (kind === 'markdown') {
        const r = await docOnPhone(places, c.links, product, path, readLink);
        return r.ok ? { glance: fileGlance(r.text, 'markdown') } : waiting(r.error);
      }
      if (kind === 'html') {
        const r = await pageOnPhone(places, c.links, product, path, readLink);
        return r.ok ? { glance: fileGlance(r.html, 'html'), html: r.html } : waiting(r.error);
      }
      return null;
    };
    read().then((f) => { if (live) setFace(f); }, () => { if (live) setFace(null); });
    return () => { live = false; };
  }, [product, path, c.signedAt]);
  const name = path.split('/').pop() ?? path;
  if (face === null) return null;
  const foot = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 7 }}>
      <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, lineHeight: 17, color: color.dim }}>{name}</T>
      <T style={{ fontFamily: font.mono, fontSize: 10, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase', color: color.faint }}>{kind ? KIND_LABEL[kind] : 'File'}</T>
    </View>
  );
  return (
    <Pressable onPress={face ? open : undefined} onLongPress={hold} accessibilityRole="button" accessibilityLabel={`Open ${name}`} accessibilityHint="Hold to open it in the browser or share it">
      <View style={{ height: 104, backgroundColor: face ? color.sunk : color.raised, overflow: 'hidden' }}>
        {face?.html !== undefined ? <PageFrame html={face.html} desktop style={{ flex: 1 }} /> : face ? <MiniPage title={face.glance.title || name} blocks={face.glance.blocks} /> : <Skeleton small />}
        <Ticks />
      </View>
      {foot}
    </Pressable>
  );
}

// A file on its way holds its tile's place; one that is not on the phone gets none.
const waiting = (error: string) => (/on its way/.test(error) ? undefined : null);

// The window's L-shaped corner marks, tucked onto the tile's corners.
function Ticks() {
  const tick = { position: 'absolute' as const, width: 8, height: 8, borderColor: color.lineStrong };
  return (
    <>
      <View style={{ ...tick, top: 0, left: 0, borderTopWidth: 1, borderLeftWidth: 1 }} />
      <View style={{ ...tick, top: 0, right: 0, borderTopWidth: 1, borderRightWidth: 1 }} />
      <View style={{ ...tick, bottom: 0, left: 0, borderBottomWidth: 1, borderLeftWidth: 1 }} />
      <View style={{ ...tick, bottom: 0, right: 0, borderBottomWidth: 1, borderRightWidth: 1 }} />
    </>
  );
}

/** A document as a small page: its title and opening lines, fading out at the foot. */
function MiniPage({ title, blocks }: { title: string; blocks: Glance['blocks'] }) {
  return (
    <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 3, overflow: 'hidden' }}>
      <T style={{ fontSize: 12, lineHeight: 16, fontFamily: font.medium, marginBottom: 2 }}>{title}</T>
      {blocks.map((b, i) => (b.heading
        ? <T key={i} style={{ fontSize: 10, lineHeight: 14, fontFamily: font.medium, color: color.dim, marginTop: 3 }}>{b.text}</T>
        : <T key={i} style={{ fontSize: 10, lineHeight: 14, color: color.faint }}>{b.text}</T>))}
      <Svg style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%' }} width="100%" height="30%" pointerEvents="none">
        <Defs><LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color.sunk} stopOpacity={0} /><Stop offset="1" stopColor={color.sunk} stopOpacity={1} /></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#fade)" />
      </Svg>
    </View>
  );
}
