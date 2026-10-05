// SENDING FEEDBACK TO THE AGENTBOX TEAM (w-1b574413db, 2026-10-04).
//
// The card hands the main process what you wrote and what you attached, and
// this file posts it to one server function. That function holds who it goes
// to as a secret (`FEEDBACK_TO`, cloud/supabase/functions/feedback), so the
// address is in no file of this public repository and no install can show it.
//
// WHERE IT GOES IS BAKED IN, like the analytics key (main/analytics.mjs): the
// release writes `bakedFeedbackUrl` into the packaged package.json, a copy run
// from source carries none, and a `feedbackUrl` in zero.config.json outranks
// both. A copy with nowhere to send says so in words rather than pretending.
//
// It is not behind the diagnostics switch. That switch is about what Agentbox
// sends on its own; this is something a person typed and pressed Send on.
import { createRequire } from 'node:module';
import { checkFeedback } from '../shared/feedback.mjs';
import { readEnv } from '../shared/product-name.mjs';

function bakedUrl() {
  try {
    return createRequire(import.meta.url)('../package.json')?.bakedFeedbackUrl ?? null;
  } catch {
    return null;
  }
}

const BAKED = bakedUrl();
const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function feedbackUrl(config, baked = BAKED, env = process.env) {
  return clean(config?.feedbackUrl) ?? clean(readEnv('FEEDBACK_URL', env)) ?? clean(baked);
}

// Answers { ok: true } or { ok: false, error } with the error as a sentence.
// It never throws, so the card always has something to say.
export async function sendFeedback({ url, payload, fetchImpl = globalThis.fetch, timeoutMs = 60_000 }) {
  if (!url) return { ok: false, error: 'Feedback is not set up in this copy of Agentbox.' };
  // Checked again here, off the bytes that would actually travel, since the
  // renderer is not the last word on what leaves this machine.
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
