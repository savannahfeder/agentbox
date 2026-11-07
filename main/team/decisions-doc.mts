// A TEAM'S DECISIONS AS A DOCUMENT IN EACH PROJECT, which is how agents read them:
// a file at the project's root is what list_documents and read_document already
// serve. Only this file's own writing is ever replaced, so a person's own
// decisions.md is left alone.
import fs from 'node:fs';
import path from 'node:path';
import { Name } from '../../shared/product-name.mjs';

const MARK = `<!-- Written by ${Name} from what your team marked. Edits here are replaced. -->`;
const FILE = 'decisions.md';

const on = (rows) => rows.filter((r) => r.on).sort((a, b) => b.at - a.at);
const day = (at) => new Date(at).toISOString().slice(0, 10);
const line = (r, nameOf) => `- ${r.body.trim()} (${nameOf(r.saidBy)}, ${day(r.at)})`;

/** The team's decisions and this project's. `rows` come from the team's own group. */
export function decisionsDoc({ project, teamName, rows, nameOf }) {
  const here = on(rows).filter((r) => !r.project || r.project === project);
  const priority = here.find((r) => r.kind === 'priority');
  const team = here.filter((r) => r.kind === 'decision' && !r.project);
  const own = here.filter((r) => r.kind === 'decision' && r.project);
  return [
    MARK,
    `# Decisions at ${teamName}`,
    ...(priority ? ['', `## This week's priorities (${nameOf(priority.saidBy)}, ${day(priority.at)})`, '', priority.body.trim()] : []),
    ...(own.length ? ['', `## ${project}`, '', ...own.map((r) => line(r, nameOf))] : []),
    ...(team.length ? ['', `## ${teamName}`, '', ...team.map((r) => line(r, nameOf))] : []),
    '',
  ].join('\n');
}

/** Writes each project's document where it changed. Returns how many it wrote. */
export function writeDecisionDocs({ products, teamName, rows, nameOf }) {
  let wrote = 0;
  for (const product of products) {
    if (!product?.dir || product.team?.direct) continue;
    const file = path.join(product.dir, FILE);
    let had = null;
    try { had = fs.readFileSync(file, 'utf8'); } catch { /* not there yet */ }
    if (had === null && !on(rows).length) continue;
    if (had !== null && !had.startsWith(MARK)) continue;
    const next = decisionsDoc({ project: product.name, teamName, rows, nameOf });
    if (next === had) continue;
    fs.writeFileSync(file, next);
    wrote += 1;
  }
  return wrote;
}
