// Files from the phone, read as the phone site's sendFiles takes them: a name
// and the bytes in base64.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { pickedName, tooBigToSend } from '../lib/attach';

// `uri` is the picked file on the phone, kept so its thumbnail is drawn from the file.
export interface Picked { name: string; dataBase64: string; uri?: string }

export async function pickPhotos(): Promise<Picked[]> {
  const got = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.9, base64: Platform.OS === 'web' });
  if (got.canceled) return [];
  const out: Picked[] = [];
  for (const a of got.assets) {
    const name = pickedName(a.fileName, a.type, out.length);
    const big = tooBigToSend(name, a.fileSize);
    if (big) throw new Error(big);
    out.push({ name, dataBase64: a.base64 ?? await new File(a.uri).base64(), ...onPhone(a.uri) });
  }
  return out;
}

export async function pickFiles(): Promise<Picked[]> {
  const got = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (got.canceled) return [];
  for (const a of got.assets) { const big = tooBigToSend(a.name, a.size); if (big) throw new Error(big); }
  return Promise.all(got.assets.map(async (a) => ({ name: a.name, dataBase64: await base64Of(a), ...onPhone(a.uri) })));
}

function onPhone(uri: string): { uri?: string } {
  return Platform.OS === 'web' ? {} : { uri };
}

// Expo's file reader is the phone's; the browser preview reads the picked file itself.
async function base64Of(a: { uri: string; file?: Blob }): Promise<string> {
  if (Platform.OS !== 'web') return new File(a.uri).base64();
  if (a.uri.startsWith('data:')) return a.uri.slice(a.uri.indexOf(',') + 1);
  const blob = a.file;
  if (!blob) throw new Error('This file could not be read.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('This file could not be read.'));
    reader.readAsDataURL(blob);
  });
}
