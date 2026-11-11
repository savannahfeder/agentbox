// A CSV or TSV drawn as the desktop's TableView draws it (table-view.css), at a
// phone's size: mono capital heads, row numbers, square tags with a dot, and
// the first column held still while the rest scrolls sideways.
import * as WebBrowser from 'expo-web-browser';
import { useRef } from 'react';
import { Animated, Pressable, ScrollView, useWindowDimensions, View, type TextStyle } from 'react-native';
import { cellLink, shownText, type Table, type Tone } from '../../../renderer/src/table-file';
import { columnWidths } from '../lib/files';
import { T } from './parts';
import { color, DARK, font } from './theme';

// The desktop's tag tones, ground, ink and dot, in each look.
const TONES: Record<'dark' | 'light', Record<Tone, [string, string, string]>> = {
  light: {
    green: ['#eaf6ee', '#23683f', '#3aa564'], blue: ['#ecf2fd', '#2f5596', '#4c7fd6'], purple: ['#f2effc', '#573f9e', '#7d63d4'],
    amber: ['#fcf3e3', '#8a5d12', '#d9952b'], rose: ['#fcf0f3', '#9b3a58', '#d4627f'], teal: ['#e8f5f2', '#1f6b5c', '#33a08a'], grey: ['#f2f3f5', '#4b5563', '#a3a9b4'],
  },
  dark: {
    green: ['rgba(58, 165, 100, 0.16)', '#93d8ac', '#3aa564'], blue: ['rgba(76, 127, 214, 0.18)', '#abc5f4', '#4c7fd6'], purple: ['rgba(125, 99, 212, 0.2)', '#c8b8f3', '#7d63d4'],
    amber: ['rgba(217, 149, 43, 0.17)', '#edc583', '#d9952b'], rose: ['rgba(212, 98, 127, 0.18)', '#f1a8bb', '#d4627f'], teal: ['rgba(51, 160, 138, 0.17)', '#8bd6c5', '#33a08a'], grey: ['rgba(255, 255, 255, 0.08)', '#c9ccd2', '#8d929b'],
  },
};
const dark = () => color.bg === DARK.bg;
const line = () => (dark() ? 'rgba(255, 255, 255, 0.09)' : 'rgba(17, 25, 48, 0.08)');
const head = (): TextStyle => ({ fontFamily: font.mono, fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase', color: color.faint });

const ROW = 44;
const NUMBER_W = 40;
// A phone draws every row it is given; past this the count says how many there are.
const MOST_ROWS = 500;

function Cell({ table, row, c, width, first }: { table: Table; row: string[]; c: number; width: number; first?: boolean }) {
  const col = table.columns[c];
  const raw = row[c] ?? '';
  const text = shownText(raw);
  const box = { width, height: ROW, paddingHorizontal: 12, justifyContent: 'center' as const, borderRightWidth: 1, borderBottomWidth: 1, borderColor: line() };
  if (col.kind === 'tag' && text) {
    const [ground, ink, dot] = TONES[dark() ? 'dark' : 'light'][col.tones[text.toLowerCase()] ?? 'grey'];
    return (
      <View style={box}>
        <View style={{ alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2, paddingLeft: 7, paddingRight: 8, backgroundColor: ground }}>
          <View style={{ width: 6, height: 6, backgroundColor: dot }} />
          <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, lineHeight: 17, color: ink }}>{text}</T>
        </View>
      </View>
    );
  }
  const link = col.kind === 'link' || col.kind === 'email' || first ? cellLink(table, row, c) : null;
  const style: TextStyle = {
    fontSize: 13.5, lineHeight: 19,
    color: col.kind === 'link' || col.kind === 'date' ? color.dim : color.text,
    textAlign: col.kind === 'number' ? 'right' : 'left',
    ...(col.kind === 'number' || col.kind === 'date' ? { fontVariant: ['tabular-nums'] } : {}),
    ...(first ? { fontFamily: font.medium } : {}),
  };
  const words = <T numberOfLines={1} style={style}>{col.kind === 'link' ? text.replace(/^https?:\/\//i, '').replace(/^www\./i, '') : text}</T>;
  return link
    ? <Pressable onPress={() => void WebBrowser.openBrowserAsync(link.href)} accessibilityRole="link" style={box}>{words}</Pressable>
    : <View style={box}>{words}</View>;
}

const HeadCell = ({ name, width, right }: { name: string; width: number; right?: boolean }) => (
  <View style={{ width, height: 36, paddingHorizontal: 12, justifyContent: 'center', borderRightWidth: 1, borderBottomWidth: 1, borderTopWidth: 1, borderColor: line(), backgroundColor: color.bg }}>
    <T numberOfLines={1} style={{ ...head(), textAlign: right ? 'right' : 'left' }}>{name}</T>
  </View>
);

/** The whole table, its head held at the top and its first column at the left. */
export function TableFile({ table }: { table: Table }) {
  const { width: screen } = useWindowDimensions();
  const widths = columnWidths(table);
  const rows = table.rows.slice(0, MOST_ROWS);
  const along = useRef(new Animated.Value(0)).current;
  // A ranked file's own rank stands in for the row number.
  const lead = table.ranked ? 1 : 0;
  const pinned = table.columns.length > lead ? lead : -1;
  // The held column leaves at least half the screen for the rest to scroll through.
  if (pinned >= 0) widths[pinned] = Math.min(widths[pinned], Math.max(120, screen / 2 - NUMBER_W));
  const rest = table.columns.map((_, c) => c).filter((c) => c !== pinned && !(table.ranked && c === 0));
  const numberOf = (r: number) => (table.ranked ? shownText(rows[r][0]) : String(r + 1));
  const restWidth = rest.reduce((a, c) => a + widths[c], 0);
  const count = table.rows.length > MOST_ROWS ? `${MOST_ROWS} of ${table.rows.length.toLocaleString()} rows` : `${table.rows.length.toLocaleString()} ${table.rows.length === 1 ? 'row' : 'rows'}`;
  if (!table.columns.length) return <T style={{ padding: 24, color: color.faint, fontSize: 13 }}>This table is empty.</T>;
  return (
    <View style={{ flex: 1 }}>
      <T style={{ ...head(), fontSize: 10.5, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>{count}</T>
      <ScrollView stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', backgroundColor: color.bg }}>
          <HeadCell name="" width={NUMBER_W} />
          {pinned >= 0 && <HeadCell name={table.columns[pinned].name} width={widths[pinned]} />}
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <Animated.View style={{ flexDirection: 'row', width: restWidth, transform: [{ translateX: Animated.multiply(along, -1) }] }}>
              {rest.map((c) => <HeadCell key={c} name={table.columns[c].name} width={widths[c]} right={table.columns[c].kind === 'number'} />)}
            </Animated.View>
          </View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View>
            {rows.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                <View style={{ width: NUMBER_W, height: ROW, paddingRight: 10, alignItems: 'flex-end', justifyContent: 'center', borderRightWidth: 1, borderBottomWidth: 1, borderColor: line() }}>
                  <T style={{ fontSize: 12, color: color.faint, fontVariant: ['tabular-nums'] }}>{numberOf(r)}</T>
                </View>
                {pinned >= 0 && <Cell table={table} row={row} c={pinned} width={widths[pinned]} first />}
              </View>
            ))}
          </View>
          <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: along } } }], { useNativeDriver: true })}>
            <View>
              {rows.map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {rest.map((c) => <Cell key={c} table={table} row={row} c={c} width={widths[c]} />)}
                </View>
              ))}
            </View>
          </Animated.ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

/** The table's head and first rows, small, for its card under a thread. */
export function MiniTable({ table }: { table: Table }) {
  const widths = columnWidths(table).map((w) => Math.min(w, 150) * 0.8);
  return (
    <View style={{ flex: 1, paddingTop: 10, paddingLeft: 12, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        {table.columns.map((col, c) => (
          <T key={c} numberOfLines={1} style={{ ...head(), fontSize: 8.5, width: widths[c], paddingRight: 8, paddingBottom: 5 }}>{col.name}</T>
        ))}
      </View>
      {table.rows.slice(0, 4).map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: line() }}>
          {table.columns.map((_, c) => (
            <T key={c} numberOfLines={1} style={{ width: widths[c], paddingRight: 8, paddingVertical: 3, fontSize: 10, lineHeight: 14, color: c === 0 ? color.dim : color.faint }}>{shownText(row[c] ?? '')}</T>
          ))}
        </View>
      ))}
    </View>
  );
}
