import { useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { noticeDismissal } from '../lib/notice-dismissal';
import { appStore } from '../platform/persist';
import { T } from './parts';
import { color, size } from './theme';

const notices = noticeDismissal(appStore);

export function StatusNotice({ message }: { message?: string | null }) {
  const hidden = useSyncExternalStore(notices.subscribe, () => !message || notices.hidden(message), () => false);
  if (!message || hidden) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginHorizontal: size.inset, marginBottom: 2, paddingLeft: 12, borderWidth: 1, borderColor: color.lineStrong }}>
      <T style={{ flex: 1, paddingVertical: 9, fontSize: 13, lineHeight: 18.2, color: color.dim }}>{message}</T>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notice" onPress={() => notices.dismiss(message)}
        style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Svg width={16} height={16} viewBox="0 0 16 16" fill="none"><Path d="m4 4 8 8M12 4l-8 8" stroke={color.dim} strokeWidth={1.5} /></Svg>
      </Pressable>
    </View>
  );
}
