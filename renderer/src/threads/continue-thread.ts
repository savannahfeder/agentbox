// "Continue it yourself" on a teammate's shared thread: when it is offered,
// and what your composer opens with.
import { familyOfName, shownName } from '../../../shared/artifact-marks.mts';

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

/** In the project their thread is in, when you have one of that name: the team's copy first. Else the card asks. */
export function continueStart(brief: ContinueBrief, card: { project: string | null } | null = null, projects: readonly { slug: string; name: string; team?: unknown }[] = []) {
  const named = card?.project ? projects.filter((p) => p.name === card.project) : [];
  const product = (named.find((p) => p.team) ?? named[0])?.slug ?? null;
  return {
    to: 'agent',
    product,
    body: `${brief.body}\n\n`,
    attachments: brief.files.map((f) => ({ ...f, image: /\.(png|jpe?g|gif|webp)$/i.test(f.name) })),
    continueFrom: brief.from,
    ...(product ? {} : { chooseProject: true as const }),
  };
}

type Carried = { name: string; srcPath: string; image: boolean };

/**
 * `files`: from one file's notes, as found on this computer (a path not found
 * here is only its name). That file goes and no other: the very copy when the
 * brief holds it, else the brief's newest of its family, since the brief gathers
 * only its last messages' attachments. It goes by its own name, as one file has no
 * namesake on the card to be told apart from.
 */
export function carriedForFile(attachments: readonly Carried[], files: readonly string[] | undefined): Carried[] {
  if (!files?.length) return [...attachments];
  const families = new Set(files.map((f) => familyOfName(f)));
  const ofTheFile = attachments.filter((a) => families.has(familyOfName(a.name)));
  const picked = ofTheFile.find((a) => files.includes(a.srcPath)) ?? ofTheFile.at(-1);
  if (picked) return [{ ...picked, name: shownName(picked.name) }];
  return files.filter((f) => f.startsWith('/')).slice(-1).map((f) => ({ name: shownName(f), srcPath: f, image: /\.(png|jpe?g|gif|webp)$/i.test(f) }));
}
