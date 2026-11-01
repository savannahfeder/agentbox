// WHAT A PIECE OF FEEDBACK MAY BE, in one place, read by the card before it
// lets you press Send and by the main process again before anything leaves the
// machine (w-1b574413db). The server function checks the same limits a third
// time, because it is the only one of the three a stranger can reach directly.
//
// Words, files, or both, and never nothing. The size limit keeps one request
// well inside what the mail provider takes as attachments.
import { Name } from './product-name.mjs';

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
// base64, the app's version so a report can be matched to a release, and the
// random install id so reports from one install read as one sender.
// Nothing else the card happened to hold rides along.
export function feedbackPayload({ text = '', files = [], app = {} } = {}) {
  return {
    text: String(text ?? '').trim(),
    files: (files ?? []).map(({ name, type, data }) => ({ name: String(name ?? 'file'), type: String(type || 'application/octet-stream'), data: String(data ?? '') })),
    app: { version: String(app.version ?? ''), os: String(app.os ?? ''), install: String(app.install ?? '').slice(0, 64) },
  };
}

// Answers { ok: true } or { ok: false, error } with the error as a sentence.
// It never throws, so the card always has something to say. The Mac sends
// through it (main/feedback.mjs) and so does the phone website (cloud-bridge.ts).
export async function sendFeedback({ url, payload, fetchImpl = globalThis.fetch, timeoutMs = 60_000 }) {
  if (!url) return { ok: false, error: `Feedback is not set up in this copy of ${Name}.` };
  // Checked again here, off the bytes that would actually travel, since the
  // card is not the last word on what leaves the device.
  const sized = (payload?.files ?? []).map((f) => ({ size: Math.floor((String(f?.data ?? '').length * 3) / 4) }));
  const check = checkFeedback({ text: payload?.text, files: sized });
  if (!check.ok) return { ok: false, error: check.reason };
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res?.ok) return { ok: true };
    return { ok: false, error: 'It did not send. Try again in a moment.' };
  } catch {
    return { ok: false, error: 'It did not send. Check your connection and try again.' };
  }
}
