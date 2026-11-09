// Every feature the desktop offers by name, read out of its source, so the
// phone's parity ledger (mobile/parity.mjs) can be held against it.
//
// It reads text rather than importing the components because the lists are
// built inside React (Palette.tsx's useMemo, App.tsx's itemCommands) and only
// exist while the app is drawn. Each source must yield something: a list that
// comes back empty means the code moved, and the check says so rather than
// passing on nothing.
import fs from 'node:fs';
import path from 'node:path';

const between = (text, start, end, file) => {
  const a = text.indexOf(start);
  if (a < 0) throw new Error(`${file}: could not find "${start}"; the parity check needs teaching where the list moved`);
  const b = end ? text.indexOf(end, a + start.length) : text.length;
  if (b < 0) throw new Error(`${file}: could not find the end of the list after "${start}"`);
  return text.slice(a, b);
};

// `id: 'done'` is one feature; `id: \`move-${p.slug}\`` is one family, `move-*`.
function idsIn(block) {
  const out = new Set();
  for (const m of block.matchAll(/\bid:\s*(?:[^,'`]*\?\s*)?'([a-z][\w-]*)'/g)) out.add(m[1]);
  for (const m of block.matchAll(/`([a-z][\w-]*?)-\$\{/g)) out.add(`${m[1]}-*`);
  return out;
}

const SOURCES = [
  {
    kind: 'palette', file: 'renderer/src/components/Palette.tsx',
    block: (t, f) => between(t, 'const commands: Command[] = useMemo(() => [', '], [itemCommands', f),
  },
  {
    kind: 'palette', file: 'renderer/src/palette-rows.ts',
    block: (t, f) => between(t, 'export function pageRows', 'export function rankMatches', f) + between(t, "const light: LookRow", null, f),
  },
  {
    kind: 'thread', file: 'renderer/src/App.tsx',
    block: (t, f) => between(t, 'itemCommands={(() => {', '\n        })()}', f),
  },
  { kind: 'thread', file: 'renderer/src/thread-commands.ts', block: (t, f) => between(t, 'export function threadCommands', null, f) },
  { kind: 'thread', file: 'renderer/src/run-now.ts', block: (t) => t },
  { kind: 'thread', file: 'renderer/src/priority.ts', block: (t, f) => between(t, 'export function priorityCommands', null, f) },
  { kind: 'thread', file: 'renderer/src/thread-model-commands.ts', block: (t, f) => between(t, 'export function modelCommands', null, f) },
];

export const SETTINGS_FILE = 'renderer/src/settings-search.ts';
/** The desktop files the features are read from. */
export const DESKTOP_SOURCES = [...new Set([...SOURCES.map((s) => s.file), SETTINGS_FILE])];

/** Every desktop feature by key: `palette:<id>`, `thread:<id>`,
 *  `settings-page:<id>` and `settings:<page>/<row>`, with the file it is in. */
export function desktopFeatures(root) {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const out = new Map();
  for (const s of SOURCES) {
    const ids = idsIn(s.block(read(s.file), s.file));
    if (!ids.size) throw new Error(`${s.file}: found no commands; the parity check needs teaching where they went`);
    for (const id of ids) if (!out.has(`${s.kind}:${id}`)) out.set(`${s.kind}:${id}`, s.file);
  }
  const settingsFile = SETTINGS_FILE;
  const settings = read(settingsFile);
  const pages = between(settings, 'export const SETTINGS_PAGES', '];', settingsFile);
  const rows = between(settings, 'const ENTRIES: Entry[] = [', '\n];', settingsFile);
  let found = 0;
  for (const m of pages.matchAll(/\{\s*id:\s*'([\w-]+)'/g)) { out.set(`settings-page:${m[1]}`, settingsFile); found++; }
  for (const m of rows.matchAll(/\{\s*page:\s*'([\w-]+)',\s*label:\s*'([^']+)'/g)) { out.set(`settings:${m[1]}/${m[2]}`, settingsFile); found++; }
  if (!found) throw new Error(`${settingsFile}: found no settings; the parity check needs teaching where they went`);
  return out;
}

/** The entries that are not finished: missing outright, or there in part. */
export const toDo = (ledger) => Object.entries(ledger).filter(([, e]) => e.missing || e.still).map(([k]) => k);

/** Every way the ledger and the desktop disagree, as sentences; empty when they agree. */
export function parityProblems(features, ledger, { read, stillToDo }) {
  const out = [];
  for (const [key, file] of features) {
    if (!Object.hasOwn(ledger, key)) out.push(`The desktop has ${key} (${file}) and mobile/parity.mjs does not say where the phone has it, or why it should not.`);
  }
  for (const [key, e] of Object.entries(ledger)) {
    if (!features.has(key)) { out.push(`mobile/parity.mjs names ${key}, which the desktop no longer has. Take it out.`); continue; }
    const shapes = [e.phone ? 'phone' : null, e.desktopOnly ? 'desktopOnly' : null, e.missing ? 'missing' : null].filter(Boolean);
    if (shapes.length !== 1) { out.push(`${key} must be one of phone, desktopOnly or missing, not ${shapes.join(' and ') || 'none'}.`); continue; }
    if (e.desktopOnly && String(e.desktopOnly).trim().length < 10) out.push(`${key} needs a reason the phone should not have it.`);
    if (e.phone) {
      let text = null;
      try { text = read(e.phone); } catch { /* reported below */ }
      if (text == null) out.push(`${key} says the phone has it in ${e.phone}, which does not exist.`);
      else if (!e.find || !text.includes(e.find)) out.push(`${key} says ${e.phone} holds "${e.find}", and it does not. Point it at where the phone has it now, or mark it missing.`);
    }
  }
  const left = toDo(ledger).length;
  if (left > stillToDo) out.push(`${left} desktop features are missing or partial on the phone, more than STILL_TO_DO (${stillToDo}). Put the new one on the phone, or say why it is desktop only.`);
  if (left < stillToDo) out.push(`Only ${left} desktop features are missing or partial on the phone now. Lower STILL_TO_DO in mobile/parity.mjs to ${left}.`);
  return out;
}
