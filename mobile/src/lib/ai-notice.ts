// The yes asked before your words go to Claude Code or Codex (App Review
// guideline 5.1.2(i)), kept on this phone with the sign-in, for the account
// that gave it.
export const NOTICE_KEY = 'agentbox-ai-notice';
type By = { by?: string };
export type Notice = ({ agreed: number } & By) | ({ declined: number } & By) | null;

// What carries words you wrote to an agent; the rest acts on threads as they are.
const CARRIES_WORDS = new Set(['reply', 'pick', 'new', 'approve-filed', 'do-here']);
export const needsNotice = (kind: string) => CARRIES_WORDS.has(kind);

export function readNotice(raw: string | null | undefined): Notice {
  try {
    const v = JSON.parse(raw ?? 'null');
    const by = typeof v?.by === 'string' ? { by: v.by } : {};
    if (Number.isFinite(v?.agreed)) return { agreed: v.agreed, ...by };
    if (Number.isFinite(v?.declined)) return { declined: v.declined, ...by };
  } catch { /* nothing kept */ }
  return null;
}

// A yes kept before answers named an account counts until the next sign-out.
export function noticeFor(notice: Notice, me: string | null | undefined): Notice {
  if (!notice || !me) return null;
  return !notice.by || notice.by === me ? notice : null;
}
