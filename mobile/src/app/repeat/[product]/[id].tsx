// An opened repeating task on the phone, as the desktop's RepeatFocus has it:
// its project, schedule and next run, the instruction every run reads, and
// the runs still on file. Change when and End go to the computer that keeps it.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { readRule, repeatPresets, stamp } from '../../../../../renderer/src/format';
import { repeatRow, repeatTag } from '../../../../../renderer/src/repeat-words';
import { isCleanRun, ruleIdOf, ruleLabel } from '../../../../../shared/repeats.mjs';
import { useCloud } from '../../../state/cloud';
import { Back, Repeat } from '../../../ui/icons';
import { TimeBox, TypingSheet } from '../../../ui/Later';
import { Markdown } from '../../../ui/Markdown';
import { IconButton, Sheet, SheetHead, SheetRow, SheetSep, T, TopBar, Wall } from '../../../ui/parts';
import { color, font, size } from '../../../ui/theme';

const label = { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase' as const, get color() { return color.faint; } };

export default function RepeatPage() {
  const c = useCloud();
  const { product, id } = useLocalSearchParams<{ product: string; id: string }>();
  const rule = c.repeats.find((r) => r.product === product && r.id === id) ?? null;
  const [sheet, setSheet] = useState<'when' | 'end' | null>(null);
  const [typed, setTyped] = useState('');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!rule) {
    return (
      <Wall>
        <TopBar left={<IconButton label="Back" onPress={back}><Back /></IconButton>} />
        <T style={{ paddingHorizontal: size.inset, paddingTop: 28, fontSize: 15, lineHeight: 23, color: color.dim }}>This repeating task has ended, or its computer no longer sends it.</T>
      </Wall>
    );
  }
  const items = c.view.items as any[];
  const last = rule.lastOccurrence ? items.find((i) => i.id === rule.lastOccurrence) ?? null : null;
  const runs = items.filter((i) => i.product === rule.product && ruleIdOf(i) === rule.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  const read = readRule(typed);
  const typedRule = read && 'rule' in read ? read.rule : null;
  const ref = { product: rule.product, id: rule.id, title: rule.title };
  const press = async (p: Parameters<typeof c.send>[0]) => {
    setSheet(null);
    try { await c.send(p, null); } catch (err) { c.say(String((err as Error)?.message ?? err)); }
  };
  const changeTo = (to: NonNullable<typeof typedRule>) => { setTyped(''); void press({ kind: 'repeat-at', rule: ref, to }); };

  return (
    <Wall>
      <TopBar left={<IconButton label="Back" width={34} onPress={back}><Back /></IconButton>} title={<T numberOfLines={1} style={{ fontSize: 15, paddingHorizontal: 6 }}>{rule.title}</T>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: size.inset, paddingTop: 22, paddingBottom: 48 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <Repeat size={15} tint={color.dim} />
          <T style={{ flex: 1, fontFamily: font.medium, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 }}>{rule.title}</T>
        </View>
        <T style={{ fontSize: 14, lineHeight: 21, color: color.dim }}>
          {`${rule.productName} · ${repeatTag(rule)} · next ${repeatRow(rule, last, c.now).when}`}
        </T>
        {rule.waiting && <T style={{ fontSize: 13, lineHeight: 20, color: color.faint, marginTop: 6 }}>Waiting for your computer to take this change.</T>}

        <T style={{ ...label, marginTop: 28, marginBottom: 8 }}>Every run reads</T>
        <Markdown text={rule.body || rule.title} />

        <T style={{ ...label, marginTop: 28, marginBottom: 4 }}>Runs</T>
        {runs.length === 0 && <T style={{ fontSize: 14, lineHeight: 21, color: color.dim, paddingVertical: 8 }}>It has not run yet.</T>}
        {runs.map((run, i) => {
          const live = run.status === 'open' || run.status === 'claimed';
          const what = live ? 'running' : isCleanRun(run) ? 'clean' : (String(run.result ?? '').split('\n').find((l: string) => l.trim()) || 'finished without saying anything');
          return (
            <Pressable key={run.id} onPress={() => router.push({ pathname: '/thread/[product]/[id]', params: { product: run.product, id: run.id } })}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: color.rowLine, backgroundColor: pressed ? color.fill : 'transparent' })}>
              <T style={{ width: 84, fontSize: 13, lineHeight: 20, color: color.faint }}>{stamp(run.createdAt, c.now)}</T>
              <T numberOfLines={2} style={{ flex: 1, fontSize: 14, lineHeight: 20, color: live || isCleanRun(run) ? color.dim : color.text }}>{what}</T>
            </Pressable>
          );
        })}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 32 }}>
          <Pressable onPress={() => setSheet('when')} accessibilityRole="button"
            style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : 'transparent' })}>
            <T style={{ fontSize: 14 }}>Change when</T>
          </Pressable>
          <Pressable onPress={() => setSheet('end')} accessibilityRole="button"
            style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: pressed ? color.fill : 'transparent' })}>
            <T style={{ fontSize: 14, color: color.dim }}>End this repeating task</T>
          </Pressable>
        </View>
      </ScrollView>

      <TypingSheet open={sheet === 'when'} close={() => { setSheet(null); setTyped(''); }}>
        <SheetHead>Repeats</SheetHead>
        {repeatPresets(c.now).flatMap((p) => (p.rule ? [p.rule] : []).map((to) => (
          <SheetRow key={p.label} label={p.label} lead={<Repeat size={15} />} on={ruleLabel(to) === ruleLabel(rule)} onPress={() => changeTo(to)} />
        )))}
        <TimeBox lead={<Repeat size={15} />} value={typed} onChange={setTyped} placeholder="Or type: every friday 5pm"
          onSubmit={() => { if (typedRule) changeTo(typedRule); }} onLine={() => { if (typedRule) changeTo(typedRule); }}
          line={!typed.trim() ? null : typedRule ? { text: `Repeats ${ruleLabel(typedRule)}`, tone: 'ok' } : { text: 'Not a schedule yet', tone: 'unread' }} />
      </TypingSheet>

      <Sheet open={sheet === 'end'} close={() => setSheet(null)}>
        <SheetHead>End this repeating task?</SheetHead>
        <T style={{ paddingHorizontal: 20, paddingBottom: 12, fontSize: 14, lineHeight: 21, color: color.dim }}>No more runs start. The runs already made stay in your threads.</T>
        <SheetRow label="End it" onPress={() => void press({ kind: 'end-repeat', rule: ref })} />
        <SheetSep />
        <SheetRow label="Keep it" onPress={() => setSheet(null)} />
      </Sheet>
    </Wall>
  );
}
