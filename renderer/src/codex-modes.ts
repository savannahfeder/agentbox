// CODEX'S THREE MODES, TYPED, FOR THE SCREENS THAT DRAW THEM.
//
// The list itself lives in `shared/codex-modes.mjs`, because main/ needs it too
// and a second copy is how the picker and the run come to disagree. That file
// is plain JavaScript and cannot carry a type, so this is the one place the
// renderer states the shape, in the same spirit as `referenced-files.ts`.
//
// Nothing is redefined here. If a mode is added or renamed in the shared file
// it appears in every picker without an edit; only the union in `types.ts`
// would need to follow, and the test in
// `tests/a-codex-mode-reaches-the-thread.test.mjs` fails loudly if the two
// lists stop matching.
import {
  CODEX_DEFAULT_MODE as SHARED_DEFAULT,
  CODEX_MODES as SHARED_MODES,
  CODEX_MODE_ORDER as SHARED_ORDER,
} from '../../shared/codex-modes.mjs';
import type { CodexModeId } from './types';

/** What one mode is: the label she reads and the sentence under the picker. */
export interface CodexModeRow {
  label: string;
  what: string;
  sandbox: string;
  approvalPolicy: string;
}

export const CODEX_MODES = SHARED_MODES as Record<CodexModeId, CodexModeRow>;
export const CODEX_MODE_ORDER = SHARED_ORDER as CodexModeId[];
export const CODEX_DEFAULT_MODE = SHARED_DEFAULT as CodexModeId;
