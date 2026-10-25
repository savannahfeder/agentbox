// A FILE HER PHONE SENT WITH A REPLY OR A NEW THREAD: put in her storage, in
// the folder of the computer the thread is on, named by what is in it
// (renderer/src/phone-sends-files.ts), and linked in her words. The computer
// (main/phone-inbox.mjs) and the cloud server (cloud/gateway/phone.mjs) each
// put it in the project's attachments under the same name, made from what is
// in it, so a turn the cloud ran and the row the computer keeps link one file.

export const PHONE_FILE = /(!?)\[([^\]\n]*)\]\(phone-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})\)/g;
export const PHONE_FILES_MAX = 10;
// The bucket's own bound on a file (20261017000000_phone_files.sql).
export const PHONE_FILE_MAX_BYTES = 25 * 1024 * 1024;

export function phoneFilesIn(text) {
  return [...String(text ?? '').matchAll(PHONE_FILE)].map((m) => ({ link: m[0], picture: m[1] === '!', label: m[2], name: m[3] }));
}

/** The name it goes under, as main/save-attachments.mjs makes one safe. */
export const phoneFileSafeName = (f) => String(String(f.label ?? '').trim() || f.name).replace(/[^\w.-]+/g, '-').slice(0, 80);

/** Where it goes in the project's documents folder: the same file, the same place. */
export const phoneAttachmentRel = (f) => `attachments/${String(f.name).slice(0, 16)}-${phoneFileSafeName(f)}`;

/** Her words with each file linked where it was put. */
export function linkPhoneFiles(text, found = phoneFilesIn(text)) {
  let out = String(text ?? '');
  for (const f of found) out = out.replace(f.link, () => `${f.picture ? '!' : ''}[${phoneFileSafeName(f)}](${phoneAttachmentRel(f)})`);
  return out;
}
