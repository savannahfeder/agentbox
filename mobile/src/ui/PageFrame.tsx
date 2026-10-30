// A page made ready for the phone (phone-links.ts `phonePage`), drawn with none
// of its own code running, as the phone site's frame draws it. `desktop` lays
// it out 1200 wide and shrinks it to the frame, as a tile's picture of it.
import { useMemo, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { filmsPlayHere } from '../lib/page-films';

export const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const DESKTOP = 1200;

export function PageFrame({ html, desktop = false, style }: { html: string; desktop?: boolean; style?: ViewStyle }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  // A page opened on its own plays its films in place, with their own controls (lib/page-films.ts).
  const source = useMemo(() => ({ html: desktop ? html : filmsPlayHere(html) }), [html, desktop]);
  const page = (
    <WebView source={source} originWhitelist={['*']} javaScriptEnabled={false} scrollEnabled={!desktop}
      allowsInlineMediaPlayback allowsFullscreenVideo mediaPlaybackRequiresUserAction
      style={{ flex: 1, backgroundColor: 'transparent' }} />
  );
  if (!desktop) return <View style={[{ overflow: 'hidden' }, style]}>{page}</View>;
  const scale = box.w / DESKTOP;
  return (
    <View style={[{ overflow: 'hidden' }, style]} pointerEvents="none" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {scale > 0 && (
        <View style={{ width: DESKTOP, height: box.h / scale, transform: [{ scale }], transformOrigin: 'top left' }}>{page}</View>
      )}
    </View>
  );
}
