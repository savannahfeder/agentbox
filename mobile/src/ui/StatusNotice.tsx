import { useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { noticeDismissal } from '../lib/notice-dismissal';
import { appStore } from '../platform/persist';
import { T } from './parts';
import { color, corner, size } from './theme';

const notices = noticeDismissal(appStore);

export function StatusNotice({ message, next }: { message?: string | null; next?: string | null }) {
  const hidden = useSyncExternalStore(notices.subscribe, () => !message || notices.hidden(message), () => false);
  if (!message || hidden) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginHorizontal: size.inset - 4, marginBottom: 4, paddingLeft: 16, borderRadius: corner.card, backgroundColor: color.fill }}>
      <T style={{ flex: 1, paddingVertical: 12, fontSize: 14, lineHeight: 19.5, color: color.dim }}>
        {message}{!!next && <T style={{ fontSize: 14, lineHeight: 19.5, color: color.faint }}>{` ${next}`}</T>}
      </T>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notice" onPress={() => notices.dismiss(message)}
        style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Svg width={16} height={16} viewBox="0 0 16 16" fill="none"><Path d="m4 4 8 8M12 4l-8 8" stroke={color.dim} strokeWidth={1.5} /></Svg>
      </Pressable>
    </View>
  );
}
