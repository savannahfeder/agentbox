import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, TextInput, type StyleProp, type TextStyle } from 'react-native';
import { dragSelects } from '../lib/selection';
import type { Span } from '../lib/markdown';
import { T } from './parts';
import { color, font } from './theme';

const BASE: TextStyle = { fontFamily: font.regular, get color() { return color.text; }, fontSize: 15.5 };
// A TextInput's own insets, gone, so its words sit where a Text's would.
const FLAT: TextStyle = { padding: 0, paddingTop: 0, paddingBottom: 0, margin: 0, borderWidth: 0, backgroundColor: 'transparent' };

/** Words a long press and a drag can pick part of, on every phone. `spans` are what the line holds, when it holds runs of words. */
export function Selectable({ style, spans = [], children }: { style?: StyleProp<TextStyle>; spans?: Span[]; children: ReactNode }) {
  if (!dragSelects(spans, Platform.OS)) return <T selectable style={style}>{children}</T>;
  const look = StyleSheet.flatten([BASE, style]);
  return (
    <TextInput editable={false} multiline scrollEnabled={false} accessibilityRole="text" style={[look, FLAT]}>
      <Text style={look}>{children}</Text>
    </TextInput>
  );
}
