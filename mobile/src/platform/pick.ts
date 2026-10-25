// Files from the phone, read as the phone site's sendFiles takes them: a name
// and the bytes in base64.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export interface Picked { name: string; dataBase64: string }

export async function pickPhotos(): Promise<Picked[]> {
  const got = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, base64: true, quality: 0.9 });
  if (got.canceled) return [];
  const out: Picked[] = [];
  for (const a of got.assets) {
    const name = a.fileName || `photo-${out.length + 1}.${a.type === 'video' ? 'mov' : 'jpg'}`;
    out.push({ name, dataBase64: a.base64 ?? await new File(a.uri).base64() });
  }
  return out;
}

export async function pickFiles(): Promise<Picked[]> {
  const got = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (got.canceled) return [];
  return Promise.all(got.assets.map(async (a) => ({ name: a.name, dataBase64: await base64Of(a) })));
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
