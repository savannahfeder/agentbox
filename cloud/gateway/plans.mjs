// What each cloud plan allows (docs/cloud/PLAN.md, Plans). `agents` is how
// many run in the cloud at once; `hoursPerMonth` is the agent-hours behind it
// (null would mean none set, and such a plan cannot be given). There is no
// free cloud: someone with no plan (`none`) can sign in and add accounts, and
// runs nothing until they pay. Hours are the owner's (2026-10-20), against a
// measured $0.07 an agent-hour (scripts/cloud-usage.mjs).
export const PLANS = Object.freeze({
  none: Object.freeze({ agents: 0, hoursPerMonth: 0 }),
  pro: Object.freeze({ agents: 10, hoursPerMonth: 400, dollarsPerMonth: 40 }),
  plus: Object.freeze({ agents: 25, hoursPerMonth: 1200, dollarsPerMonth: 100 }),
  // Sold as unlimited at once: the hours bound the cost. `agents` is a ceiling
  // never shown, so one runaway loop cannot take the AWS session limit that
  // every customer shares.
  max: Object.freeze({ agents: 200, unlimited: true, hoursPerMonth: 3000, dollarsPerMonth: 200 }),
});

export const RUN_CEILING_MS = 8 * 60 * 60_000;
// The sandbox gives a sign-in 20 minutes, and checking it takes up to 4 more.
export const SIGNIN_CEILING_MS = 30 * 60_000;
export const SIGNINS_AT_ONCE = 3;
