// A rule the person gave for one project, kept where every agent in that
// project reads it: the project's instructions.md (main/supervisor.mts
// `projectInstructions`), read fresh at every spawn.
import fs from 'node:fs';
import path from 'node:path';
import { resolveProduct } from './account.mts';

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

export function addRuleToProduct(product: string, rule: string) {
  const project = resolveProduct(product);
  addProjectRule(project.dir, rule);
  return { product: project.id, added: rule.trim() };
}
