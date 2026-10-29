// An agent asking permission, as the phone site draws it over every screen
// (App.tsx `.approvals`, styles.css and phone.css): one card across the foot,
// the queue as edges behind it, Allow and Deny big enough for a thumb, and the
// answered card stamped with what she decided on its way out.
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Answered } from '../../../renderer/src/approval-stage';
import { APPROVAL_EXIT_MS, approvalCard, cardOnStage, type Approval } from '../lib/overlays';
import { useCloud } from '../state/cloud';
import { footRoom, T } from './parts';
import { color, font } from './theme';

// The site's glass is --bg-raised at 62% over a 22px blur. The app has no
// blur, and paint alone lets the words under it show through, so it is the
// colour that glass makes over the wall, solid (`color.sunk`). The command's
// block on the card is --film-strong (`color.film`). Each is read while
// drawing, so a new look reaches the card.

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced, () => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

function Ghost({ far }: { far?: boolean }) {
  return (
    <View style={{
      position: 'absolute', left: 0, right: 0, height: 40, top: far ? -13 : -7, transform: [{ scale: far ? 0.93 : 0.965 }], opacity: far ? 0.6 : 1,
      backgroundColor: color.sunk, borderWidth: 1, borderColor: color.line,
    }} />
  );
}

function Card({ a, verdict, waiting, answer }: { a: Approval; verdict: 'allow' | 'deny' | null; waiting: number; answer: (allow: boolean) => void }) {
  const c = useCloud();
  const reduced = useReducedMotion();
  const words = approvalCard(a, waiting, c.view.products, c.view.items);
  // The leaving card's keyframes (styles.css `approval-answered`, `-recede`, `-stamp`) on one clock.
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!verdict) return;
    Animated.timing(t, { toValue: 1, duration: APPROVAL_EXIT_MS, easing: Easing.linear, useNativeDriver: true }).start();
  }, [verdict, t]);
  const at = (input: number[], output: number[]) => t.interpolate({ inputRange: input, outputRange: output });
  const card = !verdict ? null : reduced
    ? { opacity: at([0, 0.16, 1], [1, 0, 0]) }
    : {
      opacity: at([0, 0.78, 1], [1, 1, 0]),
      transform: [{ translateY: at([0, 0.16, 0.52, 0.78, 1], [0, 1, 0, 0, 12]) }, { scale: at([0, 0.16, 0.52, 0.78, 1], [1, 0.976, 1, 1, 0.97]) }],
    };
  const recede = verdict ? { opacity: at([0, 0.16, 1], [1, 0, 0]) } : null;
  const stamp = reduced
    ? { opacity: at([0, 0.2, 0.74, 1], [0, 1, 1, 0]) }
    : { opacity: at([0, 0.18, 0.38, 0.78, 1], [0, 0, 1, 1, 0]), transform: [{ scale: at([0, 0.18, 0.38, 0.52, 1], [0.74, 0.78, 1.06, 1, 1]) }] };
  const small = { fontSize: 11.5, lineHeight: 15 };
  return (
    <Animated.View pointerEvents={verdict ? 'none' : 'auto'} style={[{
      backgroundColor: color.sunk, borderWidth: 1, borderColor: verdict === 'allow' ? color.faint : color.line, paddingVertical: 12, paddingHorizontal: 14,
      shadowColor: '#000', shadowOpacity: color.lift, shadowRadius: 35, shadowOffset: { width: 0, height: 24 }, elevation: 16,
    }, card]}>
      <Animated.View style={recede}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
          <T style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18.2, fontFamily: font.semibold }}>{words.lede}</T>
          {words.waiting && <T style={{ ...small, color: color.faint }}>{words.waiting}</T>}
        </View>
        {/* The whole command, scrolling past six lines rather than cut. */}
        <ScrollView style={{ maxHeight: 120, backgroundColor: color.film, marginBottom: 10 }} contentContainerStyle={{ paddingVertical: 9, paddingHorizontal: 11 }} nestedScrollEnabled>
          <T selectable style={{ fontFamily: font.mono, fontSize: 12, lineHeight: 18 }}>{words.command}</T>
        </ScrollView>
        {words.opens.map((line) => <T key={line} style={{ fontSize: 11.5, lineHeight: 16.7, color: color.dim, marginTop: -4, marginBottom: 10 }}>{line}</T>)}
        {(!!words.where || words.task) && (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: -2, marginBottom: 10 }}>
            {!!words.where && <T numberOfLines={1} style={{ ...small, fontFamily: font.mono, color: color.faint, flexShrink: 1, maxWidth: '62%' }}>{words.where}</T>}
            {words.task && (
              <Pressable accessibilityRole="button" accessibilityHint="Opens this agent. The card stays where it is."
                onPress={() => router.push({ pathname: '/thread/[product]/[id]', params: { product: words.task!.product, id: words.task!.id } })}
                style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 5 }}>
                <T numberOfLines={1} style={{ ...small, color: color.dim, flexShrink: 1 }}>{words.task.title}</T>
                <T style={{ fontSize: 10.5, lineHeight: 14, color: color.faint }}>↗</T>
              </Pressable>
            )}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => answer(true)}
            style={({ pressed }) => ({ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: color.text, borderWidth: 1, borderColor: 'transparent', opacity: pressed ? 0.88 : 1 })}>
            <T style={{ fontSize: 16, fontFamily: font.semibold, color: color.bg }}>Allow</T>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => answer(false)}
            style={({ pressed }) => ({ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: color.fill, borderWidth: 1, borderColor: pressed ? color.faint : color.lineStrong })}>
            {({ pressed }) => <T style={{ fontSize: 16, fontFamily: font.semibold, color: pressed ? color.text : color.dim }}>Deny</T>}
          </Pressable>
        </View>
      </Animated.View>
      {verdict && (
        <Animated.View accessibilityLiveRegion="polite" style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, stamp]}>
          <T style={{ fontSize: 21, lineHeight: 21, color: verdict === 'allow' ? color.text : color.dim }}>{verdict === 'allow' ? '✓' : '✕'}</T>
          <T style={{ fontSize: 13.5, letterSpacing: 0.2, fontFamily: font.semibold, color: verdict === 'allow' ? color.text : color.dim }}>{verdict === 'allow' ? 'Allowed' : 'Denied'}</T>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export function Approvals() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const pending = c.view.approvals;
  const [answered, setAnswered] = useState<Answered | null>(null);
  // The card that held the stage when she pressed: the phone stops listing it
  // the moment the answer is written, and it still has its exit to finish.
  const leaving = useRef<Approval | null>(null);
  useEffect(() => { if (!answered) leaving.current = pending[0] ?? null; }, [pending, answered]);
  useEffect(() => {
    if (!answered) return;
    const timer = setTimeout(() => setAnswered(null), APPROVAL_EXIT_MS);
    return () => clearTimeout(timer);
  }, [answered]);

  const { card, verdict, waiting } = cardOnStage(pending, answered, leaving.current);
  if (!card) return null;
  const answer = async (allow: boolean) => {
    setAnswered({ id: card.id, allow });
    try { await c.send({ kind: 'approve', approval: card.id, allow }, null); } catch (err) {
      setAnswered(null);
      c.say(`Not answered: ${String((err as Error)?.message || 'it did not go through')}`);
    }
    void c.refresh();
  };
  // 8pt over the home bar's room on every screen, as the site's `.approvals`
  // holds it. It sat above the inbox's tabs until they moved to the top (2026-10-28).
  const foot = footRoom(inset);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 8, right: 8, bottom: 8 + foot }}>
      <View>
        {waiting > 1 && <Ghost far />}
        {waiting > 0 && <Ghost />}
        <Card key={card.id} a={card} verdict={verdict} waiting={waiting} answer={answer} />
      </View>
    </View>
  );
}
