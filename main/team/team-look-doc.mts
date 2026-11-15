// The Team look, from the team's group, as a document in each project, which
// is where agents read (list_documents, read_document). A person's own
// team-look.md, without the mark, is left alone.
import fs from 'node:fs';
import path from 'node:path';
import { Name } from '../../shared/product-name.mjs';
import { TEAM_LOOK } from '../../shared/team-look.mts';

const MARK = `<!-- The Team look from your team's group, kept here by ${Name}. Edit it in the group: edits here are replaced. -->`;

/** Writes each project's copy where it changed. Returns how many it wrote. */
export function writeTeamLookDocs({ products, text }: {
  products: readonly ({ dir?: string | null; team?: { direct?: boolean } | null } | null | undefined)[] | null | undefined;
  text: unknown;
}): number {
  let wrote = 0;
  const doc = `${MARK}\n${String(text ?? '')}`;
  for (const product of products ?? []) {
    if (!product?.dir || product.team?.direct) continue;
    const file = path.join(product.dir, TEAM_LOOK);
    let had: string | null = null;
    try { had = fs.readFileSync(file, 'utf8'); } catch { /* not there yet */ }
    if (had !== null && (!had.startsWith(MARK) || had === doc)) continue;
    fs.writeFileSync(file, doc);
    wrote++;
  }
  return wrote;
}
