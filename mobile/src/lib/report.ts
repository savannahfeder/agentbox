// A report about one thread goes through the feedback inbox, saying which thread.
export type ReportAbout = { ref: string; title: string; answer?: string } | null;

const ANSWER_KEPT = 4000;

export function reportText(about: ReportAbout, text: string): string {
  if (!about) return text;
  const title = about.title.trim() ? ` ("${about.title.trim()}")` : '';
  const answer = about.answer?.trim() ? `\n\nThe answer reported:\n${about.answer.trim().slice(0, ANSWER_KEPT)}` : '';
  return `Report about thread ${about.ref}${title}\n\n${text}${answer}`;
}
