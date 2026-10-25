// The longest the boot screen waits for a saved team sign-in to come back.
// Past it the window draws without the team rather than stay blank on a slow
// network; under NOT_ANSWERING_MS so the boot screen never starts apologising.
export const TEAM_WAIT_MS = 4_000;
