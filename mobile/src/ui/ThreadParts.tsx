// The pieces of a thread on the phone app, drawn to the phone site's styles
// (renderer/src/styles.css under Ember Grid, components/threads-made.css):
// your actions on their timeline, the agent's work lines, the live line, the
// threads it filed, the options strip and the presses under the thread.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { actWhen, actWords } from '../../../renderer/src/act-line';
import { activitySummary } from '../../../renderer/src/activity-summary';
import type { ParsedOption } from '../../../renderer/src/format';
import { stateWord } from '../../../renderer/src/threads-made';
import type { FiledRow } from '../lib/thread';
import { FILED_WORDS, waitingWords, type Live } from '../lib/thread-offers';
import { InlineMarkdown, type MessageFiles } from './Markdown';
import { T } from './parts';
import { color, font } from './theme';

const { DISMISS, DO_HERE, START_NEW } = FILED_WORDS;
const STOPPED = '#e08a6c';
const MONO_CAPS = { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase' as const };

/** Thread.tsx's chevron, turned a quarter when open. */
export const Chevron = ({ open, tint = color.faint, size = 8 }: { open?: boolean; tint?: string; size?: number }) => (
  <View style={{ width: size, height: size, transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
    <Svg width={size} height={size} viewBox="0 0 8 8" fill="none" stroke={tint} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2.6 1.2 L5.6 4 L2.6 6.8" />
    </Svg>
  </View>
);

/** Something you did: a ring on a short timeline, its words, its time (Thread.tsx `ActLine`). */
export function ActLine({ act, joined }: { act: any; joined?: boolean }) {
  const words = actWords(act);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingLeft: 20, minWidth: 0 }}>
      {joined && <View style={{ position: 'absolute', left: 3, top: -15.5, width: 1, height: 22, backgroundColor: color.line }} />}
      <View style={{ position: 'absolute', left: 0, top: 6.5, width: 7, height: 7, borderRadius: 3.5, borderWidth: 1, borderColor: words.picked ? color.dim : color.faint, backgroundColor: words.picked ? color.dim : color.bg }} />
      <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 20, color: color.dim }}>
        {words.lead}
        {words.choice ? <T style={{ fontSize: 13, color: color.text }}>{` ${words.choice}`}</T> : null}
      </T>
      <T style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.44, color: color.faint }}>{actWhen(act.at)}</T>
    </View>
  );
}

/**
 * A line the agent's side wrote: its verb and what it acted on, on one line.
 * A line cut short opens onto the whole of it (Thread.tsx `WorkLine`).
 */
export function WorkLine({ work }: { work: any }) {
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const output = String(work.output ?? '').split('\n').filter((l: string, i: number, a: string[]) => !(i === a.length - 1 && l === ''));
  const whole = work.full || (cut ? work.subject : '');
  const opens = output.length > 0 || !!work.full || cut;
  const head = (
    <>
      {opens && <Chevron open={open} />}
      <T style={{ fontSize: 13, lineHeight: 19.5, color: work.failed ? STOPPED : color.dim }}>{work.verb}</T>
      {!!work.subject && <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.mono, fontSize: 12, lineHeight: 19.5, color: color.faint }}>{work.subject}</T>}
    </>
  );
  return (
    <View>
      {/* Laid out unclipped and unseen, so the line knows when the column cut it. */}
      {!!work.subject && (
        <T style={{ position: 'absolute', opacity: 0, left: 0, right: 0, fontFamily: font.mono, fontSize: 12, lineHeight: 19.5 }}
          onTextLayout={(e) => setCut(e.nativeEvent.lines.length > 1)} pointerEvents="none">{`${work.verb}  ${work.subject}`}</T>
      )}
      <Pressable disabled={!opens} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {head}
      </Pressable>
      {open && !!whole && <T style={{ marginTop: 6, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: color.line, backgroundColor: color.fill, fontFamily: font.mono, fontSize: 11.5, lineHeight: 17.8, color: color.faint }}>{whole}</T>}
      {open && output.length > 0 && <T style={{ marginTop: 6, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: color.line, backgroundColor: color.fill, fontFamily: font.mono, fontSize: 11.5, lineHeight: 17.8, color: color.faint }}>{output.join('\n')}</T>}
    </View>
  );
}

/** Consecutive work folded into one line behind one toggle (Thread.tsx `RunLine`). */
export function RunLine({ items }: { items: any[] }) {
  const [open, setOpen] = useState(false);
  const failed = items.filter((w) => w.failed).length;
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 19.5, color: color.dim }}>{activitySummary(items)}</T>
        <Chevron open={open} />
        {failed > 0 && <T style={{ fontSize: 12, color: STOPPED }}>{failed}</T>}
      </Pressable>
      {open && <View style={{ marginTop: 5, paddingLeft: 16, gap: 5 }}>{items.map((w, k) => <WorkLine key={k} work={w} />)}</View>}
    </View>
  );
}

// LiveMark.tsx's lattice: each cell lights in turn round the ring, 186ms apart.
const ORBIT = [0, 1, 2, 7, null, 3, 6, 5, 4];
const CYCLE_MS = 1488;
const KEYS: [number, number][] = [[0, 0.22], [0.18, 1], [0.42, 1], [0.62, 0.22], [1, 0.22]];
function orbitRange(phase: number) {
  const shift = phase / 8;
  const at = (u: number) => {
    for (let k = 1; k < KEYS.length; k += 1) {
      const [u1, v1] = KEYS[k - 1];
      const [u2, v2] = KEYS[k];
      if (u <= u2) return v1 + ((u - u1) / (u2 - u1)) * (v2 - v1);
    }
    return 0.22;
  };
  const points = KEYS.map(([u]) => (u + shift) % 1).concat([0, 1]);
  const ts = [...new Set(points.map((t) => Math.round(t * 1e4) / 1e4))].sort((a, b) => a - b);
  return { inputRange: ts, outputRange: ts.map((t) => at(((t - shift) % 1 + 1) % 1)) };
}

export function LiveMark({ still }: { still?: boolean }) {
  const clock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return undefined;
    const loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration: CYCLE_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [still, clock]);
  const ranges = useMemo(() => ORBIT.map((p) => (p === null ? null : orbitRange(p))), []);
  // Three cells and two 1.5px gaps inside 14px, a hair under so the row never wraps.
  const cell = 3.6;
  return (
    <View style={{ width: 14, height: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 1.5 }}>
      {ORBIT.map((p, k) => {
        const range = ranges[k];
        const opacity = p === null ? 0.1 : still ? 0.35 : clock.interpolate(range!);
        return <Animated.View key={k} style={{ width: cell, height: cell, borderRadius: cell / 2, backgroundColor: color.text, opacity }} />;
      })}
    </View>
  );
}

const LiveChevron = ({ open }: { open: boolean }) => (
  <View style={{ width: 10, height: 10, transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
    <Svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke={color.dim} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 2 4 4-4 4" /></Svg>
  </View>
);
const Terminal = () => (
  <Svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={color.dim} strokeWidth={1.3}><Rect x={1.5} y={1.5} width={13} height={13} rx={3} /><Path d="m4 5 3 3-3 3m5 0h3" /></Svg>
);

/** The mark at the end of the conversation that says what an agent is doing here (Live.tsx). */
export function LiveLine({ live }: { live: Live }) {
  const [open, setOpen] = useState(false);
  const words = (
    <>
      <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 13.5, lineHeight: 20, fontFamily: font.medium, color: live.working ? color.text : color.dim }}>{live.word}</T>
      {live.working && live.more > 0 && <T style={{ fontSize: 13.5, lineHeight: 20, color: color.faint }}>{`+${live.more}`}</T>}
      {!!live.span && <T style={{ fontSize: 13.5, lineHeight: 20, color: color.faint }}>{live.span}</T>}
      {!!live.place && <T style={{ fontSize: 13.5, lineHeight: 20, color: color.faint }}>{live.place}</T>}
    </>
  );
  return (
    <View style={{ marginTop: 14 }} accessibilityLabel={live.line}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <LiveMark still={!live.working} />
        {live.working ? (
          <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
            {words}
            <LiveChevron open={open} />
          </Pressable>
        ) : words}
      </View>
      {live.working && open && (
        <View style={{ marginTop: 8 }}>
          {live.rows.map((r, k) => (
            <View key={k} style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Terminal />
              <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: color.dim }}>{r.label}</T>
            </View>
          ))}
          {!live.rows.length && <T style={{ fontSize: 13, color: color.dim }}>No commands yet.</T>}
        </View>
      )}
    </View>
  );
}

/** The threads a thread filed, and the presses that answer each (components/ThreadsMade.tsx). */
export function FiledList({ rows, label, open, approve, here, dismiss, inTurn }: {
  rows: FiledRow[]; label?: string; inTurn?: boolean;
  open: (row: FiledRow) => void; approve: (row: FiledRow) => void; here?: (row: FiledRow) => void; dismiss: (row: FiledRow) => void;
}) {
  if (!rows.length) return null;
  const asks = rows.filter((r) => r.approve);
  const waiting = asks.length > 0;
  const shown = waiting ? [...asks, ...rows.filter((r) => !r.approve)] : rows;
  const heading = waiting ? waitingWords(asks.length) : label;
  const act = (word: string, tint: string, press: () => void, said: string) => (
    <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={said} hitSlop={4}
      style={({ pressed }) => ({ height: 26, paddingHorizontal: 9, justifyContent: 'center', backgroundColor: pressed ? color.picked : 'transparent' })}>
      <T style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.66, textTransform: 'uppercase', color: tint }}>{word}</T>
    </Pressable>
  );
  return (
    <View style={inTurn ? { marginTop: 12 } : { marginTop: 22 }}>
      {!!heading && <T style={{ ...MONO_CAPS, color: color.faint, marginBottom: 8 }}>{heading}</T>}
      <View style={{ borderWidth: 1, borderColor: color.line }}>
        {shown.map((r, k) => {
          const quiet = waiting && !r.approve;
          return (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingRight: 10, borderTopWidth: k ? 1 : 0, borderTopColor: color.line }}>
              <Pressable onPress={() => open(r)} accessibilityRole="button"
                style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 14, backgroundColor: pressed ? color.fill : 'transparent' })}>
                {r.approve && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent, marginRight: -4 }} />}
                <T numberOfLines={1} style={{ flex: 1, fontSize: 14, color: quiet ? color.faint : color.text }}>{r.title}</T>
                {!r.approve && <T style={{ ...MONO_CAPS, color: quiet || r.state === 'done' || r.state === 'scheduled' ? color.faint : color.dim }}>{stateWord(r.state)}</T>}
              </Pressable>
              {r.approve && (
                <View style={{ flexDirection: 'row', gap: 2, marginLeft: 12, marginRight: -2 }}>
                  {act(DISMISS, color.faint, () => dismiss(r), `${DISMISS}: ${r.title}`)}
                  {here && act(DO_HERE, color.dim, () => here(r), `Do in this thread: ${r.title}`)}
                  {act(START_NEW, color.accent, () => approve(r), `Start new thread: ${r.title}`)}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The options strip: the question, a row per option, and the close question's way out (OptionsOffer.tsx). */
export function OptionsCard({ ask, options, busy, pick, keep, dir, files }: {
  ask: string; options: ParsedOption[]; busy: boolean; pick: (o: ParsedOption) => void;
  keep?: { label: string; onKeep: () => void }; dir?: string | null; files?: MessageFiles;
}) {
  const row = (key: string, press: () => void, badge: ReactNode, body: ReactNode, aside?: ReactNode) => (
    <Pressable key={key} disabled={busy} onPress={press} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 7, paddingHorizontal: 16, paddingBottom: 7, backgroundColor: pressed ? color.fill : 'transparent', opacity: busy ? 0.5 : 1 })}>
      {badge}
      {body}
      {aside}
    </Pressable>
  );
  return (
    <View style={{ marginTop: 22, borderWidth: 1, borderColor: color.line }}>
      <View style={{ paddingTop: 11, paddingHorizontal: 16, paddingBottom: 7 }}>
        {/* The same fallback the desktop draws (renderer/src/components/OptionsOffer.tsx). */}
        <T style={{ fontSize: 12.5, lineHeight: 17.5, fontFamily: font.semibold }}>{ask || 'Pick one, or write your own answer'}</T>
      </View>
      {options.map((o) => row(String(o.n), () => pick(o), (
        <View style={{ borderWidth: 1, borderColor: color.lineStrong, paddingHorizontal: 6, height: 19, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 1 }}>
          <T style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 16, color: color.dim }}>{o.n}</T>
        </View>
      ), (
        <InlineMarkdown text={o.text.replace(/\s*\(recommended\)\s*$/i, '')} dir={dir} files={files} style={{ flexShrink: 1, fontSize: 14, lineHeight: 20.3, color: color.dim }} />
      ), o.recommended ? <T style={{ fontSize: 11.5, lineHeight: 16.7, color: color.faint, paddingLeft: 8 }}>recommended</T> : null))}
      {/* The site keys this row "esc"; a phone has no Escape, so its box is left empty. */}
      {keep && row('keep', keep.onKeep, <View style={{ width: 21 }} />, <T style={{ flexShrink: 1, fontSize: 14, lineHeight: 20.3, color: color.dim }}>{keep.label}</T>)}
    </View>
  );
}

/** The quiet buttons under a thread (Focus.tsx `.focus-actions`). */
export function FocusActions({ actions }: { actions: { label: string; dim?: string; onPress: () => void }[] }) {
  if (!actions.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 30, paddingTop: 16, borderTopWidth: 1, borderTopColor: color.line }}>
      {actions.map((a) => (
        <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button"
          style={({ pressed }) => ({ borderWidth: 1, borderColor: pressed ? color.faint : color.line, paddingVertical: 7, paddingHorizontal: 14, flexShrink: 1 })}>
          <T style={{ fontSize: 13, color: color.dim }}>
            {a.label}
            {a.dim ? <T style={{ fontSize: 13, color: color.faint }}>{` · ${a.dim}`}</T> : null}
          </T>
        </Pressable>
      ))}
    </View>
  );
}
