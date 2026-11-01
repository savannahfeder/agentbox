// SENDING FEEDBACK TO THE AGENTBOX TEAM (w-1b574413db, 2026-10-04).
//
// The card hands the main process what you wrote and what you attached, and
// this file posts it to one server function. That function holds who it goes
// to as a secret (`FEEDBACK_TO`, cloud/supabase/functions/feedback), so the
// address is in no file of this public repository and no install can show it.
//
// WHERE IT GOES SHIPS IN THE CODE (w-58e758c81e, 2026-10-09). It used to be
// baked only into the packaged Mac app, so the npm package and a git clone,
// the two installs the README offers, told everyone who pressed Send that
// feedback was not set up, and lost what they wrote. FEEDBACK_ADDRESS is the
// server function, not an inbox. A `feedbackUrl` in zero.config.json, the
// FEEDBACK_URL variable, or a `bakedFeedbackUrl` in a packaged package.json
// still outrank it.
//
// It is not behind the diagnostics switch. That switch is about what Agentbox
// sends on its own; this is something a person typed and pressed Send on.
import { createRequire } from 'node:module';
import { readEnv } from '../shared/product-name.mjs';

export { sendFeedback } from '../shared/feedback.mjs';

export const FEEDBACK_ADDRESS = 'https://lywvthwkhkfzhqivvond.supabase.co/functions/v1/feedback';

function bakedUrl() {
  try {
    return createRequire(import.meta.url)('../package.json')?.bakedFeedbackUrl ?? FEEDBACK_ADDRESS;
  } catch {
    return FEEDBACK_ADDRESS;
  }
}

const BAKED = bakedUrl();
const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function feedbackUrl(config, baked = BAKED, env = process.env) {
  return clean(config?.feedbackUrl) ?? clean(readEnv('FEEDBACK_URL', env)) ?? clean(baked);
}
