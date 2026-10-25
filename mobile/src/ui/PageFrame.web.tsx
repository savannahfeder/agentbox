// The browser preview's frame for a page: an iframe that runs none of the page's code.
import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';

export const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const DESKTOP = 1200;

export function PageFrame({ html, desktop = false, style }: { html: string; desktop?: boolean; style?: ViewStyle }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const frame = (w: number | string, h: number | string) => (
    <iframe srcDoc={html} sandbox="" title="Page" scrolling={desktop ? 'no' : 'yes'} tabIndex={desktop ? -1 : 0}
      style={{ border: 0, display: 'block', width: w, height: h, background: 'transparent' }} />
  );
  if (!desktop) return <View style={[{ overflow: 'hidden' }, style]}>{frame('100%', '100%')}</View>;
  const scale = box.w / DESKTOP;
  return (
    <View style={[{ overflow: 'hidden' }, style]} pointerEvents="none" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {scale > 0 && <View style={{ width: DESKTOP, height: box.h / scale, transform: [{ scale }], transformOrigin: 'top left' }}>{frame(DESKTOP, box.h / scale)}</View>}
    </View>
  );
}
