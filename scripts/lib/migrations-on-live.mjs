// Which migration files the live database is missing, judged by what each one
// makes: functions, tables, columns, policies and triggers. Nothing records
// which files were applied (scripts/apply-migration.mjs sends the SQL as it
// is), so the objects themselves are the record.

const NAME = String.raw`"[^"]+"|\w+`;
const id = (raw) => (raw.startsWith('"') ? raw.slice(1, -1) : raw.toLowerCase());
const inPublic = (schema) => !schema || id(schema) === 'public';

// [regex, (match, add, drop) => void], applied in the order they appear in each file.
const RULES = [
  [new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+(?:(${NAME})\.)?(${NAME})`, 'gi'),
    (m, add) => inPublic(m[1]) && add(`f:${id(m[2])}`)],
  [new RegExp(String.raw`drop\s+function\s+(?:if\s+exists\s+)?(?:(${NAME})\.)?(${NAME})`, 'gi'),
    (m, add, drop) => inPublic(m[1]) && drop(`f:${id(m[2])}`)],
  [new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(${NAME})\.)?(${NAME})`, 'gi'),
    (m, add) => inPublic(m[1]) && add(`t:${id(m[2])}`)],
  [new RegExp(String.raw`drop\s+table\s+(?:if\s+exists\s+)?(?:(${NAME})\.)?(${NAME})`, 'gi'),
    (m, add, drop) => inPublic(m[1]) && (drop(`t:${id(m[2])}`), drop(`c:${id(m[2])}.`, true))],
  [new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:(${NAME})\.)?(${NAME})([^;]*)`, 'gi'),
    (m, add, drop) => {
      if (!inPublic(m[1])) return;
      const table = id(m[2]);
      for (const c of m[3].matchAll(new RegExp(String.raw`\b(add|drop)\s+column\s+(?:if\s+(?:not\s+)?exists\s+)?(${NAME})`, 'gi'))) {
        (c[1].toLowerCase() === 'add' ? add : drop)(`c:${table}.${id(c[2])}`);
      }
    }],
  [new RegExp(String.raw`create\s+policy\s+(${NAME})\s+on\s+(?:(${NAME})\.)?(${NAME})`, 'gi'),
    (m, add) => add(`p:${m[2] ? id(m[2]) : 'public'}.${id(m[3])}.${id(m[1])}`)],
  [new RegExp(String.raw`drop\s+policy\s+(?:if\s+exists\s+)?(${NAME})\s+on\s+(?:(${NAME})\.)?(${NAME})`, 'gi'),
    (m, add, drop) => drop(`p:${m[2] ? id(m[2]) : 'public'}.${id(m[3])}.${id(m[1])}`)],
  [new RegExp(String.raw`create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(${NAME})`, 'gi'),
    (m, add) => add(`g:${id(m[1])}`)],
  [new RegExp(String.raw`drop\s+trigger\s+(?:if\s+exists\s+)?(${NAME})`, 'gi'),
    (m, add, drop) => drop(`g:${id(m[1])}`)],
];

/** Every object the files leave behind, mapped to the file that made it last. Files in the order they run. */
export function whatTheMigrationsMake(files) {
  const objects = new Map();
  for (const { name, sql } of files) {
    const text = sql.replace(/--[^\n]*/g, '');
    const add = (key) => objects.set(key, name);
    const drop = (key, prefix = false) => {
      if (!prefix) { objects.delete(key); return; }
      for (const k of [...objects.keys()]) if (k.startsWith(key)) objects.delete(k);
    };
    const steps = RULES.flatMap(([re, apply]) => [...text.matchAll(re)].map((m) => ({ at: m.index, run: () => apply(m, add, drop) })));
    for (const s of steps.sort((a, b) => a.at - b.at)) s.run();
  }
  return objects;
}

/** The files with something the live database lacks, in the order they run. */
export function missingOnLive(files, liveNames) {
  const live = new Set(liveNames);
  const byFile = new Map();
  for (const [key, file] of whatTheMigrationsMake(files)) {
    if (live.has(key)) continue;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(key);
  }
  return files.filter((f) => byFile.has(f.name)).map((f) => ({ file: f.name, missing: byFile.get(f.name).sort() }));
}

/** One row per object the live database has, named as whatTheMigrationsMake names them. */
export const LIVE_OBJECTS_SQL = `
select 'f:' || proname as n from pg_proc where pronamespace = 'public'::regnamespace
union select 't:' || relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p', 'v', 'm')
union select 'c:' || table_name || '.' || column_name from information_schema.columns where table_schema = 'public'
union select 'p:' || schemaname || '.' || tablename || '.' || policyname from pg_policies
union select 'g:' || tgname from pg_trigger where not tgisinternal`;
