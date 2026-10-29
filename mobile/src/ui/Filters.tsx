// View and filters, search and the board's marks, as the phone site draws them
// (threads/Pages.tsx `HeaderActions`, `DisplayMenu`, `StateGlyph`; phone.css).
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { PRIORITIES } from '../../../renderer/src/priority';
import { isFiltered, projectChoices, type Display, type UpdatedWindow } from '../../../renderer/src/threads/page-rules';
import type { ThreadStateWord } from '../../../renderer/src/types';
import { barsFor } from './Pickers';
import { PriorityBars, T } from './parts';
import { color, size } from './theme';

type P = { size?: number; tint?: string };

export const Sliders = ({ size: s = 15, tint = color.dim }: P) => (
  <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.5}><Path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><Circle cx={16} cy={7} r={2} /><Circle cx={10} cy={17} r={2} /></Svg>
);
export const Magnifier = ({ size: s = 15, tint = color.dim }: P) => (
  <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.5}><Circle cx={11} cy={11} r={6} /><Path d="m20 20-4.5-4.5" /></Svg>
);

/** The sliders, with the accent dot while a filter is on (pages.css `.th-disp > i`). */
export function ViewButton({ display, onPress, open }: { display: Display; onPress: () => void; open: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel="View and filters" accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Sliders />
      {isFiltered(display) && <View style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent }} />}
    </Pressable>
  );
}

/** A column's mark on the board (pages.css `.th-st`). */
export function StateGlyph({ state }: { state: ThreadStateWord }) {
  const box = { width: 12, height: 12, borderRadius: 6, marginRight: 9 };
  if (state === 'waiting') return <View style={{ ...box, backgroundColor: color.accent }} />;
  if (state === 'done') return <View style={{ ...box, backgroundColor: color.faint }} />;
  if (state === 'scheduled') return <View style={{ ...box, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.faint }} />;
  return (
    <View style={{ marginRight: 9 }}>
      <Svg width={12} height={12} viewBox="0 0 12 12"><Circle cx={6} cy={6} r={5.25} stroke={color.accent} strokeWidth={1.5} fill="none" /><Path d="M6 0.75 A5.25 5.25 0 0 1 6 11.25 Z" fill={color.accent} /></Svg>
    </View>
  );
}

function Choice({ label, on, onPress, lead }: { label: string; on: boolean; onPress: () => void; lead?: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ height: 34, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      {lead}
      <View>
        <T style={{ fontSize: 15, lineHeight: 34, color: on ? color.text : color.dim }}>{label}</T>
        {/* The picked one underlined in the accent, 8px under the words (phone.css `.th-pop .opts button.on`). */}
        {on && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 2, height: 2, backgroundColor: color.accent }} />}
      </View>
    </Pressable>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, paddingHorizontal: size.inset }}>
      <T style={{ width: 76, fontSize: 14, lineHeight: 34, color: color.faint }}>{label}</T>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 2 }}>{children}</View>
    </View>
  );
}

const Rule = () => <View style={{ height: 1, backgroundColor: color.line, marginVertical: 2, marginHorizontal: size.inset }} />;
const toggle = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const WINDOWS: [UpdatedWindow, string][] = [['today', 'Today'], ['week', 'This week'], ['any', 'Any time']];

/** The menu that drops from the sliders, the width of the screen, over the list (phone.css `.th-pop`). */
export function ViewMenu({ display, onDisplay, products, items, shown, total, tab, close }: {
  display: Display; onDisplay: (d: Display) => void; products: { slug: string; name: string }[]; items: any[];
  shown: number; total: number; tab: string; close: () => void;
}) {
  const inset = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [all, setAll] = useState(false);
  const set = (patch: Partial<Display>) => onDisplay({ ...display, ...patch });
  // The eight used most recently, the rest behind one button (`projectChoices`).
  const { shown: top, rest } = projectChoices(products as any[], items, { picked: display.projects });
  const projects = all ? [...top, ...rest] : top;
  return (
    <View style={{ position: 'absolute', top: inset.top + size.topBar, left: 0, right: 0, bottom: 0, zIndex: 30 }}>
      <ScrollView style={{
        flexGrow: 0, maxHeight: height * 0.75, backgroundColor: color.bg, borderBottomWidth: 1, borderBottomColor: color.line,
        shadowColor: '#000', shadowOpacity: color.lift * 0.8, shadowRadius: 16, shadowOffset: { width: 0, height: 16 }, elevation: 12,
      }} contentContainerStyle={{ paddingTop: 4, paddingBottom: 6 }} accessibilityRole="menu" accessibilityLabel="Inbox view and filters">
        <Line label="View">
          <Choice label="List" on={display.view === 'list'} onPress={() => set({ view: 'list' })} />
          <Choice label="Board" on={display.view === 'board'} onPress={() => set({ view: 'board' })} />
        </Line>
        <Line label="Sort by">
          <Choice label="Priority" on={display.sort === 'priority'} onPress={() => set({ sort: 'priority' })} />
          <Choice label="Sent" on={display.sort === 'updated'} onPress={() => set({ sort: 'updated' })} />
          {tab === 'done' && <T style={{ fontSize: 13, lineHeight: 34, color: color.faint }}>Done runs newest first</T>}
          {tab === 'progress' && <T style={{ fontSize: 13, lineHeight: 34, color: color.faint }}>In progress runs newest sent first</T>}
        </Line>
        <Rule />
        <Line label="Priority">
          {PRIORITIES.map((p) => <Choice key={p.id} label={p.label} on={display.priorities.includes(p.id)} lead={<PriorityBars level={barsFor(p.value)} />}
            onPress={() => set({ priorities: toggle(display.priorities, p.id) })} />)}
        </Line>
        {projects.length > 1 && (
          <Line label="Project">
            <Choice label="All projects" on={display.projects.length === 0} onPress={() => set({ projects: [] })} />
            {projects.map((p) => <Choice key={p.slug} label={p.name} on={display.projects.includes(p.slug)} onPress={() => set({ projects: toggle(display.projects, p.slug) })} />)}
            {rest.length > 0 && (
              <Pressable onPress={() => setAll(!all)} accessibilityRole="button" style={{ height: 34, justifyContent: 'center' }}>
                <T style={{ fontSize: 15, color: color.faint }}>{all ? 'Show fewer' : `Show all ${top.length + rest.length}`}</T>
              </Pressable>
            )}
          </Line>
        )}
        <Line label="Sent">
          {WINDOWS.map(([w, label]) => <Choice key={w} label={label} on={display.updated === w} onPress={() => set({ updated: w })} />)}
        </Line>
        <Rule />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, paddingHorizontal: size.inset, paddingBottom: 4 }}>
          <T style={{ fontSize: 13, color: color.faint }}>{`Showing ${shown} of ${total}`}</T>
          {isFiltered(display) && (
            <Pressable onPress={() => set({ priorities: [], projects: [], updated: 'any', privacy: 'any' })} accessibilityRole="button" hitSlop={8}>
              <T style={{ fontSize: 13, color: color.dim }}>Clear filters</T>
            </Pressable>
          )}
        </View>
      </ScrollView>
      {/* Nothing is dimmed behind it; a tap anywhere else puts it away. */}
      <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close view and filters" />
    </View>
  );
}
