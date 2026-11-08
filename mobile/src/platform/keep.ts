// The phone's own half of lib/keep.ts: the cache, Photos and the share sheet.
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { withDeadline } from '../lib/deadline';
import { keepFile, type Keepable } from '../lib/keep';

async function download(link: string, name: string): Promise<string> {
  const res = await withDeadline(fetch)(link);
  if (!res.ok) throw new Error(`The cloud answered ${res.status}.`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const dir = new Directory(Paths.cache, 'kept');
  dir.create({ idempotent: true, intermediates: true });
  const file = new File(dir, name);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

const deps = {
  download,
  allowPhotos: async () => (await requestPermissionsAsync(true, ['photo', 'video'])).granted,
  toPhotos: async (uri: string) => { await Asset.create(uri); },
  share: (uri: string) => Sharing.shareAsync(uri),
};

/** Saves to Photos or shares the file, and says how it went. The browser preview can only open it. */
export async function keep(k: Keepable, how: 'photos' | 'share', say: (line: string) => void) {
  if (Platform.OS === 'web') { void WebBrowser.openBrowserAsync(k.link); return; }
  const line = await keepFile(k, how, deps);
  if (line) say(line);
}
