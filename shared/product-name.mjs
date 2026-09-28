// THE ONE PLACE THIS APP IS NAMED. Change the two lines under NAME and every
// screen, every notification, every agent brief and the Dock follow.
//
// She is right about the frequency. This app has been Zero, then Astral, then
// the app, and is agentbox now, and each of the first three renames was a
// hand-run search and replace over about two hundred literals
// (scripts/rename-to-powerup.mjs is the third one, kept as history). A sweep
// cannot be run ahead of time, so between renames the old name sat in the code
// waiting to be missed, and one of them was: the screenshot on her row shows
// "Import into the app?" two names later.
//
// HOW TO RENAME IT NEXT TIME, the whole procedure:
//
//   1. Change NAME below to the new name, spelled exactly as it should read in
//      the MIDDLE of a sentence.
//   2. Add the name it had before to WAS, at the front of the list.
//   3. Run `node scripts/product-name.mjs --write`. That is what carries the
//      name into package.json, which Electron reads before any of our code
//      runs and so cannot import this file.
//
//   Nothing else. `tests/the-app-is-named-in-one-place.test.mjs` fails if step
//   3 is skipped, and it fails if a new literal of the name is typed into the
//   code by hand instead of read from here.
//
// CAPITALISATION IS A RULE HERE, NOT A SPELLING.
//
// So NAME is the mid-sentence spelling and `Name` is that same word with its
// first letter raised. A name that is already an ordinary proper noun, as two
// of the names in WAS are, comes out identical from both, so the rule costs
// nothing when it does not apply, and a lowercase name gets it right without
// anyone having to remember.
// Pick the one the position calls for. Sentence start, a heading, a title, a
// menu item and a button label take `Name`; anywhere else in a sentence takes
// `name`.

/** The name, spelled as it reads in the middle of a sentence. */
export const NAME = 'agentbox';

/**
 * Every name this app has had, newest first. main/main.mjs walks this to find
 *  the data folder an existing install already writes to, because Chromium
 *  names that folder after the app and a rename would otherwise hand her an
 *  empty one and lose her theme, her zoom and her project order. HISTORY IS
 *  NEVER REWRITTEN: add to the front, never edit an entry. */
export const WAS = Object.freeze(['Powerup', 'Astral', 'Zero']);

/** The name at the start of a sentence, in a heading, or on a button. */
export const Name = NAME.charAt(0).toUpperCase() + NAME.slice(1);

/** One name as a slug, so the current one and the old ones are made the same way. */
const slugOf = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The name lowercased throughout, for a slug, a folder or a log prefix.
 *  NOT for anything she reads. */
export const nameSlug = slugOf(NAME);

/**
 * EVERY SLUG THIS APP HAS ANSWERED TO, current first.
 *
 * The same argument as `envNames` below, one layer up. A slug of ours is not
 * only a folder name: it is the name of the MCP server that IS the store, so it
 * is written into a `--allowedTools` grant in her zero.config.json, and into the
 * config of every Codex thread that has ever run. Both of those outlive a
 * rename, and neither is ours to rewrite: the grant is her file, and a thread
 * started last week is a record.
 *
 * So a rename cannot be allowed to mean "the store stops being the store". The
 * places that ask "is this the store server?" ask it through here, the current
 * name wins, and a name we used to have still answers.
 *
 * THIS IS NOT THE OLD `LEGACY_STORE_SERVERS`. That list held another PRODUCT's
 * name, hardcoded, and was deleted for exactly that reason. Nothing is
 * hardcoded here: this is `WAS`, which the app already keeps for its data
 * folder and its env vars, read one more way.
 */
export const WAS_SLUGS = Object.freeze(WAS.map(slugOf));

/** The current slug and every slug it has had, current first. */
export const nameSlugs = Object.freeze([nameSlug, ...WAS_SLUGS]);

/** True when `slug` is this app under its current name or any name it has had. */
export const isOurSlug = (slug) => typeof slug === 'string' && nameSlugs.includes(slug.trim());

/**
 * THE NAME AS AN ENVIRONMENT VARIABLE PREFIX, and every prefix it has had.
 *
 * The app's own env vars carried the name typed out: `ASTRAL_HOME` was still
 * the store root two renames after the app stopped being the app, which is the
 * same leak this whole module exists to close and the one an agent grepping the
 * repo hits first. `envName('HOME')` is what code asks for now.
 *
 * `readEnv` FALLS BACK THROUGH THE OLD NAMES, newest first, for the same reason
 * `WAS` exists at all: a shell, a launchd job or a running process started
 * before the rename still exports the old one, and an app that cannot find its
 * own store root opens empty.
 */
export const ENV_PREFIX = NAME.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
export const WAS_ENV_PREFIXES = Object.freeze(WAS.map((was) => was.toUpperCase().replace(/[^A-Z0-9]+/g, '_')));

/** One env var of ours, by its suffix. `envName('HOME')`. */
export const envName = (suffix) => `${ENV_PREFIX}_${suffix}`;

/** Every spelling of one env var of ours, current name first. */
export const envNames = (suffix) => [ENV_PREFIX, ...WAS_ENV_PREFIXES].map((p) => `${p}_${suffix}`);

/**
 * The value of one env var of ours, under the current name or any name this app
 * has had. Empty and whitespace-only count as unset, because an exported-but-
 * blank variable is how a shell says nothing rather than how it says "".
 */
export function readEnv(suffix, env = process.env) {
  for (const key of envNames(suffix)) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

/**
 * The possessive, because "agentbox's" and "Atlas'" are not the same rule and
 *  a template that hardcodes 's is wrong the day the name ends in one. */
export const possessive = `${NAME}${/s$/i.test(NAME) ? "'" : "'s"}`;

/** The possessive at the start of a sentence. */
export const Possessive = `${Name}${/s$/i.test(NAME) ? "'" : "'s"}`;

/**
 * THE NAME INTO TEXT THAT IS NOT CODE: the agent briefs in `briefs/`, which are
 * markdown files a session reads and, for three of the four, files SHE can edit
 * in Settings. They cannot import anything, so they carry `{{name}}` and
 * `{{Name}}` and this fills them in.
 *
 * FILLED WHERE THE BRIEF IS USED, NOT WHERE IT IS READ FOR EDITING. The editor
 * in Settings reads the same files, and substituting on the way in would show
 * her the filled text and then save it back with the name baked into her own
 * copy, which is the one thing this whole change exists to prevent. So
 * `buildBrief` calls this and the settings editor does not.
 */
export function fillName(text) {
  return String(text ?? '')
    .replaceAll('{{Name}}', Name)
    .replaceAll('{{name}}', NAME);
}
