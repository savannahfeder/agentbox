// A report about one thread goes through the feedback inbox, saying which thread.
export type ReportAbout = { ref: string; title: string } | null;

export function reportText(about: ReportAbout, text: string): string {
  if (!about) return text;
  const title = about.title.trim() ? ` ("${about.title.trim()}")` : '';
  return `Report about thread ${about.ref}${title}\n\n${text}`;
}
