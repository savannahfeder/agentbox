// The browser preview's player: the page's own `<video controls>`, as the phone site draws it.
import { View, type ViewStyle } from 'react-native';

export function Player({ link, film, style }: { link: string; film: boolean; style?: ViewStyle }) {
  const fill = { display: 'block', width: '100%', height: '100%', objectFit: 'contain' } as const;
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      {film ? <video controls preload="metadata" playsInline src={link} style={fill} /> : <audio controls preload="metadata" src={link} style={fill} />}
    </View>
  );
}
