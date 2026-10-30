// A long press on a file or a link: open it in the browser, or hand it to
// another app through the share sheet, which also copies it (lib/files.ts
// `linkToShare` says which address).
import * as WebBrowser from 'expo-web-browser';
import { ActionSheetIOS, Alert, Linking, Platform, Share } from 'react-native';

const OPEN = 'Open in browser';
const SHARE = 'Share or copy link';

const openOutside = (link: string) => void (/^mailto:/i.test(link) ? Linking.openURL(link) : Linking.openURL(link).catch(() => WebBrowser.openBrowserAsync(link)));
const share = (link: string) => void Share.share(Platform.OS === 'ios' ? { url: link } : { message: link }).catch(() => {});

export function offerLink(link: string | null, name: string, say: (line: string) => void) {
  if (!link) { say('This file is on your computer, so there is no link to open.'); return; }
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({ title: name, options: [OPEN, SHARE, 'Cancel'], cancelButtonIndex: 2 }, (i) => {
      if (i === 0) openOutside(link);
      if (i === 1) share(link);
    });
    return;
  }
  Alert.alert(name, undefined, [{ text: OPEN, onPress: () => openOutside(link) }, { text: SHARE, onPress: () => share(link) }, { text: 'Cancel', style: 'cancel' }]);
}
