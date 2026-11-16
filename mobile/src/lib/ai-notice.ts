// The yes asked before your words go to Claude Code or Codex (App Review
// guideline 5.1.2(i)), kept on this phone with the sign-in, one per account
// that gave it.
export const NOTICE_KEY = 'agentbox-ai-notice';
export type Notice = { agreed: number } | { declined: number } | null;
type Answer = Exclude<Notice, null>;
// `anyone` is an answer kept before answers named an account: it counts until the next sign-out.
export interface KeptNotices { accounts: Record<string, Answer>; anyone: Answer | null }
export const NO_NOTICES: KeptNotices = { accounts: {}, anyone: null };

// What carries words you wrote to an agent; the rest acts on threads as they are.
const CARRIES_WORDS = new Set(['reply', 'pick', 'new', 'approve-filed', 'do-here']);
export const needsNotice = (kind: string) => CARRIES_WORDS.has(kind);

function answerOf(v: unknown): Answer | null {
  const o = v as { agreed?: unknown; declined?: unknown } | null;
  if (Number.isFinite(o?.agreed)) return { agreed: o!.agreed as number };
  if (Number.isFinite(o?.declined)) return { declined: o!.declined as number };
  return null;
}

export function readNotices(raw: string | null | undefined): KeptNotices {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (v?.accounts && typeof v.accounts === 'object') {
      const accounts: Record<string, Answer> = {};
      for (const [id, a] of Object.entries(v.accounts)) { const got = answerOf(a); if (got) accounts[id] = got; }
      return { accounts, anyone: answerOf(v.anyone) };
    }
    // Kept as one answer, before each account had its own.
    const one = answerOf(v);
    if (one && typeof v.by === 'string') return { accounts: { [v.by]: one }, anyone: null };
    if (one) return { accounts: {}, anyone: one };
  } catch { /* nothing kept */ }
  return NO_NOTICES;
}

export function noticeFor(kept: KeptNotices, me: string | null | undefined): Notice {
  if (!me) return null;
  return kept.accounts[me] ?? kept.anyone;
}

export function withAnswer(kept: KeptNotices, me: string | null | undefined, answer: Answer): KeptNotices {
  return me ? { ...kept, accounts: { ...kept.accounts, [me]: answer } } : { ...kept, anyone: answer };
}

export const signedOut = (kept: KeptNotices): KeptNotices => (kept.anyone ? { ...kept, anyone: null } : kept);
