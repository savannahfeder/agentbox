// THE ONE LINE THE FIRST TASK ANSWERS WITH.
//
// So the walk's example task still has a real row, a real reading pane and a
// real answer, and the answer is read off the folder she just pointed at
// instead of being reasoned about by a session. The reason is measured and it
// is on the row: her own first task sat queued for thirteen seconds behind the
// directive the walk had just created, ran for another forty-seven, and came
// back in 59.6 seconds while the sentence on screen promised a few. A first
// task that depends on a live agent inherits the queue, the model, the network
// and the size of the folder, and a first run cannot promise anything about any
// of those.
//
// WHAT IT ANSWERS WITH still has to be TRUE, because it is also what goes in
// the sidebar under the project's name.So this never invents a sentence about a
// project. It reads one that is already written down, and when nothing is
// written down it says so.
//
// Pure on purpose: the reading of the disk is in main/first-run.mjs and the
// judgement about what a line is worth is here, where a test can hold it.

/** As long as a sentence in a list row can be before it is a paragraph. */
export const MAX_LINE = 180;

/**
 * Under this a full stop is an abbreviation rather than the end of a thought.
 *  "e.g." and "v1.2" both live below it and no description does. */
const MIN_SENTENCE = 24;

/**
 * A markdown badge line: `[![build](a)](b)`, shields, and nothing else on it.
 *  Readmes open with rows of these and none of them says what the thing is. */
function isBadges(line) {
  const stripped = line.replace(/\[?!\[[^\]]*\]\([^)]*\)\]?\([^)]*\)?/g, '').trim();
  return stripped === '' && /!\[/.test(line);
}

/**
 * A line that is furniture rather than prose.
 *
 *  THE LAST FOUR ARE MEASURED, not imagined. Run over the 29 project folders in
 *  ~/Desktop/dev on 2026-08-21, the first cut of this returned "Run the
 *  application with the following command:" for one project, "To build the
 *  project, run:" for another, a shields.io link definition for a third and
 *  "Built with: Next.js 16 | FastAPI | DeepAgents | ..." for a fourth. Every one
 *  of those is a true line out of a readme and none of them says what the thing
 *  IS, which is the question the task asks. */
function isFurniture(line) {
  if (!line) return true;
  if (line.startsWith('<!--') || line.startsWith('<')) return true; // html comment, or a centred div
  if (/^[-=*_]{3,}$/.test(line)) return true; // a rule
  if (/^[-*+]\s/.test(line) || /^\d+[.)]\s/.test(line)) return true; // a list item is not a description
  if (line.startsWith('```') || line.startsWith('    ')) return true; // code
  if (line.startsWith('|') || line.startsWith('>')) return true; // a table row, a blockquote
  if (isBadges(line)) return true;
  if (/^\[[^\]]+\]:\s/.test(line)) return true; // a link definition at the foot of a readme
  if (line.endsWith(':')) return true; // a lead-in to a command, not a description
  if ((line.match(/\|/g) ?? []).length >= 2) return true; // a stack list, not a sentence
  if (/^(install|usage|getting started|quick ?start|setup|license|contributing)\b/i.test(line)) return true;
  return false;
}

/**
 * Markdown out, words left. Links keep their text, emphasis and code lose
 *  their marks, and a trailing full stop is kept because it is a sentence. */
export function plainText(line) {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * THE FIRST REAL LINE OF A README. The heading at the top is the project's
 *  name, which she already typed on the screen before this one, so it is not
 *  the answer: what is wanted is the first line of prose under it. A readme
 *  with nothing but a heading in it returns null rather than the heading. */
export function fromReadme(text) {
  if (!text) return null;
  let inFence = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (line.startsWith('#')) continue; // the name, and every heading after it
    if (isFurniture(line)) continue;
    const words = plainText(line);
    // Two words is the floor. A one word line is a label, not a description.
    if (words.split(' ').length < 2) continue;
    return clip(words);
  }
  return null;
}

/**
 * package.json says what a thing is in one field, and people fill it in. Same
 *  for Cargo.toml and pyproject.toml, which is why the shape is shared. */
export function fromDescription(value) {
  if (typeof value !== 'string') return null;
  const words = plainText(value);
  return words.split(' ').filter(Boolean).length >= 2 ? clip(words) : null;
}

/**
 * ONE SENTENCE, AND NOT A PARAGRAPH. The FIRST sentence end rather than the
 * last one that fits, which is the opposite of how the inbox row clips: a row
 * wants as much of the message as the width allows, and this wants the
 * description and not the sentence after it.
 *
 *  Only a first sentence long enough to say something counts. Under that, and
 *  when there is no sentence end at all, the cut is at a word with an ellipsis,
 *  because a line that stops mid-word reads as a bug rather than as a summary. */
export function clip(text, max = MAX_LINE) {
  const first = text.search(/[.!?](\s|$)/);
  if (first >= MIN_SENTENCE && first < max) return text.slice(0, first + 1);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > MIN_SENTENCE ? cut.slice(0, space) : cut).replace(/[,;:\s]+$/, '') + '…';
}

/**
 * WHAT THE TASK ANSWERS, given whatever the folder had in it.
 *
 *  `readme` and `description` are what was found on disk, either of them null.
 *  `name` is what she called the project on the screen before, and `folder` is
 *  the short path she chose. The last case is the honest one: a folder with no
 *  readme and no description in it has nothing written down that says what it
 *  is, and saying so is better than guessing, because this same line goes in
 *  the sidebar and stays there. */
export function firstRunAnswer({ readme, description, name, folder }) {
  const found = fromReadme(readme) ?? fromDescription(description);
  if (found) return { line: found, found: true };
  const where = folder ? ` in ${folder}` : '';
  const who = name || 'This project';
  // TWO DIFFERENT TRUE SENTENCES, because they are two different facts and the
  // first cut said the wrong one. Measured over ~/Desktop/dev on 2026-08-21:
  // agentbox-website HAS a readme, and every line in it is a build instruction,
  // so "has no readme" was simply false about her own folder.
  if (readme && String(readme).trim()) {
    return { line: `${who} has a readme${where}, and no line in it says what the project is.`, found: false };
  }
  return {
    line: `${who} has no readme${where}, so there is nothing written down yet that says what it is.`,
    found: false,
  };
}
