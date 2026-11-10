// iOS's own menu on a held picture (ios/PictureMenuModule.swift). Where the
// module is not built in (Android, the browser preview, a build made before
// it) the picture is drawn as it was and `hasPictureMenu` is false.
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ReactNode } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';

type NativeProps = { uri: string; corner: number; onTrouble(e: { nativeEvent: { line: string } }): void; style?: StyleProp<ViewStyle>; children?: ReactNode };

const Native = Platform.OS === 'ios' && requireOptionalNativeModule('PictureMenu') ? requireNativeView<NativeProps>('PictureMenu') : null;

export const hasPictureMenu = !!Native;

export function PictureMenu({ uri, corner = 0, say, style, children }: { uri: string | null | undefined; corner?: number; say(line: string): void; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  if (!Native || !uri) return <>{children}</>;
  return <Native uri={uri} corner={corner} onTrouble={(e) => say(e.nativeEvent.line)} style={style}>{children}</Native>;
}
