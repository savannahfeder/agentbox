// Types for shared/codex-modes.mjs, for the window side.
//
// The three ids are `CodexModeId` in renderer/src/types.ts, which is where that
// union already lives; this file states the shape around them rather than a
// second copy of the list. renderer/src/codex-modes.ts is the screen's own
// narrowed view of the same table and reads these through it.
import type { CodexModeId } from '../renderer/src/types';

/**
 * THE PAIR A MODE REALLY IS. `sandbox` and `approvalPolicy` go straight into
 *  Codex's `thread/start`. NO ROW CARRIES A REVIEWER any more: all three get
 *  the same one and `codexPosture` supplies it, because a per-row value is how
 *  the 2026-10-09 hole stayed open -- two of the three named none, fell through
 *  to a config file, and behaved differently from the one that did. They are
 *  plain strings rather than unions on purpose: the authority for what Codex
 *  accepts is Codex's own schema, quoted in the .mjs, and a union here would be
 *  a third copy of it that nothing checks.
 */
export interface CodexMode {
  label: string;
  sandbox: string;
  approvalPolicy: string;
  what: string;
}

export declare const CODEX_MODE_ORDER: CodexModeId[];
export declare const CODEX_DEFAULT_MODE: CodexModeId;
export declare const CODEX_MODES: Record<CodexModeId, CodexMode>;
export declare const CODEX_MODE_COMMAND: Record<CodexModeId, string>;
export declare const CODEX_MODE_HINT: Record<CodexModeId, string>;
export declare const CODEX_MODE_STATUS: Record<CodexModeId, string>;

export declare const CODEX_REVIEWERS: string[];
export declare const ASKS_THE_PERSON: string;

export declare function isCodexMode(word: unknown): boolean;
/** The reviewer to send, falling back to the one that asks the person. */
export declare function codexReviewer(asked?: string | null): string;
/**
 * The posture, falling back to the default's when the word is not one of ours.
 *  `approvalsReviewer` is ALWAYS present: an absent field lets a Codex home's
 *  own `approvals_reviewer` decide whether a worker may leave its sandbox.
 */
export declare function codexPosture(
  mode: string | null | undefined,
  options?: { reviewer?: string | null },
): {
  sandbox: string;
  approvalPolicy: string;
  approvalsReviewer: string;
};
export declare function codexModeWords(mode: string | null | undefined): string;
/**
 * The rows the menu draws for what has been typed. `null` is the way back to
 *  the project's own setting and is a row like the others.
 */
export declare function codexMenuRowsFor(
  query: string | null,
  set?: unknown,
): (CodexModeId | null)[];
export declare function nextCodexMode(mode: CodexModeId): CodexModeId;
/** The mode a typed `/word ` means, or null when it means nothing. */
export declare function exactCodexMode(word: string | null | undefined): CodexModeId | null;
