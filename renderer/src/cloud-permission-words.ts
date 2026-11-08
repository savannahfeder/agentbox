// What the "In the cloud" permission rows say, on the desktop and the phone.
import { CODEX_MODES, CODEX_MODE_ORDER } from './codex-modes';
import type { CodexModeId } from './types';

export const SAME_AS_HERE = 'The same as on this computer.';

// Full access's own sentence says "on this computer", which a cloud run is not.
export const CODEX_CLOUD_WHAT: Record<CodexModeId, string> = {
  ...Object.fromEntries(CODEX_MODE_ORDER.map((id) => [id, CODEX_MODES[id].what])) as Record<CodexModeId, string>,
  'full-access': 'Anything on its own throwaway cloud machine, without asking.',
};
