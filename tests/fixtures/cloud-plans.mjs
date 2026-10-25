// For tests of the cloud server that are not about plans but need runs to
// start: the real "none" plan runs nothing (cloud/gateway/plans.mjs), so here
// it has room.
import { PLANS } from '../../cloud/gateway/plans.mjs';

export const ROOMY_PLANS = { ...PLANS, none: { agents: 5, hoursPerMonth: 100 } };
