// Types for shared/feedback.mjs, which is plain ESM so the Feedback card and
// the main process read one copy of the limits.

export const FEEDBACK_LIMITS: Readonly<{ text: number; files: number; bytes: number }>;

export function totalBytes(files?: { size?: number }[]): number;

export function checkFeedback(p?: { text?: string; files?: { size?: number }[] }): { ok: true } | { ok: false; reason: string };

export function feedbackPayload(p?: {
  text?: string;
  files?: { name: string; type: string; data: string }[];
  app?: { version?: string; os?: string };
}): { text: string; files: { name: string; type: string; data: string }[]; app: { version: string; os: string } };
