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

/** In the project their thread is in, when you have one of that name: the team's copy first. */
export function continueStart(brief: ContinueBrief, card: { project: string | null } | null = null, projects: readonly { slug: string; name: string; team?: unknown }[] = []) {
  const named = card?.project ? projects.filter((p) => p.name === card.project) : [];
  const product = (named.find((p) => p.team) ?? named[0])?.slug ?? null;
  return {
    to: 'agent',
    product,
    body: `${brief.body}\n\n`,
    attachments: brief.files.map((f) => ({ ...f, image: /\.(png|jpe?g|gif|webp)$/i.test(f.name) })),
    continueFrom: brief.from,
  };
}
