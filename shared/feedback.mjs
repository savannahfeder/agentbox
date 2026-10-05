// WHAT A PIECE OF FEEDBACK MAY BE, in one place, read by the card before it
// lets you press Send and by the main process again before anything leaves the
// machine (w-1b574413db). The server function checks the same limits a third
// time, because it is the only one of the three a stranger can reach directly.
//
// Words, files, or both, and never nothing. The size limit keeps one request
// well inside what the mail provider takes as attachments.

export const FEEDBACK_LIMITS = Object.freeze({
  text: 20_000,
  files: 10,
  bytes: 8 * 1024 * 1024,
});

export function totalBytes(files = []) {
  return files.reduce((sum, f) => sum + (Number.isFinite(f?.size) ? f.size : 0), 0);
}

// { ok: true } or { ok: false, reason } where the reason is a sentence the
// card can show as it is.
export function checkFeedback({ text = '', files = [] } = {}) {
  const words = String(text ?? '').trim();
  const list = Array.isArray(files) ? files : [];
  if (!words && list.length === 0) return { ok: false, reason: 'Write something or attach a file first.' };
  if (words.length > FEEDBACK_LIMITS.text) {
    return { ok: false, reason: `Keep it under ${FEEDBACK_LIMITS.text.toLocaleString('en-US')} characters.` };
  }
  if (list.length > FEEDBACK_LIMITS.files) return { ok: false, reason: `Attach up to ${FEEDBACK_LIMITS.files} files.` };
  if (totalBytes(list) > FEEDBACK_LIMITS.bytes) {
    return { ok: false, reason: `Files can add up to ${FEEDBACK_LIMITS.bytes / 1024 / 1024} MB.` };
  }
  return { ok: true };
}

// Exactly what travels: the words trimmed, each file as name, type and its
// base64, and the app's version so a report can be matched to a release.
// Nothing else the card happened to hold rides along.
export function feedbackPayload({ text = '', files = [], app = {} } = {}) {
  return {
    text: String(text ?? '').trim(),
    files: (files ?? []).map(({ name, type, data }) => ({ name: String(name ?? 'file'), type: String(type || 'application/octet-stream'), data: String(data ?? '') })),
    app: { version: String(app.version ?? ''), os: String(app.os ?? '') },
  };
}
