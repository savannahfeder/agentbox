// THE CLAUDE AND CODEX MARKS, so an account says at a glance which it is
// (2026-10-14: "I don't know what the C and the X are ... You probably need
// logos"). Shapes from the Lobe Icons set (MIT); the marks themselves are
// Anthropic's and OpenAI's, used only to name which kind of account a row
// is, the way a sign-in button names its provider.
import { AgentFace } from './AgentFace';
import { CLAUDE_MARK as CLAUDE, CODEX_MARK as CODEX, OPENAI_MARK as OPENAI } from '../engine-marks';
import './harness-mark.css';

export function EngineLogo({ engine, size = 18 }: { engine: 'claude' | 'codex'; size?: number }) {
  return engine === 'codex'
    ? <svg className="engine-logo codex" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true"><path clipRule="evenodd" d={CODEX} /></svg>
    : <svg className="engine-logo claude" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="#D97757" d={CLAUDE} /></svg>;
}

// The svg fills the tile's 16px inside and its viewBox holds the margin round
// the 11px mark. An 11px svg sat 2.5px in, which Chromium rounds to 3: half a
// pixel right of centre and half a pixel low.
const MARGIN = (24 * 16 / 11 - 24) / 2;
const IN_TILE = `${-MARGIN} ${-MARGIN} ${24 + 2 * MARGIN} ${24 + 2 * MARGIN}`;

/** The harness a thread of yours runs on, as its maker's mark in a small tile; the agent face for one with no mark. */
export function HarnessMark({ engine }: { engine: string }) {
  if (engine !== 'claude' && engine !== 'codex') return <AgentFace />;
  return <span className={`harness-mark ${engine}`} aria-hidden="true">
    <svg viewBox={IN_TILE}>{engine === 'codex' ? <path fillRule="evenodd" d={OPENAI} /> : <path d={CLAUDE} />}</svg>
  </span>;
}
