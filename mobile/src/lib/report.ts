// A report about one thread, or one chat message, goes through the feedback inbox saying which.
export type ReportAbout = { ref: string; title: string; answer?: string; kind?: 'thread' | 'message' } | null;

const ANSWER_KEPT = 4000;

export function reportText(about: ReportAbout, text: string): string {
  if (!about) return text;
  const message = about.kind === 'message';
  const title = about.title.trim() ? ` ("${about.title.trim()}")` : '';
  const answer = about.answer?.trim() ? `\n\nThe ${message ? 'message' : 'answer'} reported:\n${about.answer.trim().slice(0, ANSWER_KEPT)}` : '';
  return `Report about ${message ? 'a chat message' : 'thread'} ${about.ref}${title}\n\n${text}${answer}`;
}
