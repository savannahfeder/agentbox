// Types for shared/answers.mjs, which is plain ESM so that main (Node) and the
// renderer (Vite) can share one copy of the rule.

export interface AnsweredItem {
  answer?: string;
  answeredThrough?: number;
  wrote?: Record<string, { ts: number; source: string } | undefined>;
}

export function agentSpokeSince(item: AnsweredItem | null | undefined, since: number): boolean;
export function answerSettled(item: AnsweredItem | null | undefined): boolean;
export function answerTs(item: AnsweredItem | null | undefined): number;
