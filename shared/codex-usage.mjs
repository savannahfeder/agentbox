// WHAT IS LEFT OF HER LIMIT, OUT OF `codex app-server`'S OWN RATE LIMITS.
//
// The pure half, and the mirror of shared/claude-usage.mjs: the payload in, the
// limits out. Everything after that -- the countdown, the rows, the sentence --
// is shared/usage.mjs, because a limit is a limit whichever agent reported it.
// Asking for the payload is main/codex-usage.mjs.
//
// NOTHING IS SPAWNED TO DRAW THIS AND NOTHING IS ASKED FOR IT, which is the
// whole reason this reader looks nothing like the other one. `claude -p /usage`
// costs a child process and twenty-five seconds, which is what shaped every line
// of main/claude-usage.mjs. Codex's figures ride the app-server the fleet is
// ALREADY running and arrive unprompted as `account/rateLimits/updated` during a
// turn. That push is the only source: the explicit read that once sat beside it
// turned out to be a request to OpenAI's backend rather than a local lookup, and
// main/codex-usage.mjs holds the measurement and the reason it is deliberately
// gone. So there is no 25-second cost here to design around, and there is no
// reading at all until a turn reports one -- which is honest, and is better than
// paying for a picture.
//
// ---------------------------------------------------------------------------
// MEASURED ON THIS MAC, 2026-09-05, codex-cli 0.148.0, by running a real
// app-server against a scratch CODEX_HOME and asking it once BY HAND, which is
// the only thing that has ever asked -- Agentbox does not, per the paragraph
// above. Verbatim, at now(s) = 1788565827:
//
//   "rateLimits": { "limitId": "codex", "limitName": null,
//     "primary":   { "usedPercent": 33, "windowDurationMins": 300,   "resetsAt": 1788573509 },
//     "secondary": { "usedPercent": 63, "windowDurationMins": 10080, "resetsAt": 1788798916 } }
//
// PRIMARY IS THE FIVE HOUR WINDOW AND SECONDARY IS THE WEEK, and that is read
// off `windowDurationMins` rather than assumed: 300 minutes is five hours and
// 10080 is seven days. So they take her own names for the same two spans --
// "This session" and "This week" -- and no new vocabulary is invented for a
// fact she already has a word for.
//
// `resetsAt` IS UNIX SECONDS. Two proofs off that one capture, because a unit
// read wrong by a thousand is the confident wrong number this whole surface
// exists to avoid. The `base_model_inference` bucket on the same response read
// `{"usedPercent":0,"windowDurationMins":10080,"resetsAt":1789170627}`, and
// 1789170627 - 1788565827 is 604800 exactly, which is those 10080 minutes to the
// second. And the schema's neighbouring `RateLimitResetCredit.expiresAt` is
// documented "Unix timestamp in seconds". It is multiplied by 1000 once, below,
// and nowhere else.
//
// A WINDOW THAT IS NOT THERE IS ORDINARY, NOT AN ERROR. Off
// `codex app-server generate-json-schema` on the same machine: in
// `RateLimitSnapshot` both `primary` and `secondary` are
// `anyOf [RateLimitWindow, null]` and the object has NO required field at all;
// `usedPercent` is the one required field of a window, and `resetsAt` and
// `windowDurationMins` are both nullable. The live read proved it too --
// `base_model_inference` came back with `"secondary": null`.
//
// SO AN ABSENT WINDOW IS ABSENT AND NEVER A ZERO. That is the dashboard law:
// absence of data and a real zero are different facts and must never look the
// same. A window that really reported 0% keeps its row and its empty bar; one
// that is not there has no row.

// ---------------------------------------------------------------------------
// AND `primary` IS NOT ALWAYS THE FIVE HOUR WINDOW. The block above read one
// scratch account on 2026-09-05 and took the pairing it happened to see as the
// shape. On some Codex plans the rate-limit records look different: EVERY ONE
// of them has `secondary: null` and a `primary` whose window is 10080 minutes.
// Not one five hour window exists on such a plan.
//
// So the old table would have drawn a SEVEN DAY limit under the words "This
// session", which is a confident wrong number about the user's subscription,
// and the corner would have counted a week down as though it were an afternoon.
//
// THE WINDOW'S OWN LENGTH DECIDES WHAT IT IS CALLED, and the slot it arrived in
// decides nothing. 300 minutes is a session, 10080 is a week, and an account
// reporting only one of them gets only that one row. The slot order is still the
// tie-breaker when a payload names no duration at all, because that is the one
// case where there is nothing better to go on.
//
// TWO SPELLINGS REACH HERE, and both are real. The app-server's push is
// camelCase (`usedPercent`, `windowDurationMins`, `resetsAt`); the session log on
// disk, which main/codex-usage-file.mjs reads when no push has arrived, is
// snake_case (`used_percent`, `window_minutes`, `resets_at`). They are the same
// numbers from the same service and neither is converted upstream, so both are
// accepted right here rather than in two places that could drift apart.

const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The order the panel draws them in, and the fallback when nothing says how
 *  long a window is. */
const WINDOWS = ['primary', 'secondary'];

const FALLBACK = { primary: ['session', 'This session'], secondary: ['week', 'This week'] };

/** Either spelling of the same field, because two sources feed this. */
const field = (window, camel, snake) => {
  const value = window?.[camel] ?? window?.[snake];
  return Number.isFinite(value) ? value : null;
};

/**
 * WHAT TO CALL A WINDOW OF THIS MANY MINUTES, in the words she already uses.
 *
 * Her two names came off and no new vocabulary is invented for a span she has a
 * word for. Anything that is neither of those two is named after its own length
 * rather than guessed at, because a limit drawn under the wrong span is worse
 * than one drawn under a plain one.
 */
export function windowSpan(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes <= 60 * 12) return ['session', 'This session'];
  if (minutes >= 60 * 24 * 6 && minutes <= 60 * 24 * 8) return ['week', 'This week'];
  if (minutes >= 60 * 24 * 27 && minutes <= 60 * 24 * 32) return ['month', 'This month'];
  const days = Math.round(minutes / (60 * 24));
  if (days >= 2) return ['window', `These ${days} days`];
  const hours = Math.round(minutes / 60);
  return ['window', `These ${hours} hours`];
}

/**
 * EVERY WINDOW THE SNAPSHOT REALLY CARRIES, in the shape shared/usage.mjs draws.
 *
 * `qualifier` is null and stays null: it is Claude Code's own word for which
 * model a weekly line is about, and nothing in this payload is about a model.
 * `resetsText`, `resetsOn` and `zone` are null for the same kind of reason --
 * Codex prints no clock time and names no timezone, it hands over the instant
 * itself, so the panel counts down to it rather than re-deriving a wall time we
 * were never given.
 */
export function codexLimits(snapshot) {
  const out = [];
  const refused = reachedWindow(snapshot);
  for (const key of WINDOWS) {
    const window = snapshot?.[key];
    if (!plain(window)) continue;
    const percent = field(window, 'usedPercent', 'used_percent');
    if (percent === null) continue;
    const minutes = field(window, 'windowDurationMins', 'window_minutes');
    const [span, name] = windowSpan(minutes) ?? FALLBACK[key];
    const resets = field(window, 'resetsAt', 'resets_at');
    const reached = refused === key;
    out.push({
      span,
      qualifier: null,
      name,
      percent: drawnPercent(percent),
      // WHETHER THIS WINDOW IS ACTUALLY FINISHED, which a percentage cannot say
      // (w-36c51443df). Only the provider knows: a window can be refused below
      // a hundred by a spend control or a per-account limit, and one sitting at
      // a hundred may still be serving. So this is read off the payload and
      // never derived from `percent`.
      reached,
      resetsText: null,
      resetsOn: null,
      resetsAt: resets === null ? null : resets * 1000,
      zone: null,
    });
  }
  return out;
}

/**
 * WHICH WINDOW THE PROVIDER SAYS IS SPENT, or null when it says nothing.
 *
 * `rateLimitReachedType` NAMES a window (`primary` / `secondary`), measured on a
 * live push 2026-10-09, so it belongs on that window's own line rather than on
 * the reading as a whole. A name for a window that is not in the payload is
 * ignored rather than guessed at: marking a line we were not told about is how
 * a confident wrong number gets drawn.
 */
function reachedWindow(snapshot) {
  const named = snapshot?.rateLimitReachedType ?? snapshot?.rate_limit_reached_type;
  return WINDOWS.includes(named) ? named : null;
}

/**
 * THE FIGURE TO DRAW, WHICH MAY NOT MANUFACTURE A HUNDRED (w-36c51443df).
 *
 * `Math.round` drew 99.6% as "100%", so the one number on the screen that
 * should have meant "stop" meant "nearly". A reading nobody can act on is worse
 * than a blunter one, so anything short of the whole window draws at most 99
 * and 100 means a hundred.
 *
 * AND `reached` IS DELIBERATELY NOT AN INPUT HERE. The first draft of this fix
 * forced 100 whenever the provider refused the window, which is the same sin
 * one field along: a window capped at 12% by a spend control really is at 12%,
 * and writing 100 over it would be inventing usage that was never reported.
 * `percent` says how much has been spent; `reached` says whether it is refused.
 * Two facts, two fields, and the panel reads "stop" off the second one.
 *
 * The clamp stays exactly as it was: a provider that over- or under-reports
 * must not put an impossible number on her screen.
 */
function drawnPercent(percent) {
  const inRange = Math.max(0, Math.min(100, percent));
  if (inRange >= 100) return 100;
  return Math.min(99, Math.round(inRange));
}

/**
 * THE FACTS ABOUT THE ACCOUNT RATHER THAN ABOUT ONE WINDOW (w-36c51443df).
 *
 * The push carries ten fields and `codexLimits` read two of them. These four
 * are the rest of what a person would want to know, and the campaign that found
 * this could not answer any of them from the screen:
 *
 *   plan                which subscription is paying. Measured: "prolite".
 *   credits             whether there is anything behind the window when it
 *                       goes. Measured: `{hasCredits:false, balance:"0"}`, so
 *                       nothing -- and "100% used" reads very differently with
 *                       and without that.
 *   spendControlReached a cap she or her organisation set, not the plan's.
 *   reached             which window the provider refused, for any surface
 *                       drawing the reading whole rather than line by line.
 *
 * NULLS RATHER THAN GUESSES, for the reason main/codex-usage.mjs gives about
 * percentages: a plan nobody has reported is not a plan of none, and a reading
 * that invents one is worse than a panel that stays quiet.
 */
export function codexPlan(snapshot) {
  const credits = plain(snapshot?.credits) ? snapshot.credits : null;
  const bool = (value) => (typeof value === 'boolean' ? value : null);
  return {
    plan: typeof snapshot?.planType === 'string' && snapshot.planType
      ? snapshot.planType
      : (typeof snapshot?.plan_type === 'string' && snapshot.plan_type ? snapshot.plan_type : null),
    credits: credits ? (bool(credits.hasCredits) ?? bool(credits.has_credits)) : null,
    unlimitedCredits: credits ? bool(credits.unlimited) : null,
    spendControlReached: bool(snapshot?.spendControlReached ?? snapshot?.spend_control_reached),
    reached: reachedWindow(snapshot),
  };
}

/**
 * FOLD A ROLLING UPDATE INTO WHAT WE ALREADY HAD, WHICH IS THE PROTOCOL'S OWN
 * INSTRUCTION AND NOT A KINDNESS.
 *
 * A CLIENT THAT REPLACED WOULD EMPTY THE PANEL AT RANDOM. Every notification
 * carrying only the five hour window would take the week away, and one carrying
 * neither would take both -- and this repo already puts exactly that on the wire
 * (`{ rateLimits: {} }`, in
 * tests/one-codex-process-carries-many-threads-and-a-card-nobody-answers-waits.test.mjs).
 * The failure would look like the corner going quiet for no reason, which is the
 * complaint this whole surface started from.
 *
 * AND FOLDING IS THE WHOLE OF IT, because the push is the whole of the input.
 * `previous` is null exactly once, on the first update ever seen: there is no
 * read response to start from, deliberately (main/codex-usage.mjs). The schema's
 * other instruction -- "or refetch that snapshot" -- is the branch this app does
 * not take, and the reason is written down there rather than repeated here.
 *
 * Only the two windows are carried. Nothing else in the payload is drawn, and a
 * merge that kept fields nobody reads would be inviting somebody to read them.
 */
/**
 * THE ACCOUNT-LEVEL FIELDS A FOLD ALSO HAS TO KEEP (w-36c51443df).
 *
 * The rule above was "only the two windows, because a merge that kept fields
 * nobody reads would be inviting somebody to read them". That was right while
 * nothing read them, and it is exactly why a cap was unreadable. `codexPlan`
 * reads these now, so they have to survive a fold for the same reason the
 * windows do: a push carrying only a window would otherwise drop a
 * `rateLimitReachedType` that arrived a beat earlier, and the corner would fall
 * back from "spent" to a percentage for no reason -- which is the failure this
 * function exists to prevent, one field along.
 *
 * Still nothing beyond what is drawn. `limitId`, `limitName`, `normalModelSlug`
 * and `individualLimit` stay out, because nothing reads them.
 */
const CARRIED = ['planType', 'credits', 'spendControlReached', 'rateLimitReachedType'];

export function mergeRateLimits(previous, update) {
  const out = {};
  for (const key of WINDOWS) {
    if (plain(update?.[key])) out[key] = update[key];
    else if (plain(previous?.[key])) out[key] = previous[key];
    else out[key] = null;
  }
  // `undefined` AND `null` BOTH MEAN "THIS PUSH SAID NOTHING", so either keeps
  // what was already known -- the measured push carried explicit nulls for
  // `spendControlReached` and `rateLimitReachedType` while they were fine, and
  // treating those as news would forget a cap on the very next beat. A push
  // genuinely lifting one carries `false`, which is a value and does replace.
  for (const key of CARRIED) {
    const said = update?.[key];
    out[key] = said === undefined || said === null ? (previous?.[key] ?? null) : said;
  }
  return out;
}
