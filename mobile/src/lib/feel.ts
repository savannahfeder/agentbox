import { Platform } from 'react-native';

type Haptics = typeof import('expo-haptics');

let haptics: Haptics | null = null;
if (Platform.OS !== 'web') {
  try {
    haptics = require('expo-haptics') as Haptics;
  } catch {
    haptics = null;
  }
}

const quiet = (p: Promise<void> | undefined) => { p?.catch(() => {}); };

export const feel = {
  pick: () => quiet(haptics?.selectionAsync()),
  tap: () => quiet(haptics?.impactAsync(haptics.ImpactFeedbackStyle.Light)),
  thud: () => quiet(haptics?.impactAsync(haptics.ImpactFeedbackStyle.Medium)),
};
