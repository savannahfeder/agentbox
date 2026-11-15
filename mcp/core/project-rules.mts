// A rule the person gave for one project, kept where every agent in that
// project reads it: the project's instructions.md (main/supervisor.mts
// `projectInstructions`), read fresh at every spawn.
import fs from 'node:fs';
import path from 'node:path';
import { resolveProduct } from './account.mts';
import { personSaid, threadOfThisRun } from './repeats.mts';

export function addProjectRule(dir: string, rule: string): string {
  const text = String(rule ?? '').trim().replace(/^[-*]\s+/, '');
  if (!text) throw new Error('say the rule in a sentence');
  if (/\n\s*\n/.test(text) || text.length > 600) throw new Error('one rule at a time, in a sentence or two');
  const file = path.join(dir, 'instructions.md');
  let had = '';
  try { had = fs.readFileSync(file, 'utf8'); } catch { had = ''; }
  const kept = had.trimEnd();
  // A rule follows the list it joins, or starts one below what is there.
  const lead = !kept ? '' : kept.split('\n').pop()!.startsWith('- ') ? `${kept}\n` : `${kept}\n\n`;
  fs.writeFileSync(file, `${lead}- ${text.replace(/\s+/g, ' ')}\n`);
  return file;
}

const NOT_AGREED = 'No rule was added: every agent in that project reads it as the person\'s own instruction, so it needs their own words on this thread giving or agreeing to it, quoted exactly in askedBecause. If they did, send it again with their words; if not, ask them.';

// Every agent there reads the rule as the person's, so a run on a thread
// adds one only on their own words there, as a repeating task is made.
export function addRuleToProduct(product: string, rule: string, askedBecause?: unknown, run: { env?: NodeJS.ProcessEnv | Record<string, string | undefined>; now?: number } = {}) {
  const thread = threadOfThisRun(run);
  if (thread !== undefined && !personSaid(thread, askedBecause)) throw new Error(NOT_AGREED);
  const project = resolveProduct(product);
  addProjectRule(project.dir, rule);
  return { product: project.id, added: rule.trim() };
}
