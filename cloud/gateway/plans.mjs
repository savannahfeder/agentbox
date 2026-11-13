// What each cloud plan allows (docs/cloud/PLAN.md, Plans). `agents` is how
// many run in the cloud at once; `hoursPerMonth` is the agent-hours behind it
// (null would mean none set, and such a plan cannot be given). Someone with no
// plan (`none`) runs on FREE until it is spent. Hours are the owner's
// (2026-10-20), against a measured $0.07 an agent-hour (scripts/cloud-usage.mjs).
export const PLANS = Object.freeze({
  none: Object.freeze({ agents: 0, hoursPerMonth: 0, filesGB: 0 }),
  pro: Object.freeze({ agents: 10, hoursPerMonth: 400, dollarsPerMonth: 40, filesGB: 100 }),
  plus: Object.freeze({ agents: 25, hoursPerMonth: 1200, dollarsPerMonth: 100, filesGB: 500 }),
  // Sold as unlimited at once: the hours bound the cost. `agents` is a ceiling
  // never shown, so one runaway loop cannot take the AWS session limit that
  // every customer shares.
  max: Object.freeze({ agents: 200, unlimited: true, hoursPerMonth: 3000, dollarsPerMonth: 200, filesGB: 2048 }),
});

// Every account's first cloud hours, once and never again (the owner,
// 2026-11-06). Two at once, because ten would spend five hours in thirty minutes.
export const FREE = Object.freeze({ agents: 2, hours: 5 });

// A team's cloud (the owner, 2026-11-06; 7 days since 2026-11-10): free from
// the day it was made, 50 hours a member (10 until 2026-11-13: "10 cloud hours
// for pro is very bad given free is 5"); then $40 a seat a month, each seat
// Pro's hours and files. Hours are its only limit: "there should never be a limit on how
// many cloud agents a team can use at once" (the owner, 2026-11-13). Kept apart
// from PLANS, which are one person's.
export const TEAM = Object.freeze({ trialDays: 7, trialHoursPerMember: 50, hoursPerSeat: 400, dollarsPerSeat: 40, filesGBPerSeat: 100 });

// Files in the cloud are a paid plan's (the owner, 2026-11-09): a free plan
// keeps them on the computer, and a lapsed plan's are deleted after this,
// once the app has had the time to bring them back down.
export const FILES_LAPSE_DAYS = 30;

export const RUN_CEILING_MS = 8 * 60 * 60_000;
// The sandbox gives a sign-in 20 minutes, and checking it takes up to 4 more.
export const SIGNIN_CEILING_MS = 30 * 60_000;
export const SIGNINS_AT_ONCE = 3;
