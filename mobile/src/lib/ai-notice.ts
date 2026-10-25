// The yes asked before your words go to Claude Code or Codex (App Review
// guideline 5.1.2(i)), kept on this phone with the sign-in.
export const NOTICE_KEY = 'agentbox-ai-notice';
export type Notice = { agreed: number } | { declined: number } | null;

// What carries words you wrote to an agent; the rest acts on threads as they are.
const CARRIES_WORDS = new Set(['reply', 'pick', 'new']);
export const needsNotice = (kind: string) => CARRIES_WORDS.has(kind);

export function readNotice(raw: string | null | undefined): Notice {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (Number.isFinite(v?.agreed)) return { agreed: v.agreed };
    if (Number.isFinite(v?.declined)) return { declined: v.declined };
  } catch { /* nothing kept */ }
  return null;
}
