// Attaching on the phone: the row or the paperclip that opens it, the sheet
// that asks where from, and the files waiting to go, each with a way to drop
// it. A picture waits as its thumbnail, as on the phone site (AttachRow.tsx).
import { useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { isImageName } from '../../../renderer/src/attachments';
import { pickAfterClose } from '../lib/attach';
import { pickFiles, pickPhotos, type Picked } from '../platform/pick';
import { Clip, Cross } from './icons';
import { Sheet, SheetHead, SheetRow, T } from './parts';
import { color } from './theme';

export function AttachSheet({ open, close, add, fail }: { open: boolean; close: () => void; add: (files: Picked[]) => void; fail: (why: string) => void }) {
  const [after] = useState(() => pickAfterClose({ ios: Platform.OS === 'ios' }));
  const from = (pick: () => Promise<Picked[]>) => () => {
    close();
    after.request(async () => {
      try { add(await pick()); } catch (err) { fail(String((err as Error)?.message ?? err)); }
    });
  };
  return (
    <Sheet open={open} close={close} onGone={after.gone}>
      <SheetHead>Attach</SheetHead>
      <SheetRow label="Photo library" onPress={from(pickPhotos)} />
      <SheetRow label="Files" onPress={from(pickFiles)} />
    </Sheet>
  );
}

const TYPES: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp' };
const dataUri = (f: Picked) => `data:image/${TYPES[f.name.split('.').pop()!.toLowerCase()] ?? 'png'};base64,${f.dataBase64}`;
const THUMB = 84;

// As tall as the site's (84), as wide as the picture is, up to 220.
function Thumb({ file, drop }: { file: Picked; drop: () => void }) {
  const [width, setWidth] = useState(THUMB);
  return (
    <View>
      <Image source={{ uri: dataUri(file) }} accessibilityLabel={file.name} resizeMode="cover"
        onLoad={(e) => { const { width: w = 0, height: h = 0 } = e.nativeEvent?.source ?? {}; if (w && h) setWidth(Math.min(220, Math.round((THUMB * w) / h))); }}
        style={{ height: THUMB, width, borderWidth: 1, borderColor: color.line }} />
      <Pressable onPress={drop} accessibilityLabel={`Remove ${file.name}`} hitSlop={10}
        style={{ position: 'absolute', top: 0, right: 0, width: 18, height: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: color.card, borderWidth: 1, borderColor: color.lineStrong }}>
        <Cross size={10} tint={color.dim} />
      </Pressable>
    </View>
  );
}

/** The files waiting to go with the message. */
export function Attached({ files, drop }: { files: Picked[]; drop: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {files.map((f, i) => (isImageName(f.name) ? <Thumb key={`${f.name}-${i}`} file={f} drop={() => drop(i)} /> : (
        <View key={`${f.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingLeft: 10, paddingRight: 4, borderWidth: 1, borderColor: color.line, backgroundColor: color.fill, maxWidth: 240 }}>
          <Clip size={13} tint={color.faint} />
          <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: color.dim }}>{f.name}</T>
          <Pressable onPress={() => drop(i)} accessibilityLabel={`Remove ${f.name}`} hitSlop={6} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Cross size={12} tint={color.faint} />
          </Pressable>
        </View>
      )))}
    </View>
  );
}
