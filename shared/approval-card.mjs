// A PERMISSION CARD'S FINGERPRINT, the one string the computer and the cloud
// server (cloud/gateway/phone.mjs) each take of a card on their own, and the
// phone sends back with her answer. main/approvals.mjs has why it is a digest
// of what was shown rather than of the request file.
//
// If the two sides canonicalise differently, every approval is denied with no
// reason shown. So the digest is taken after one JSON round trip, which does
// what the write to disk did, and then keys are sorted.
import crypto from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v) ?? 'null').join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = [];
    for (const key of Object.keys(value).sort()) {
      const v = canonical(value[key]);
      if (v !== undefined) fields.push(`${JSON.stringify(key)}:${v}`);
    }
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The card as one string either side can compute on its own. Null for a
 * non-object or anything JSON cannot express; null never equals a digest, so
 * callers deny. No Unicode normalisation: two byte strings that look the same
 * are still two different commands to her shell.
 */
export function cardDigest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return null;
  let text;
  try { text = canonical(JSON.parse(JSON.stringify(request))); } catch { return null; }
  if (typeof text !== 'string') return null;
  return crypto.createHash('sha256').update(text, 'utf8').digest('base64');
}
