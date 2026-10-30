// READING A FILE NAME AS A NAME, for the three screens that do it: the project
// a folder becomes, the project an import offers, and the agent a file holds.
//
// The short words stay shouted. A folder called `greet-js` is a project called
// "Greet JS", because "Greet Js" is not a thing anybody writes, and an app that
// renames someone's own folder is worse than one that shows the file name raw.
//
// The list only holds words people really do write in capitals. Every word
// added to it is one that can no longer be a word: `go`, `is` and `as` are
// folder names before they are acronyms, and they stay out.
export const SHOUTED = new Set([
  'ai', 'api', 'cdn', 'cli', 'cms', 'crm', 'css', 'db', 'html', 'http', 'ios',
  'js', 'json', 'jsx', 'llm', 'mcp', 'npm', 'php', 'pr', 'qa', 'sdk', 'seo',
  'sql', 'svg', 'ts', 'tsx', 'tv', 'ui', 'ux', 'xml', 'yaml',
]);

/** One word of a name: shouted if it is on the list, otherwise its first
 *  letter up and the rest exactly as written, so `BAR` and `iOS` survive. */
export function nameWord(word) {
  if (!word) return word;
  if (SHOUTED.has(word.toLowerCase())) return word.toUpperCase();
  return word.replace(/^\w/, (c) => c.toUpperCase());
}

/** A file or folder name as a name: `greet-js` reads "Greet JS". */
export function titleFromFileName(name) {
  return String(name ?? '')
    .replace(/[-_.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(nameWord)
    .join(' ');
}
