// Types for shared/spawn-trouble.mjs, which is plain ESM so that the
// supervisor (Node) and the renderer (Vite) share one copy of every sentence
// this app is allowed to say about a task that could not run.
//
// Only what the renderer imports is declared. The rest of the module is read by
// main and by the tests, which are both plain JS and need nothing here.

export function strandedTitle(count: number): string;
/** Claude Code's words for the server turning requests away, which are not a usage limit. */
export const SERVER_BUSY: RegExp[];
/** The line in a thread where a run stopped, in our words; `raw` is the tool's own refusal. */
export function runStoppedLine(raw: string): string;
/** True when `text` is the app's own word that a run got nowhere. */
export function saysARunGotNowhere(text: string | null | undefined): boolean;
/** What one account's tile says when it cannot run; `dir` is its config folder, for the sign-in command. */
export function accountSentence(cause: string, dir?: string | null): string;
