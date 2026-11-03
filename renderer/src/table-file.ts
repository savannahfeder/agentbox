// PURE. A CSV or TSV read into a table: its columns, what each one holds, and
// the colour of every tag. TableView.tsx draws it; nothing here touches a window.

export type ColumnKind = 'name' | 'tag' | 'number' | 'link' | 'email' | 'text';
export type Tone = 'green' | 'blue' | 'purple' | 'amber' | 'rose' | 'teal' | 'grey';
export type Column = { name: string; kind: ColumnKind; tones: Record<string, Tone> };
export type Table = { columns: Column[]; rows: string[][]; logoCol: number };
export type Sort = { col: number; dir: 'asc' | 'desc' } | null;

export const isTablePath = (path: string | null | undefined) => /\.(csv|tsv)$/i.test(String(path ?? '').split(/[?#]/)[0]);

/** RFC 4180, with the separator given: quotes hold commas, doubled quotes and line breaks. */
export function parseDelimited(text: string, sep: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const sepFor = (text: string, path: string) => {
  if (/\.tsv$/i.test(path.split(/[?#]/)[0])) return '\t';
  const nl = text.search(/\r?\n/);
  const head = nl < 0 ? text : text.slice(0, nl);
  return (head.split('\t').length > head.split(',').length) ? '\t' : ',';
};

const URLISH = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const NUMBER = /^[-+]?[$€£]?\s?\d[\d,]*(\.\d+)?\s?(%|k|m|bn|b)?$/i;
// A header that names a choice from a short list.
const TAG_HEADER = /\b(status|stage|category|type|tier|priority|segment|industry|tags?|label|fit|source|plan|state|kind|round|channel|owner|sector|vertical)\b/i;
// A header that names something each row has its own of, even when values repeat.
const TEXT_HEADER = /\b(name|city|location|based|country|address|region|hq|headquarters|title|role|note|notes|description|summary|why|reason|comment|email|phone|website|url|domain|linkedin|date|time)\b/i;

const share = (values: string[], test: (v: string) => boolean) => values.length ? values.filter(test).length / values.length : 0;

function kindOf(name: string, values: string[], first: boolean): ColumnKind {
  if (first) return 'name';
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (!filled.length) return 'text';
  if (share(filled, (v) => EMAIL.test(v)) >= 0.8) return 'email';
  if (share(filled, (v) => URLISH.test(v) && !NUMBER.test(v)) >= 0.8) return 'link';
  if (share(filled, (v) => NUMBER.test(v)) >= 0.9) return 'number';
  const short = filled.every((v) => v.length <= 28 && v.split(/\s+/).length <= 3);
  const distinct = new Set(filled).size;
  if (short && distinct <= 12 && TAG_HEADER.test(name)) return 'tag';
  if (short && distinct <= 12 && !TEXT_HEADER.test(name) && distinct < filled.length && distinct / filled.length <= 0.6) return 'tag';
  return 'text';
}

// The words a pipeline uses keep the colour they mean wherever they appear.
const MEANT: Array<[RegExp, Tone]> = [
  [/^(new|to ?do|not started|none|n\/a|unknown|backlog|idle|cold)$/i, 'grey'],
  [/^(done|won|closed won|meeting|booked|meeting booked|yes|active|live|qualified|hired|signed|customer|paid|approved|shipped|complete|completed|hot)$/i, 'green'],
  [/^(lost|closed lost|no|rejected|blocked|churned|failed|declined|bounced|unsubscribed|disqualified|cancelled|canceled)$/i, 'rose'],
  [/^(contacted|sent|emailed|in progress|doing|reached out|outreach|open|warm)$/i, 'blue'],
  [/^(researching|research|pending|waiting|maybe|on hold|review|in review|follow up|follow-up|later)$/i, 'amber'],
  [/^(replied|interested|responded|engaged|demo|proposal|negotiating|negotiation)$/i, 'purple'],
];
const ROTATION: Tone[] = ['teal', 'blue', 'purple', 'rose', 'amber', 'green', 'grey'];

/** A tag's colour: the one its word means, or the next in turn by its place in the column. */
export function tagTone(value: string, place: number): Tone {
  const v = value.trim();
  for (const [re, tone] of MEANT) if (re.test(v)) return tone;
  return ROTATION[place % ROTATION.length];
}

export function readTable(text: string, path: string): Table {
  const grid = parseDelimited(String(text ?? ''), sepFor(String(text ?? ''), path));
  if (!grid.length) return { columns: [], rows: [], logoCol: -1 };
  const head = grid[0];
  const width = Math.max(head.length, ...grid.slice(1).map((r) => r.length));
  const rows = grid.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  const columns: Column[] = Array.from({ length: width }, (_, i) => {
    const name = (head[i] ?? '').trim() || `Column ${i + 1}`;
    const values = rows.map((r) => r[i]);
    const kind = kindOf(name, values, i === 0);
    const tones: Record<string, Tone> = {};
    if (kind === 'tag') {
      let place = 0;
      for (const v of values.map((x) => x.trim()).filter(Boolean)) if (!(v in tones)) tones[v] = tagTone(v, place++);
    }
    return { name, kind, tones };
  });
  const links = columns.flatMap((c, i) => (c.kind === 'link' ? [i] : []));
  const logoCol = links.find((i) => /website|domain|site|url|homepage/i.test(columns[i].name)) ?? links[0] ?? -1;
  return { columns, rows, logoCol };
}

/** The host a row's logo comes from, or null. */
export function logoFor(table: Table, row: string[]): string | null {
  if (table.logoCol < 0) return null;
  const raw = (row[table.logoCol] ?? '').trim();
  if (!raw || !URLISH.test(raw)) return null;
  const host = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/:?#]/)[0].toLowerCase();
  return host || null;
}

/** A link cell's address, with its scheme. */
export const hrefOf = (value: string) => (/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
/** A link cell as it is read: no scheme, no www, no trailing slash. */
export const shownLink = (value: string) => value.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

const numberOf = (v: string) => {
  const m = v.replace(/[,$€£\s]/g, '').match(/^([-+]?\d+(?:\.\d+)?)(%|k|m|bn|b)?$/i);
  if (!m) return NaN;
  const scale = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 }[(m[2] ?? '').toLowerCase() as 'k'] ?? 1;
  return Number(m[1]) * scale;
};

/** Rows with the words searched for in any cell and, per column, only the tags picked. */
export function filterRows(table: Table, query: string, picked: Record<number, string[]>): string[][] {
  const q = query.trim().toLowerCase();
  const wants = Object.entries(picked).filter(([, v]) => v.length).map(([k, v]) => [Number(k), new Set(v)] as const);
  if (!q && !wants.length) return table.rows;
  return table.rows.filter((r) =>
    (!q || r.some((c) => c.toLowerCase().includes(q))) && wants.every(([i, set]) => set.has(r[i].trim())));
}

export function sortRows(table: Table, rows: string[][], sort: Sort): string[][] {
  if (!sort) return rows;
  const { col, dir } = sort;
  const num = table.columns[col]?.kind === 'number';
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[col] ?? '', y = b[col] ?? '';
    if (!x.trim() !== !y.trim()) return x.trim() ? -1 : 1;
    if (num) return sign * ((numberOf(x) || 0) - (numberOf(y) || 0));
    return sign * x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
  });
}
