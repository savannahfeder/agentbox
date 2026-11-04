// The words an agent may write for a thread's model and effort, turned into the
// ones a run is started with. A word the CLI does not know would stop the run
// at start, so anything else is refused with the words that work.
import { CLAUDE_MODELS } from './claude-models.generated.mjs';

// A copy of shared/effort-levels.mts: the tool server starts on plain Node,
// which cannot load that file below 22.18. A test holds the two together.
export const EFFORT_LEVELS = Object.freeze([
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra' },
  { id: 'max', label: 'Max' },
]);

const ALIASES = CLAUDE_MODELS.filter((m) => !m.alias.startsWith('claude-')).map((m) => m.alias);

export const MODEL_WORDS = `which model this thread runs on from its next turn. For Claude Code: ${ALIASES.join(', ')} (the newest of each), or a full id such as claude-opus-5-5. For Codex: its model slug, such as gpt-5.6-sol`;
export const EFFORT_WORDS = `how hard this thread thinks from its next turn: ${EFFORT_LEVELS.map((e) => e.id).join(', ')}`;

/** `{ model }` in the CLI's words, or `{ error }`. A label such as "Opus 5.5" is read as its alias. */
export function modelWord(value) {
  const said = String(value ?? '').trim();
  if (!said) return { model: '' };
  const lower = said.toLowerCase();
  const named = CLAUDE_MODELS.find((m) => m.alias === lower || m.id === lower || m.label.toLowerCase() === lower);
  if (named) return { model: named.label.toLowerCase() === lower ? named.alias : lower };
  if (/^claude-[a-z0-9-]+$/.test(lower) || /^(gpt|o\d|codex)[a-z0-9._-]*$/.test(lower) || /^[a-z0-9._-]+\/[a-z0-9._:-]+$/.test(lower)) return { model: lower };
  return { error: `"${said}" is not a model a thread can run on. Use ${ALIASES.join(', ')}, a full id such as claude-opus-5-5, or a Codex model slug.` };
}

/** `{ effort }` in the CLI's words, or `{ error }`. */
export function effortWord(value) {
  const said = String(value ?? '').trim().toLowerCase();
  if (!said) return { effort: '' };
  const named = EFFORT_LEVELS.find((e) => e.id === said || e.label.toLowerCase() === said);
  if (named) return { effort: named.id };
  // Codex's one level above Claude Code's five.
  if (said === 'ultra') return { effort: said };
  return { error: `"${value}" is not an effort level. Use ${EFFORT_LEVELS.map((e) => e.id).join(', ')}.` };
}
