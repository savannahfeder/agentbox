// "Continue it yourself" on a teammate's shared thread: when it is offered,
// and what your composer opens with.

export interface ContinueBrief {
  title: string;
  body: string;
  files: { name: string; srcPath: string }[];
  from: { personId: string; threadId: string };
}

/** Only on someone else's thread whose work reached this copy; a private one never does. */
export function canContinue(work: { shared: boolean } | null, card: { personId: string }, me: string | null): boolean {
  return !!work?.shared && !!me && card.personId !== me;
}

export function continueStart(brief: ContinueBrief) {
  return {
    to: 'agent',
    body: `${brief.body}\n\n`,
    attachments: brief.files.map((f) => ({ ...f, image: /\.(png|jpe?g|gif|webp)$/i.test(f.name) })),
    continueFrom: brief.from,
  };
}
