// PURE. A CSV or TSV read into a table: its columns, what each one holds, and
// the colour of every tag. TableView.tsx draws it; nothing here touches a window.

export type ColumnKind = 'name' | 'tag' | 'number' | 'date' | 'link' | 'email' | 'text';
export type Tone = 'green' | 'blue' | 'purple' | 'amber' | 'rose' | 'teal' | 'grey';
/** `head` is the header as the file has it; `name` is unique. `values` are a tag column's values as first written; `tones` is keyed by their lower case. */
export type Column = { name: string; head: string; kind: ColumnKind; values: string[]; tones: Record<string, Tone> };
/** `ranked`: the first column is the file's own rank, which stands in for the row number. */
export type Table = { columns: Column[]; rows: string[][]; logoCol: number; ranked: boolean };
export type Sort = { col: number; dir: 'asc' | 'desc' } | null;

export const isTablePath = (path: string | null | undefined) => /\.(csv|tsv)$/i.test(String(path ?? '').split(/[?#]/)[0]);

/** RFC 4180, with the separator given: quotes hold separators, doubled quotes and line breaks. */
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
    // `a, "1,200"`: the space a person types after a separator does not stop a quote opening.
    if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; }
    else if (ch === sep) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

const firstLine = (text: string) => {
  const nl = text.search(/\r?\n/);
  return nl < 0 ? text : text.slice(0, nl);
};

export const sepFor = (text: string, path: string) => {
  if (/\.tsv$/i.test(path.split(/[?#]/)[0])) return '\t';
  // Only separators outside quotes count: `"Company, Inc";Status` is a semicolon file.
  const head = firstLine(text).replace(/"(?:[^"]|"")*"/g, '');
  const counts = [',', '\t', ';'].map((s) => [s, head.split(s).length] as const);
  return counts.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
};

// A markdown table saved under a .csv name: `| a | b |` lines and a `|---|` rule.
export const isMarkdownTable = (text: string) => /^\s*\|.*\|\s*$/.test(firstLine(text.replace(/^﻿/, '')));
function parseMarkdownTable(text: string): string[][] {
  return text.replace(/^﻿/, '').split(/\r?\n/)
    .filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s|:-]+\|\s*$/.test(l))
    // `\|` is a pipe inside a cell, not the edge of one.
    .map((l) => l.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|')));
}

const URLISH = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const NUMBER = /^[-+]?[$€£]?\s?\d[\d,]*(\.\d+)?\s?(%|k|m|bn|b|t|tn)?$/i;
const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
// A cell that says there is nothing here, which a number or date column can hold.
const NOTHING = /^(n\/?a|none|null|nil|tbd|unknown|-|\u2013|\u2014|\?)$/i;
const SOCIAL = /(^|\.)(linkedin\.com|twitter\.com|x\.com|github\.com|facebook\.com|instagram\.com|youtube\.com|crunchbase\.com|angel\.co|wellfound\.com)$/i;

// A header that names a choice from a short list.
const TAG_HEADER = /\b(status|stage|category|type|tier|priority|segment|industry|tags?|label|fit|source|plan|state|kind|round|channel|owner|sector|vertical|risk|level|outcome|result|reply|response|replied|sentiment|intent|verdict|decision)\b/i;
// A header that names something each row has its own of, even when values repeat.
const TEXT_HEADER = /\b(name|company|investor|firm|fund|person|contact|candidate|employer|school|account|city|location|base|based|country|address|region|hq|headquarters|title|role|note|notes|description|summary|why|reason|comment|email|phone|mobile|tel|zip|postal|postcode|id|website|url|domain|linkedin)\b/i;
// A number that is a label, not an amount: never added, sorted or lined up right.
const LABEL_NUMBER = /\b(phone|mobile|tel|zip|postal|postcode|id|year)\b/i;
// "Revenue per year" is an amount, though it names a year.
const AMOUNT_HEADER = /\b(revenue|arr|mrr|amount|price|cost|salary|spend|budget|funding|raised|valuation|per|count|size)\b/i;
const DATE_HEADER = /\b(date|day|when|time|updated|created|last|next|due|deadline|founded)\b/i;

const share = (values: string[], test: (v: string) => boolean) => values.length ? values.filter(test).length / values.length : 0;

// An amount as an agent writes one: "$1.2M", "~$1M", "$250k-$1M" (the low end
// counts), "€80.000" and "1.250.000,50" (the European way). NaN when it is not.
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, mm: 1e6, b: 1e9, bn: 1e9, t: 1e12, tn: 1e12 };
function oneAmount(raw: string): number {
  // "$7B+" is at least $7B.
  let s = raw.trim().replace(/^[~≈+]|^(about|approx\.?|circa|ca\.?)\s*/i, '').replace(/\+$/, '').replace(/[$€£¥\s]/g, '');
  const m = s.match(/^([-+]?[\d.,]+)(%|k|mm|m|bn|b|tn|t)?$/i);
  if (!m) return NaN;
  s = m[1];
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n * (SCALE[(m[2] ?? '').toLowerCase()] ?? 1) : NaN;
}
export function amountOf(v: string): number {
  const s = v.trim();
  if (!/\d/.test(s) || /^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return NaN;
  // A range only where it is plainly money, so 2026-10-01 is not one.
  const range = /[$€£kmbt]/i.test(s) ? s.match(/^(.+?)\s*(?:-|\u2013|\u2014|\bto\b)\s*(.+)$/i) : null;
  if (!range) return oneAmount(s);
  // "$12.4-13.2B": the low end shares the high end's B.
  const scale = range[2].trim().match(/(k|mm|m|bn|b|tn|t)\+?$/i)?.[1] ?? '';
  const low = /[kmbt]\+?$/i.test(range[1].trim()) ? range[1] : `${range[1]}${scale}`;
  return Number.isFinite(oneAmount(low)) ? oneAmount(low) : oneAmount(s);
}

/** When a cell is, in ms, or NaN. A bare number is not a date. */
export function dateOf(v: string): number {
  const s = v.trim();
  if (!s || NUMBER.test(s)) return NaN;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  const us = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? 2000 + +us[3] : +us[3];
    // 25/03/2025 can only be day first; 03/04/2025 is read the American way.
    const [month, day] = +us[1] > 12 ? [+us[2], +us[1]] : [+us[1], +us[2]];
    return Date.UTC(year, month - 1, day);
  }
  if (!MONTH.test(s)) return NaN;
  // "Jan 5" has no year, and Date.parse would put it in 2001.
  const t = Date.parse(/\b\d{4}\b/.test(s) ? s : `${s} ${new Date().getFullYear()}`);
  return Number.isFinite(t) ? t : NaN;
}

function kindOf(name: string, values: string[], first: boolean): ColumnKind {
  if (first) return 'name';
  const filled = values.map((v) => v.trim()).filter((v) => v && !NOTHING.test(v));
  if (!filled.length) return 'text';
  if (share(filled, (v) => EMAIL.test(v)) >= 0.8) return 'email';
  if (share(filled, (v) => URLISH.test(v) && !NUMBER.test(v)) >= 0.8) return 'link';
  if (!(LABEL_NUMBER.test(name) && !AMOUNT_HEADER.test(name)) && share(filled, (v) => NUMBER.test(v) || Number.isFinite(amountOf(v))) >= 0.9) return 'number';
  if (share(filled, (v) => Number.isFinite(dateOf(v))) >= 0.8 && (DATE_HEADER.test(name) || filled.some((v) => MONTH.test(v) || v.includes('/') || /^\d{4}-/.test(v)))) return 'date';
  const short = filled.every((v) => v.length <= 28 && v.split(/\s+/).length <= 4);
  const distinct = new Set(filled.map((v) => v.toLowerCase())).size;
  if (short && distinct <= 30 && TAG_HEADER.test(name)) return 'tag';
  if (short && distinct <= 12 && !TEXT_HEADER.test(name) && distinct < filled.length && distinct / filled.length <= 0.6) return 'tag';
  return 'text';
}

// The words a pipeline uses keep the colour they mean wherever they appear.
const MEANT: Array<[RegExp, Tone]> = [
  [/^(new|to ?do|not started|none|n\/a|unknown|backlog|idle|cold|untouched|not contacted)$/i, 'grey'],
  [/^(done|won|closed won|meeting|booked|meeting booked|meeting set|yes|y|true|active|live|qualified|hired|signed|customer|paid|approved|shipped|complete|completed|hot|good fit|strong fit|great fit|accepted|interviewing|offer|committed|funded|wired|positive|healthy|good|on track)$/i, 'green'],
  [/^(lost|closed lost|no|n|false|rejected|blocked|churned|failed|declined|bounced|unsubscribed|disqualified|cancelled|canceled|not a fit|no fit|poor fit|bad fit|passed|pass|dead|spam|archived|do not contact|dnc|inactive|expired|at risk|critical|severe|off track)$/i, 'rose'],
  [/^(neutral|mixed)$/i, 'grey'],
  [/^(soft circle|soft circled|soft commit|term sheet|diligence|in diligence|due diligence)$/i, 'purple'],
  [/^(contacted|sent|emailed|in progress|doing|reached out|outreach|open|warm|called|messaged|applied|screening)$/i, 'blue'],
  [/^(researching|research|pending|waiting|maybe|on hold|review|in review|follow up|follow-up|later|nurture|nurturing|paused|snoozed|needs review)$/i, 'amber'],
  [/^(replied|interested|responded|engaged|demo|demo booked|proposal|negotiating|negotiation|intro|introduced)$/i, 'purple'],
];
// High and Low mean opposite things under Risk and under Fit.
const BAD_WHEN_HIGH = /\b(risk|churn|severity|urgency|cost|effort|difficulty|blocker)\b/i;
// Under these a yes is the bad news.
const BAD_WHEN_YES = /\b(bounced?|unsubscribed?|churn\w*|risk|blocked|spam|lost|do not contact|dnc|opted out|complain\w*)\b/i;
// Words outside the lists above, read by what they contain, and only in a
// column about how something went: in an Industry column "Non-profit" and
// "Customer Success" are kinds of company, not outcomes. The bad ones are asked
// first, so "not qualified" is not taken for "qualified".
const OUTCOME_HEADER = /\b(status|stage|outcome|result|reply|response|replied|sentiment|intent|verdict|decision|fit|state|health|risk|level|priority|lead|deal|pipeline|progress)\b/i;
const BAD_WORDS = /\b(not|no|never|un(?:qualified|interested|responsive|reachable|subscribed|successful|fit|happy|willing)|wrong|negative|ghost\w*|reject\w*|declin\w*|bounc\w*|churn\w*|lost|lose|dead|cancel\w*|fail\w*|block\w*|spam|bad|weak|poor|pass(?:ed)? on|disqualif\w*|dropped|killed)\b/i;
const LATER_WORDS = /\b(not now|later|next quarter|next year|bad timing|timing|follow.?up|on hold|maybe)\b/i;
const GOOD_WORDS = /\b(won|win|signed|booked|good|strong|great|excellent|qualified|hired|accepted|closed won|converted|success\w*|passed)\b/i;
// A word nothing above knows takes the next of these. Green and red say
// something happened, and teal reads as green beside it, so none of the three.
const ROTATION: Tone[] = ['blue', 'purple', 'amber', 'grey'];

/** A tag's colour: the one its word means, or the next in turn by its place in the column. */
export function tagTone(value: string, place: number, header = ''): Tone {
  const v = value.trim();
  const level = v.match(/^(very high|high|medium|med|mid|low|very low)$/i)?.[1].toLowerCase();
  if (level) {
    const high = level.includes('high'), mid = !high && !level.includes('low');
    if (mid) return 'amber';
    return BAD_WHEN_HIGH.test(header) ? (high ? 'rose' : 'green') : (high ? 'green' : 'grey');
  }
  if (BAD_WHEN_YES.test(header)) {
    if (/^(yes|y|true)$/i.test(v)) return 'rose';
    if (/^(no|n|false)$/i.test(v)) return 'green';
  }
  const plain = v.replace(/[\s_-]+/g, ' ').trim();
  for (const [re, tone] of MEANT) if (re.test(v) || re.test(plain)) return tone;
  if (!header || OUTCOME_HEADER.test(header)) {
    if (LATER_WORDS.test(plain)) return 'amber';
    if (BAD_WORDS.test(plain)) return 'rose';
    if (GOOD_WORDS.test(plain)) return 'green';
  }
  return ROTATION[place % ROTATION.length];
}

export function readTable(text: string, path: string): Table {
  const src = String(text ?? '');
  return tableFromGrid(isMarkdownTable(src) ? parseMarkdownTable(src) : parseDelimited(src, sepFor(src, path)));
}

// "#", "No." or "Rank" over 1, 2, 3: a rank, and the name is the column after it.
const RANK_HEADER = /^(#|no\.?|n°|rank|ranking|position|pos\.?)$/i;

/** A header row and its rows, as a table. A markdown table in a message comes in this way. */
export function tableFromGrid(grid: string[][]): Table {
  if (!grid.length) return { columns: [], rows: [], logoCol: -1, ranked: false };
  const head = grid[0];
  // A loop, not Math.max(...rows): spreading 150,000 rows overflows the stack.
  let width = head.length;
  for (let i = 1; i < grid.length; i++) if (grid[i].length > width) width = grid[i].length;
  let rows = grid.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  // A column with no header and nothing in it is a trailing separator, not data.
  const keep = Array.from({ length: width }, (_, i) => i).filter((i) => (head[i] ?? '').trim() || rows.some((r) => r[i].trim()));
  rows = rows.map((r) => keep.map((i) => r[i]));
  const seen = new Map<string, number>();
  const ranked = keep.length > 1 && RANK_HEADER.test((head[keep[0]] ?? '').trim()) && rows.every((r) => /^\d{1,4}\.?$/.test(r[0].trim()));
  const nameAt = ranked ? 1 : 0;
  const columns: Column[] = keep.map((src, i) => {
    const base = (head[src] ?? '').trim() || `Column ${i + 1}`;
    let name = base;
    // "Email, Email, Email 2" must not end with two columns called Email 2.
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    seen.set(name.toLowerCase(), 1);
    const values = rows.map((r) => r[i]);
    const kind: ColumnKind = ranked && i === 0 ? 'number' : kindOf(name, values, i === nameAt);
    const tones: Record<string, Tone> = {};
    const shown: string[] = [];
    if (kind === 'tag') {
      for (const v of values.map((x) => x.trim()).filter(Boolean)) {
        const key = v.toLowerCase();
        if (key in tones) continue;
        tones[key] = tagTone(v, shown.length, name);
        shown.push(v);
      }
    }
    return { name, head: head[src] ?? '', kind, values: shown, tones };
  });
  return { columns, rows, logoCol: logoColumn(columns, rows), ranked };
}

const hostOf = (raw: string) => raw.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/:?#]/)[0].toLowerCase();

// The column whose sites are each row's own: named for a website, or links that
// are not all one network's profile pages.
function logoColumn(columns: Column[], rows: string[][]): number {
  const links = columns.flatMap((c, i) => (c.kind === 'link' && !/linkedin|twitter|github|crunchbase/i.test(c.name) ? [i] : []));
  const own = (i: number) => {
    const hosts = rows.map((r) => r[i]).filter((v) => URLISH.test(v.trim())).map(hostOf);
    return hosts.length > 0 && share(hosts, (h) => !SOCIAL.test(h)) >= 0.8;
  };
  return links.find((i) => /website|domain|site|homepage/i.test(columns[i].name) && own(i)) ?? links.find(own) ?? -1;
}

/** The host a row's logo comes from, or null. */
export function logoFor(table: Table, row: string[]): string | null {
  if (table.logoCol < 0) return null;
  const raw = (row[table.logoCol] ?? '').trim();
  if (!raw || !URLISH.test(raw)) return null;
  const host = hostOf(raw);
  return host && !SOCIAL.test(host) ? host : null;
}

/** A link cell's address, with its scheme. */
export const hrefOf = (value: string) => (/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
/** A link cell as it is read: no scheme, no www, no trailing slash. */
export const shownLink = (value: string) => value.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

/** Rows with the words searched for in any cell and, per column, only the tags picked. */
// Each row's cells lower-cased once, so a search reads one string a row and
// not every cell again on every letter typed (5,200 rows x 26 columns was a
// second a letter).
const searchText = new WeakMap<string[], string>();
const lowered = (r: string[]) => {
  let s = searchText.get(r);
  if (s === undefined) { s = r.join('\u0001').toLowerCase(); searchText.set(r, s); }
  return s;
};

export function filterRows(table: Table, query: string, picked: Record<number, string[]>): string[][] {
  const q = query.trim().toLowerCase();
  const wants = Object.entries(picked).filter(([, v]) => v.length).map(([k, v]) => [Number(k), new Set(v.map((x) => x.toLowerCase()))] as const);
  if (!q && !wants.length) return table.rows;
  return table.rows.filter((r) =>
    (!q || lowered(r).includes(q)) && wants.every(([i, set]) => set.has(r[i].trim().toLowerCase())));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortRows(table: Table, rows: string[][], sort: Sort): string[][] {
  if (!sort) return rows;
  const { col, dir } = sort;
  const kind = table.columns[col]?.kind;
  const valueOf = kind === 'number' ? amountOf : kind === 'date' ? dateOf : null;
  const sign = dir === 'asc' ? 1 : -1;
  // Each row's key worked out once rather than twice per comparison. Blank, N/A
  // and anything that does not read as the column's kind go last, either way.
  const keyed = rows.map((r) => {
    const v = (r[col] ?? '').trim();
    const n = valueOf && v ? valueOf(v) : NaN;
    const empty = !v || NOTHING.test(v) || (valueOf ? !Number.isFinite(n) : false);
    return { r, v, n, empty };
  });
  keyed.sort((a, b) => {
    if (a.empty || b.empty) return a.empty === b.empty ? 0 : a.empty ? 1 : -1;
    if (valueOf) return sign * (a.n - b.n);
    return sign * collator.compare(a.v, b.v);
  });
  return keyed.map((k) => k.r);
}
