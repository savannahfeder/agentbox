// What each cloud plan allows (docs/cloud/PLAN.md, Plans). `agents` is how
// many run in the cloud at once; `hoursPerMonth` is the agent-hours behind it
// (null would mean none set, and such a plan cannot be given). Someone with no
// plan (`none`) runs nothing in the cloud unless their team's trial or seats
// pay for it: there are no free hours (the owner, 2026-11-16, in favour of the
// 7-day trials below). Hours are the owner's
// (2026-10-20), against a measured $0.07 an agent-hour (scripts/cloud-usage.mjs).
export const PLANS = Object.freeze({
  none: Object.freeze({ agents: 0, hoursPerMonth: 0, filesGB: 0 }),
  // Every plan is unlimited at once: the hours bound the cost ("we got rid of
  // the agent slot limitation", the owner, 2026-11-16). `agents` is a ceiling
  // never shown, so one runaway loop cannot take the AWS session limit that
  // every customer shares.
  pro: Object.freeze({ agents: 200, unlimited: true, hoursPerMonth: 400, dollarsPerMonth: 40, filesGB: 100 }),
  plus: Object.freeze({ agents: 200, unlimited: true, hoursPerMonth: 1200, dollarsPerMonth: 100, filesGB: 500 }),
  max: Object.freeze({ agents: 200, unlimited: true, hoursPerMonth: 3000, dollarsPerMonth: 200, filesGB: 2048 }),
});

// Every paid plan starts with 7 free days and 50 hours, once per person (the
// owner, 2026-11-16). The same hours on every plan, so the dearest plan is no
// way to more free hours; once they are used, the app offers to start the plan now.
export const PLAN_TRIAL = Object.freeze({ days: 7, hours: 50 });

// A team's cloud (the owner, 2026-11-06; 7 days since 2026-11-10): a free week
// once a card is on file (2026-11-21; it was from the day the team was made,
// with no card), 50 hours a member (10 until 2026-11-13: "10 cloud hours
// for pro is very bad given free is 5"); then $40 a seat a month, each seat
// Pro's hours and files. Hours are its only limit: "there should never be a limit on how
// many cloud agents a team can use at once" (the owner, 2026-11-13). Kept apart
// from PLANS, which are one person's.
export const TEAM = Object.freeze({ trialDays: 7, trialHoursPerMember: 50, hoursPerSeat: 400, dollarsPerSeat: 40, filesGBPerSeat: 100 });

/** The free days a team's checkout gives now, for a trial ending at `endsAt`. Stripe trials nothing that
 *  ends within 48 hours, and words the free time in whole days rounded down, so they are whole days rounded
 *  up: never fewer than the app said. The checkout and the plan page that offers it both use this. */
export function teamFreeDays(endsAt, now) {
  const DAY = 24 * 60 * 60_000;
  const left = endsAt - now;
  return left > 2 * DAY ? Math.ceil(left / DAY) : 0;
}

// Files in the cloud are a paid plan's (the owner, 2026-11-09): a free plan
// keeps them on the computer, and a lapsed plan's are deleted after this,
// once the app has had the time to bring them back down.
export const FILES_LAPSE_DAYS = 30;

export const RUN_CEILING_MS = 8 * 60 * 60_000;
// The sandbox gives a sign-in 20 minutes, and checking it takes up to 4 more.
export const SIGNIN_CEILING_MS = 30 * 60_000;
export const SIGNINS_AT_ONCE = 3;
