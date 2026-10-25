// What the hosted phone sends with a reply or a new thread: each file into
// her own storage, in the folder of the computer the thread is on, named by
// what is in it, and a link to it there in the words. That computer takes it
// down and links the reply to its own copy (main/phone-inbox.mjs).

const SENT = /(?:^|\/)phone-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/;
const SENT_IN_WORDS = /\]\(phone-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})\)/g;
const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf', txt: 'text/plain',
};

/** The name in storage of a file a message links as sent from the phone, from its path here. */
export const sentFileName = (file: string) => SENT.exec(String(file ?? ''))?.[1] ?? null;

/** The names in storage of the files some words link as sent from the phone. */
export const sentNamesIn = (words: string) => [...String(words ?? '').matchAll(SENT_IN_WORDS)].map((m) => m[1]);

type Put = (object: string, bytes: Uint8Array, type: string) => Promise<void>;

// The bucket's own bound on a file (20261017000000_phone_files.sql).
export const SEND_MAX_BYTES = 25 * 1024 * 1024;

/** Sends `files` and answers each as the reply box links a saved one: `{ rel, name, image }`. */
export async function sendFiles({ put, owner, device, files, maxBytes }: {
  put: Put; owner: string; device: string; files: Array<{ name: string; dataBase64?: string }>; maxBytes: number;
}) {
  const out: Array<{ rel: string; name: string; image: boolean }> = [];
  for (const f of files) {
    if (!f.dataBase64) throw new Error('This file could not be read on your phone.');
    const bytes = Uint8Array.from(atob(f.dataBase64), (c) => c.charCodeAt(0));
    if (bytes.length > maxBytes) throw new Error(`${f.name} is too big to send from your phone (${Math.floor(maxBytes / 1024 / 1024)} MB at most).`);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const ext = (/\.([a-z0-9]{1,8})$/i.exec(f.name)?.[1] ?? 'bin').toLowerCase();
    const name = `${hash}.${ext}`;
    try {
      await put(`${owner}/${device}/${name}`, bytes, TYPES[ext] ?? 'application/octet-stream');
    } catch (err) {
      const said = String((err as Error)?.message ?? err);
      if (/bucket not found/i.test(said)) throw new Error('Files cannot go from your phone yet: the storage for them is not set up.');
      throw new Error(`The file did not send: ${said}`);
    }
    const safe = String(f.name || 'file').replace(/[^\w.-]+/g, '-').slice(0, 80);
    out.push({ rel: `phone-files/${name}`, name: safe, image: /\.(png|jpe?g|gif|webp)$/i.test(safe) });
  }
  return out;
}
