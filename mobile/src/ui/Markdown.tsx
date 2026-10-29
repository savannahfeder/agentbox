// A message drawn the way the website draws it in the phone layout: the
// `.markdown` rules in renderer/src/styles.css under the Ember Grid theme,
// as the phone site computes them. What each block is comes from
// lib/markdown.ts; this only draws it.
import { Geist_400Regular_Italic, Geist_600SemiBold_Italic, useFonts } from '@expo-google-fonts/geist';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View, type TextStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { isImagePath, referencedFiles } from '../../../renderer/src/referenced-files';
import { inlineSpans, messageBlocks, type Block, type MentionKind, type Span } from '../lib/markdown';
import { T } from './parts';
import { Player } from './Player';
import { color, font } from './theme';

/** How a message reaches the files it names; the thread screen gives it. */
export interface MessageFiles {
  /** A link to draw the picture from: a url, undefined while it is looked for, null when it is not on the phone. Asked on every draw, so it should be a lookup. */
  picture(src: string): string | null | undefined;
  /** Open the file, the folder or the page it names; `among` are the pictures to step through from a picture. */
  open(src: string, among?: string[]): void;
  /** A folder's pictures as full paths on the phone, and what the folder goes by; null when the phone does not have it. */
  folder?(src: string): { title: string; pictures: string[]; total: number } | null;
  /** The link a film or a sound plays from, or null when the phone does not have it. */
  media?(src: string): string | null;
  /** A picture's width and height as its computer listed them, so its box has its shape before it arrives. */
  shape?(src: string): { w: number; h: number } | null;
}

// The thread's reading type (`.focus-body .markdown`): 16px on 25.6px; a
// document opened on its own reads at 15 on 24 (`.doc-card .markdown`).
// The colour is a getter so it is read as the text draws, in the look worn then.
const BODY: TextStyle = { fontSize: 16, lineHeight: 25.6, get color() { return color.text; } };
const DOC_BODY: TextStyle = { fontSize: 15, lineHeight: 24, get color() { return color.text; } };
// A picture's box and a code span sit on the theme's `--bg-raised`, `color.raised`.
const WEB = /^https?:/i;

interface Drawing { files?: MessageFiles; italics: boolean; body: TextStyle; doc: boolean; pictures: string[]; quiet: boolean }
const Draw = createContext<Drawing>({ italics: false, body: BODY, doc: false, pictures: [], quiet: false });

// Mention.tsx's icons, one per kind, on its 24-unit grid.
function MentionIcon({ kind, tint }: { kind: MentionKind; tint: string }) {
  const shapes: Record<MentionKind, ReactNode> = {
    thread: <><Path d="M5 3v14a3 3 0 0 0 3 3h3M5 7h6" /><Rect x={11} y={3} width={10} height={7} rx={2} /><Rect x={11} y={16} width={10} height={6} rx={2} /></>,
    folder: <Path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />,
    page: <><Rect x={3} y={4} width={18} height={16} rx={2.5} /><Path d="M3 9h18M6.5 6.6h.01M9.3 6.6h.01" /></>,
    doc: <><Path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z" /><Path d="M14 3v5h5M9 13h6M9 16.5h4" /></>,
    image: <><Rect x={3} y={4} width={18} height={16} rx={2.5} /><Circle cx={9} cy={10} r={1.7} /><Path d="m21 15.5-4.5-4.5L7 20.5" /></>,
    code: <Path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />,
    media: <><Rect x={3} y={5} width={18} height={14} rx={2.5} /><Path d="m10 9.5 4.5 2.5-4.5 2.5z" /></>,
    link: <><Path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><Path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>,
    file: <><Path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z" /><Path d="M14 3v5h5" /></>,
  };
  return (
    <View style={{ width: 17, height: 13, transform: [{ translateY: 1.5 }] }}>
      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">{shapes[kind]}</Svg>
    </View>
  );
}

function open(src: string, files?: MessageFiles, among?: string[]) {
  if (files) files.open(src, among);
  else if (WEB.test(src) || /^mailto:/i.test(src)) void Linking.openURL(src);
}

/** Spans, as the nested words of one line of text. */
function Words({ spans }: { spans: Span[] }) {
  const { files, italics } = useContext(Draw);
  return (
    <>
      {spans.map((s, i) => {
        const family = s.code ? font.mono
          : s.bold ? (s.italic && italics ? 'Geist_600SemiBold_Italic' : font.semibold)
            : s.italic && italics ? 'Geist_400Regular_Italic' : undefined;
        const style: TextStyle = {
          ...(family ? { fontFamily: family } : {}),
          ...(s.italic && !italics ? { fontStyle: 'italic' } : {}),
          ...(s.strike ? { textDecorationLine: 'line-through' } : {}),
          ...(s.code ? { fontSize: 13, color: color.text, backgroundColor: color.film } : {}),
        };
        if (s.mention) {
          const { kind, src } = s.mention;
          const can = WEB.test(src) || /^mailto:/i.test(src) || !!files;
          return (
            <Text key={i} onPress={can ? () => open(src, files) : undefined} accessibilityRole={can ? 'link' : undefined}
              style={[style, { color: can ? color.text : color.dim },
                can && { textDecorationLine: 'underline', textDecorationColor: color.lineStrong }]}>
              <MentionIcon kind={kind} tint={color.faint} />{s.text}
            </Text>
          );
        }
        // `.markdown code`'s 5px either side, as thin spaces on its ground. Plain Text, so a run keeps its line's size and colour.
        return <Text key={i} style={style}>{s.code ? ` ${s.text} ` : s.text}</Text>;
      })}
    </>
  );
}

function Picture({ src, alt }: { src: string; alt: string }) {
  const { files, pictures } = useContext(Draw);
  const own = WEB.test(src) || /^data:/i.test(src);
  const uri = own ? src : files ? files.picture(src) : null;
  const known = own ? null : files?.shape?.(src) ?? null;
  const [size, setSize] = useState<{ w: number; h: number } | null>(known);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setSize(known); setBroken(false);
    if (!uri || known) return;
    let live = true;
    Image.getSize(uri, (w, h) => { if (live && w && h) setSize({ w, h }); }, () => { if (live) setBroken(true); });
    return () => { live = false; };
  }, [uri, known?.w, known?.h]);
  if (uri === null || broken) {
    return (
      <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderStyle: 'dashed', borderColor: color.line, paddingVertical: 2, paddingHorizontal: 8 }}>
        <T style={{ fontFamily: font.mono, fontSize: 12.5, lineHeight: 18, color: color.faint }}>missing image: {src}</T>
      </View>
    );
  }
  // Holds the picture's place while it is looked for: at its own shape when its computer listed one, else the site's 4:3 box.
  if (uri === undefined || !size) return <View style={size ? { width: '100%', maxWidth: size.w, aspectRatio: size.w / size.h, backgroundColor: color.raised } : { width: '100%', aspectRatio: 4 / 3, backgroundColor: color.raised }} />;
  const drawn = (
    <Image source={{ uri }} accessibilityLabel={alt} resizeMode="contain" onError={() => setBroken(true)}
      style={{ width: '100%', maxWidth: size.w, aspectRatio: size.w / size.h, borderWidth: 1, borderColor: color.line, backgroundColor: color.raised }} />
  );
  if (/^data:/i.test(src)) return drawn;
  return <Pressable accessibilityRole="imagebutton" accessibilityLabel={alt || src} onPress={() => open(src, files, pictures)}>{drawn}</Pressable>;
}

// MentionIcon's folder at the folder line's 15px (`.folder-preview-name .mention-icon`).
function FolderMark() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color.faint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
    </Svg>
  );
}

const FOLDER_SHOWS = 6;

/** A folder a message names: its name and count, then its newest pictures three across (Focus.tsx `FolderPreview`). */
function Folder({ src }: { src: string }) {
  const { files, quiet } = useContext(Draw);
  const [room, setRoom] = useState(0);
  const shown = files?.folder?.(src) ?? null;
  const title = shown?.title ?? (src.replace(/\/+$/, '').split('/').pop() || src);
  const name = (
    <Pressable onPress={() => open(src, files)} accessibilityRole="link" accessibilityLabel={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
      <FolderMark />
      <T style={{ fontSize: 16, lineHeight: 25.6, fontFamily: font.medium }}>{title}</T>
      {!!shown?.total && <T style={{ fontSize: 14.4, lineHeight: 23, color: color.faint, marginLeft: 2 }}>{`${shown.total} picture${shown.total === 1 ? '' : 's'}`}</T>}
    </Pressable>
  );
  // A message that draws pictures of its own is pointing at those; its folder stays one line.
  if (quiet || !shown?.pictures.length) return name;
  const pictures = shown.pictures.slice(0, FOLDER_SHOWS);
  const more = shown.total - pictures.length;
  return (
    <View>
      {name}
      <View onLayout={(e) => setRoom(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {room > 0 && pictures.map((file) => <Shot key={file} file={file} all={shown.pictures} width={(room - 20) / 3} />)}
      </View>
      {more > 0 && (
        <Pressable onPress={() => open(src, files)} accessibilityRole="link" style={{ alignSelf: 'flex-start', marginTop: 6 }}>
          <T style={{ fontSize: 13.76, lineHeight: 22, color: color.dim }}>{`${more} more in the folder`}</T>
        </Pressable>
      )}
    </View>
  );
}

// One of a folder's pictures, a third of the line less its gaps, cut to 16:10
// from the top (`object-fit: cover; object-position: top`).
function Shot({ file, all, width }: { file: string; all: string[]; width: number }) {
  const { files } = useContext(Draw);
  const uri = files?.picture(file);
  const base = file.split('/').pop() ?? file;
  const [ratio, setRatio] = useState(0);
  const tall = ratio > 0 && ratio < 16 / 10;
  return (
    <Pressable onPress={() => open(file, files, all)} accessibilityRole="imagebutton" accessibilityLabel={base} style={{ width }}>
      <View style={{ width: '100%', aspectRatio: 16 / 10, borderWidth: 1, borderColor: color.line, backgroundColor: color.raised, overflow: 'hidden' }}>
        {!!uri && (
          <Image source={{ uri }} accessibilityLabel={base} resizeMode="cover"
            onLoad={(e) => { const { width: w = 0, height: h = 0 } = e.nativeEvent?.source ?? {}; if (w && h) setRatio(w / h); }}
            style={tall ? { position: 'absolute', top: 0, left: 0, width: '100%', aspectRatio: ratio } : { width: '100%', height: '100%' }} />
        )}
      </View>
      <T numberOfLines={1} style={{ marginTop: 4, fontSize: 13.12, lineHeight: 21, color: color.faint }}>{base}</T>
    </Pressable>
  );
}

const FILM = /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i;

/** A film or a sound the phone has: its name on a line of its own, then its player (Focus.tsx `ArtifactMedia`). */
function Media({ src, label }: { src: string; label: string }) {
  const { files } = useContext(Draw);
  const link = files?.media?.(src) ?? null;
  const film = FILM.test(src);
  return (
    <View>
      <Text onPress={() => open(src, files)} accessibilityRole="link" style={[BODY, { alignSelf: 'flex-start', marginBottom: 6, textDecorationLine: 'underline', textDecorationColor: color.lineStrong }]}>
        <MentionIcon kind="media" tint={color.faint} />{label}
      </Text>
      {link && (film
        ? <Player link={link} film style={{ width: '100%', height: 360, backgroundColor: color.raised, borderWidth: 1, borderColor: color.line }} />
        : <Player link={link} film={false} style={{ width: '100%', maxWidth: 420, height: 36 }} />)}
    </View>
  );
}

// A list's mark, drawn rather than typed: Geist has no white bullet.
function Mark({ ordered, n, depth }: { ordered: boolean; n: number; depth: number }) {
  const { body } = useContext(Draw);
  if (ordered) {
    return <View style={{ width: 22 }}><T style={[body, { position: 'absolute', right: 6 }]} numberOfLines={1}>{n}.</T></View>;
  }
  const dot = { width: 5.5, height: 5.5 };
  const shape = depth === 0 ? { ...dot, borderRadius: 3, backgroundColor: color.text }
    : depth === 1 ? { ...dot, borderRadius: 3, borderWidth: 1, borderColor: color.text }
      : { width: 5, height: 5, backgroundColor: color.text };
  return <View style={{ width: 22, height: body.lineHeight, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 11 }}><View style={shape} /></View>;
}

function Tick({ checked }: { checked: boolean }) {
  const { body } = useContext(Draw);
  return (
    <View style={{ height: body.lineHeight, justifyContent: 'center', marginRight: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: checked ? color.text : color.faint, backgroundColor: checked ? color.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <Svg width={9} height={9} viewBox="0 0 12 12" fill="none" stroke={color.bg} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M2.5 6.2 5 8.5l4.5-5" /></Svg>}
      </View>
    </View>
  );
}

// A table lays its columns out as the page does: each as wide as its widest
// cell when they all fit, otherwise each gets its longest word and shares out
// what is left by how much more it wanted; wider still, it scrolls sideways.
function Table({ block }: { block: Extract<Block, { kind: 'table' }> }) {
  const all = [block.head, ...block.rows];
  const columns = Math.max(0, ...all.map((r) => r.length));
  const [room, setRoom] = useState(0);
  const [most, setMost] = useState<Record<string, number>>({});
  const [least, setLeast] = useState<Record<string, number>>({});
  const PAD = 22;
  const cellText = (r: number, c: number): TextStyle => ({
    fontSize: 14, lineHeight: 20.3, color: color.text,
    textAlign: block.align[c] ?? 'left',
    ...((r === 0 || c === 0) ? { fontFamily: font.semibold } : {}),
  });
  const longestWord = (spans: Span[]) => spans.map((s) => s.text).join('').split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
  const measured = all.every((row, r) => Array.from({ length: columns }, (_, c) => `${r}:${c}`).every((k) => k in most && k in least)) && room > 0;
  let widths: number[] = [];
  if (measured) {
    const max = Array.from({ length: columns }, (_, c) => Math.max(...all.map((_, r) => most[`${r}:${c}`] ?? 0)) + PAD + 1);
    const min = Array.from({ length: columns }, (_, c) => Math.max(...all.map((_, r) => least[`${r}:${c}`] ?? 0)) + PAD + 1);
    const sumMax = max.reduce((a, b) => a + b, 0);
    const sumMin = min.reduce((a, b) => a + b, 0);
    if (sumMax <= room) widths = max;
    else if (sumMin >= room) widths = min;
    else {
      const want = sumMax - sumMin;
      widths = min.map((m, c) => m + ((max[c] - m) / want) * (room - sumMin));
    }
  }
  return (
    <View onLayout={(e) => setRoom(e.nativeEvent.layout.width)}>
      {!measured && (
        <View style={{ position: 'absolute', opacity: 0, width: 4000 }} pointerEvents="none">
          {all.map((row, r) => Array.from({ length: columns }, (_, c) => (
            <View key={`${r}:${c}`} style={{ flexDirection: 'row' }}>
              <View style={{ alignSelf: 'flex-start' }} onLayout={(e) => { const w = e.nativeEvent.layout.width; setMost((m) => ({ ...m, [`${r}:${c}`]: w })); }}>
                <T style={cellText(r, c)}><Words spans={row[c] ?? []} /></T>
              </View>
              <View style={{ alignSelf: 'flex-start' }} onLayout={(e) => { const w = e.nativeEvent.layout.width; setLeast((m) => ({ ...m, [`${r}:${c}`]: w })); }}>
                <T style={cellText(r, c)}>{longestWord(row[c] ?? [])}</T>
              </View>
            </View>
          )))}
        </View>
      )}
      {measured && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={widths.reduce((a, b) => a + b, 0) > room}>
          <View>
            {all.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {Array.from({ length: columns }, (_, c) => (
                  <View key={c} style={{
                    width: widths[c], paddingVertical: 7, paddingHorizontal: 11,
                    borderLeftWidth: 1, borderTopWidth: 1, borderColor: color.line,
                    ...(c === columns - 1 ? { borderRightWidth: 1 } : {}),
                    ...(r === all.length - 1 ? { borderBottomWidth: 1 } : {}),
                    // `th`: half the raised grey.
                    ...(r === 0 ? { backgroundColor: color.film } : {}),
                  }}>
                    <T style={cellText(r, c)}><Words spans={row[c] ?? []} /></T>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// `.markdown h2, h3` are the site's small capitals; the others are the browser's own sizes.
const SMALL_CAPS: TextStyle = { fontSize: 12, lineHeight: 19.2, letterSpacing: 0.84, textTransform: 'uppercase', get color() { return color.faint; }, fontFamily: font.semibold };
const HEADING: Record<number, TextStyle> = {
  1: { fontSize: 32, lineHeight: 51.2, fontFamily: font.semibold },
  2: SMALL_CAPS,
  3: SMALL_CAPS,
  4: { fontSize: 16, lineHeight: 25.6, fontFamily: font.semibold },
  5: { fontSize: 13.28, lineHeight: 21.25, fontFamily: font.semibold },
  6: { fontSize: 10.72, lineHeight: 17.15, fontFamily: font.semibold },
};

// A document's own headings (`.doc-card h1, h2`).
const DOC_HEADING: Record<number, TextStyle> = {
  1: { fontSize: 23, lineHeight: 36.8, fontFamily: font.semibold, letterSpacing: -0.23 },
  2: { fontSize: 17, lineHeight: 27.2, fontFamily: font.semibold, letterSpacing: 1.19, textTransform: 'uppercase' },
  3: { fontSize: 17, lineHeight: 27.2, fontFamily: font.semibold, letterSpacing: 1.19, textTransform: 'uppercase' },
  4: { fontSize: 15, lineHeight: 24, fontFamily: font.semibold },
};

// Each block's margins above and below, which meet as the page's do: the
// larger of two neighbours' wins, and none above the first or below the last.
function margins(b: Block, tight: boolean, doc: boolean): [number, number] {
  switch (b.kind) {
    case 'p': return tight ? [0, 0] : [8, 8];
    case 'h':
      if (doc) return b.depth === 1 ? [0, 2] : [20, 6];
      return b.depth === 2 || b.depth === 3 ? [24, 7] : b.depth === 1 ? [21.44, 21.44] : [21.3, 21.3];
    case 'code': return [10, 10];
    case 'table': return [14, 14];
    case 'picture': return [16, 16];
    default: return [8, 8];
  }
}

function Blocks({ blocks, tight = false, tone, depth = 0 }: { blocks: Block[]; tight?: boolean; tone?: string; depth?: number }) {
  const { doc } = useContext(Draw);
  return (
    <>
      {blocks.map((b, i) => {
        const gap = i === 0 ? 0 : Math.max(margins(blocks[i - 1], tight, doc)[1], margins(b, tight, doc)[0]);
        return <View key={i} style={gap ? { marginTop: gap } : null}><One block={b} tone={tone} depth={depth} /></View>;
      })}
    </>
  );
}

function One({ block: b, tone, depth }: { block: Block; tone?: string; depth: number }) {
  const { body, doc } = useContext(Draw);
  const ink = tone ? { color: tone } : null;
  const headings = doc ? DOC_HEADING : HEADING;
  switch (b.kind) {
    case 'p': return <T style={[body, ink]}><Words spans={b.spans} /></T>;
    case 'h': return <T style={[body, ink, headings[b.depth] ?? headings[4]]}><Words spans={b.spans} /></T>;
    case 'code':
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: color.raised, borderWidth: 1, borderColor: color.line }}
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 14, flexGrow: 1 }}>
          <T style={{ fontFamily: font.mono, fontSize: 13, lineHeight: 20.8, color: color.text }}>{b.text}</T>
        </ScrollView>
      );
    case 'quote':
      return <View style={{ borderLeftWidth: 3, borderLeftColor: color.line, paddingLeft: 12 }}><Blocks blocks={b.blocks} tone={color.dim} depth={depth} /></View>;
    case 'list':
      return (
        <View>
          {b.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', marginTop: i ? (b.tight ? 3 : 8) : 0 }}>
              <Mark ordered={b.ordered} n={b.start + i} depth={depth} />
              {item.checked !== null && <Tick checked={item.checked} />}
              <View style={{ flex: 1 }}><Blocks blocks={item.blocks} tight={b.tight} tone={tone} depth={depth + 1} /></View>
            </View>
          ))}
        </View>
      );
    // Keyed by what it holds, so new words are measured afresh.
    case 'table': return <Table key={JSON.stringify(b)} block={b} />;
    case 'hr': return <View style={{ height: 1, backgroundColor: '#808080' }} />;
    case 'picture': return <Picture src={b.src} alt={b.alt} />;
    case 'folder': return <Folder src={b.src} />;
    case 'media': return <Media src={b.src} label={b.label} />;
  }
}

function useItalics() {
  const [loaded] = useFonts({ Geist_400Regular_Italic, Geist_600SemiBold_Italic });
  return loaded;
}

/**
 * A message, the way the website draws one. `dir` is the project's folder on
 * the phone, so a path written out in full inside it reads as the file; `files`
 * draws the pictures it names and opens what it names.
 */
// Every picture a message draws, in reading order, to step through from any one of them.
function picturesIn(blocks: Block[]): string[] {
  return blocks.flatMap((b) => (b.kind === 'picture' ? [b.src] : b.kind === 'quote' ? picturesIn(b.blocks) : b.kind === 'list' ? b.items.flatMap((i) => picturesIn(i.blocks)) : []));
}

/**
 * A message, the way the website draws one. `dir` is the project's folder on
 * the phone, so a path written out in full inside it reads as the file; `files`
 * draws the pictures, folders and players it names and opens what it names.
 * `doc` draws a document opened on its own, in the document's type.
 */
export function Markdown({ text, dir, files, doc = false }: { text: string; dir?: string | null; files?: MessageFiles; doc?: boolean }) {
  const italics = useItalics();
  const media = files?.media;
  const blocks = useMemo(() => messageBlocks(text, { dir, playable: media ? (src) => !!media(src) : undefined }), [text, dir, media]);
  const drawing = useMemo(() => ({
    files, italics, doc, body: doc ? DOC_BODY : BODY, pictures: picturesIn(blocks),
    quiet: referencedFiles(text, { dir: dir ?? null }).some(isImagePath),
  }), [files, italics, doc, blocks, text, dir]);
  return (
    <Draw.Provider value={drawing}>
      <View><Blocks blocks={blocks} /></View>
    </Draw.Provider>
  );
}

/** One line of words with its inline markdown read, for an option's label. */
export function InlineMarkdown({ text, style, numberOfLines, dir, files }: { text: string; style?: TextStyle; numberOfLines?: number; dir?: string | null; files?: MessageFiles }) {
  const italics = useItalics();
  const spans = useMemo(() => inlineSpans(text, { dir }), [text, dir]);
  return (
    <Draw.Provider value={{ files, italics, body: BODY, doc: false, pictures: [], quiet: false }}>
      <T style={style} numberOfLines={numberOfLines}><Words spans={spans} /></T>
    </Draw.Provider>
  );
}
