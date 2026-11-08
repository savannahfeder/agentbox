// A long press on a file or a link. A site opens in the browser or shares its
// address; a file the phone has saves to Photos or shares as the file itself
// (lib/keep.ts), or opens in the browser.
import * as WebBrowser from 'expo-web-browser';
import { ActionSheetIOS, Alert, Linking, Platform, Share } from 'react-native';
import { choicesFor, OPEN, SAVE, SHARE, SHARE_FILE, SHARE_LINK, type Keepable } from '../lib/keep';
import { keep } from '../platform/keep';

const openOutside = (link: string) => void (/^mailto:/i.test(link) ? Linking.openURL(link) : Linking.openURL(link).catch(() => WebBrowser.openBrowserAsync(link)));
const share = (link: string) => void Share.share(Platform.OS === 'ios' ? { url: link } : { message: link }).catch(() => {});

export function offerLink(link: string | null, name: string, say: (line: string) => void, file: Keepable | null = null) {
  if (!link) { say('This file is on your computer, so there is no link to open.'); return; }
  const choices = choicesFor(file, link);
  const pick = (choice: string | undefined) => {
    if (choice === OPEN) openOutside(link);
    else if (choice === SHARE_LINK) share(link);
    else if (file && choice === SAVE) void keep(file, 'photos', say);
    else if (file && (choice === SHARE || choice === SHARE_FILE)) void keep(file, 'share', say);
  };
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({ title: name, options: [...choices, 'Cancel'], cancelButtonIndex: choices.length }, (i) => pick(choices[i]));
    return;
  }
  // Android draws three buttons at most; a tap outside cancels.
  const buttons = choices.map((text) => ({ text, onPress: () => pick(text) }));
  Alert.alert(name, undefined, buttons.length < 3 ? [...buttons, { text: 'Cancel', style: 'cancel' as const }] : buttons, { cancelable: true });
}
