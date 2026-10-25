// The pickers a reply and a new thread share, as sheets from the bottom, in
// the desktop's own words (priority.ts, modes.ts, models.ts, effort.ts).
import { Pressable, View } from 'react-native';
import { EFFORTS } from '../../../renderer/src/effort';
import { MENU_TITLE, MODE_ORDER, MODE_WORDS } from '../../../renderer/src/modes';
import { DEFAULT_MODEL, modelChoices } from '../../../renderer/src/models';
import { PRIORITIES, priorityIdOf, type PriorityId } from '../../../renderer/src/priority';
import { litEffort } from '../lib/compose';
import { PriorityBars, Sheet, SheetHead, SheetRow, SheetSep, T } from './parts';
import { color, font } from './theme';

const LEVEL: Record<PriorityId, 1 | 2 | 3 | 4> = { urgent: 4, high: 3, medium: 2, low: 1 };
export const barsFor = (priority: number | null | undefined) => LEVEL[priorityIdOf(priority)];

export function PrioritySheet({ open, close, value, pick }: { open: boolean; close: () => void; value: number; pick: (v: number) => void }) {
  const on = priorityIdOf(value);
  return (
    <Sheet open={open} close={close}>
      <SheetHead>Priority</SheetHead>
      {PRIORITIES.map((p) => <SheetRow key={p.id} label={p.label} on={p.id === on} lead={<PriorityBars level={LEVEL[p.id]} />} onPress={() => { pick(p.value); close(); }} />)}
    </Sheet>
  );
}

export function ModeSheet({ open, close, value, pick }: { open: boolean; close: () => void; value: string; pick: (v: string) => void }) {
  return (
    <Sheet open={open} close={close}>
      <SheetHead>{MENU_TITLE}</SheetHead>
      {MODE_ORDER.map((m) => <SheetRow key={m} label={MODE_WORDS[m]} on={m === value} onPress={() => { pick(m); close(); }} />)}
    </Sheet>
  );
}

// `effort` is her own pick. The strip lights it, or the level the model thinks
// at on its own (components/Model.tsx); pressing her pick again clears it.
export function ModelSheet({ open, close, model, effort, pickModel, pickEffort, clearEffort }: {
  open: boolean; close: () => void; model: string | null; effort: string | null; pickModel: (id: string) => void; pickEffort: (id: string) => void; clearEffort?: () => void;
}) {
  const rows = modelChoices(model);
  const current = model ?? rows[0]?.id;
  const lit = litEffort(effort, current ?? DEFAULT_MODEL);
  return (
    <Sheet open={open} close={close}>
      <SheetHead>Model</SheetHead>
      {rows.map((m) => <SheetRow key={m.id} label={m.label} on={m.id === current} onPress={() => { pickModel(m.id); close(); }} />)}
      <SheetSep />
      <T style={{ fontSize: 11, lineHeight: 20, letterSpacing: 0.22, color: color.faint, paddingTop: 6, paddingHorizontal: 10, paddingBottom: 2 }}>Effort</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 2 }}>
        {EFFORTS.map((e) => (
          <Pressable key={e.id} onPress={() => (e.id === effort && clearEffort ? clearEffort() : pickEffort(e.id))} accessibilityRole="radio" accessibilityState={{ checked: e.id === lit }}
            style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 8, justifyContent: 'center', backgroundColor: e.id === lit || pressed ? color.picked : 'transparent' })}>
            <T style={{ fontSize: 15, color: e.id === lit ? color.text : color.dim, fontFamily: e.id === lit ? font.semibold : font.regular }}>{e.label}</T>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
