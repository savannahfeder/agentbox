// A teammate's shared thread, opened from What shipped this week: what they share of it.
import { View } from 'react-native';
import type { ThreadCard } from '../../../renderer/src/types';
import { Cross } from './icons';
import { IconButton, Sheet, T } from './parts';
import { color, font } from './theme';

const STATE_WORD: Record<string, string> = { running: 'Working', waiting: 'Waiting', scheduled: 'Later', done: 'Done' };

export function CardSheet({ card, who, close }: { card: ThreadCard | null; who: string; close: () => void }) {
  return (
    <Sheet open={!!card} close={close}>
      {card && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 6, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <T selectable style={{ flex: 1, fontFamily: font.medium, fontSize: 17, lineHeight: 23 }}>{card.title ?? 'A thread'}</T>
            <IconButton label="Close" onPress={close}><Cross size={16} /></IconButton>
          </View>
          <T style={{ fontSize: 13, color: color.faint }}>{[who, STATE_WORD[card.state] ?? card.state, card.project].filter(Boolean).join(' · ')}</T>
          {!!card.problem && <T selectable style={{ fontSize: 14, lineHeight: 21, color: color.dim }}>{card.problem}</T>}
          {!!card.progress && <T selectable style={{ fontSize: 14, lineHeight: 21, color: color.dim }}>{card.progress}</T>}
        </View>
      )}
    </Sheet>
  );
}
