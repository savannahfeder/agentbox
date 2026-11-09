// What the "In the cloud" permission rows say, on the desktop and the phone.
import { CODEX_MODES, CODEX_MODE_ORDER } from './codex-modes';
import type { CodexModeId } from './types';

/** The phone says "your computer": there "this" is the phone. */
export const sameAsHere = (computer = 'this computer') => `The same as on ${computer}.`;

// Full access's own sentence says "on this computer", which a cloud run is not.
export const CODEX_CLOUD_WHAT: Record<CodexModeId, string> = {
  ...Object.fromEntries(CODEX_MODE_ORDER.map((id) => [id, CODEX_MODES[id].what])) as Record<CodexModeId, string>,
  'full-access': 'Anything on its own throwaway cloud machine, without asking.',
};
