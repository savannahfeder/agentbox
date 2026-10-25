// Types for shared/cloud-hand-back.mjs, read by the supervisor and the thread.

/** The line a cloud run ends on when its request needs this computer. */
export const HAND_BACK: string;

/** Whether a reply hands its thread back: the marked line, at a line's start. */
export function handsBack(result: string | null | undefined): boolean;
