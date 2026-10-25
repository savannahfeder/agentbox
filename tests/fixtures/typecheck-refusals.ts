// WHAT THE RENDERER'S TYPES MUST STILL REFUSE.
//
// tests/the-renderer-typechecks-clean.test.mjs compiles this file on the
// renderer's own settings and checks that every marked line is STILL an error,
// with the code written beside it. Nothing here is ever imported or run.
//
// Why it exists: all 19 of the errors this guards could have been silenced with
// an `any` or a cast, and both of those pass a clean typecheck while telling
// the next reader nothing. A clean typecheck alone cannot tell the two apart;
// this file can, because an `any` would make these lines compile.
//
// No tsconfig includes this file but the test's own, so its errors never reach
// the renderer's typecheck.
import { unleaked } from '../../shared/agents.mjs';
import { REQUEST_CHANNELS } from '../../shared/bridge-map.mjs';
import { checkKit, runOfClaim } from '../../shared/cloud-kit.mjs';
import { CODEX_DEFAULT_MODE, codexModeWords } from '../../shared/codex-modes.mjs';
import { ALL_SCHEMES, IMG_SCHEME } from '../../shared/schemes.mjs';
import type { AgentEvent } from '../../renderer/src/types';

// THE FOUR SHARED MODULES CARRY REAL TYPES, not an implicit `any`. A string put
// where a number goes is refused rather than waved through, which is the thing
// a missing declaration file stops happening.
export const said: number = unleaked('x'); // TS2322
export const channel: number = REQUEST_CHANNELS.terminal; // TS2322
export const mode: number = CODEX_DEFAULT_MODE; // TS2322
export const words: number = codexModeWords('auto'); // TS2322
export const img: number = IMG_SCHEME; // TS2322
export const every: number = ALL_SCHEMES; // TS2322

// AND SO DOES THE CLOUD KIT, the fifth one, which the screen started importing
// on 2026-10-24 with no declaration beside it. A claim that is not the cloud's
// answers null, and a kit the cloud will not start answers why in words, so
// both of these reads are wrong on purpose: an `any` would let the screen take
// every reply for the cloud's and never say which kit was refused.
export const run: string = runOfClaim('cloud:1'); // TS2322
export const refused: number = checkKit({}); // TS2322

// AND THE EVENT UNION IS STILL A UNION. An event is either a message or a
// thing the agent ran, so reading a message's words off one that has not been
// narrowed must stay an error: that is exactly what the 11 item-thread errors
// were, and widening `AgentEvent` would have made them go away while leaving
// the screen free to draw `undefined` as somebody's reply.
export function wordsOf(event: AgentEvent): string {
  return event.text; // TS2339
}
