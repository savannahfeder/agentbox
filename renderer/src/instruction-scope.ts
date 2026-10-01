// WHO THE INSTRUCTIONS PAGE IS FOR, and what that shows.
//
// The page's heading reads "Instructions for every project" or "Instructions
// for North Sound", and the words after "for" are the switch. The scope is
// EXCLUSIVE: every project shows the three shared sections and a project shows
// only its own file. A page for one project that also listed sections tagged
// as applying everywhere contradicted its own heading.

export const EVERY = 'every';

export type Scope = string;
export type SectionId = 'rules' | 'messages' | 'adhd' | 'project';

interface ProjectLike { slug: string; name: string }

/** The menu under the switch: every project, then each project in her order. */
export function scopeChoices(projects: readonly ProjectLike[]): Array<{ id: Scope; label: string }> {
  return [{ id: EVERY, label: 'Every project' }, ...projects.map((p) => ({ id: p.slug, label: p.name }))];
}

/** A remembered or requested scope, or every project when it names nothing. */
export function resolveScope(scope: Scope | null | undefined, projects: readonly ProjectLike[]): Scope {
  if (!scope || scope === EVERY) return EVERY;
  return projects.some((p) => p.slug === scope) ? scope : EVERY;
}

/** The words the heading ends with, which are also the switch. */
export function scopeWords(scope: Scope, projects: readonly ProjectLike[]): string {
  if (scope === EVERY) return 'every project';
  return projects.find((p) => p.slug === scope)?.name ?? 'every project';
}

export function sectionsFor(scope: Scope): SectionId[] {
  return scope === EVERY ? ['rules', 'messages', 'adhd'] : ['project'];
}

/** An empty section has nothing to read, so it opens as the writing surface. */
export function startsWriting(text: string): boolean {
  return text.trim() === '';
}
