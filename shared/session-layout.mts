// How a session Agentbox did not start reads in Agentbox's layout: the ask in
// bold, the agent's own words around it, and its choices, all taken from the
// tool's own message by rules. No model, and nothing reworded.
//
// The rules were measured on real sessions before they were written down here
// (tests/a-session-started-outside-agentbox-reads-in-its-own-words.test.mts).
// The safe failure is "plain": the page then shows the whole message.

export interface ToolQuestion {
  question: string;
  options: string[];
  /** What the agent wrote just before asking, in the same turn. */
  lead?: string;
}

export interface SessionLayout {
  kind: 'asks' | 'plain';
  /** Where the ask came from: the tool's own question, a question in the message, or a statement only the person can act on. */
  from: 'tool' | 'question' | 'statement' | null;
  bold: string | null;
  /** The short question itself, when the sentence leading into it is the bold line. */
  under: string | null;
  /** Further questions the tool asked at the same time. */
  more: string[];
  /** The agent's own words just before the ask, as written. */
  context: string | null;
  /** What follows the ask, when it belongs to it (a command to run). */
  after: string | null;
  choices: string[];
}

interface Item { ordered: boolean; label: boolean; text: string }
interface Block { type: 'p' | 'list' | 'code' | 'heading' | 'quote' | 'table'; raw: string; items: Item[] }

const PLAIN: SessionLayout = { kind: 'plain', from: null, bold: null, under: null, more: [], context: null, after: null, choices: [] };

function blocks(md: string): Block[] {
  const out: Block[] = [];
  let cur: { type: Block['type']; lines: string[]; items: Item[] } | null = null;
  let fence: string | null = null;
  const push = () => { if (cur) out.push({ type: cur.type, raw: cur.lines.join('\n').trim(), items: cur.items }); cur = null; };
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const f = line.match(/^\s*(```+|~~~+)/);
    if (fence && cur) {
      cur.lines.push(line);
      if (f && f[1][0] === fence) { fence = null; push(); }
      continue;
    }
    if (f) { push(); fence = f[1][0]; cur = { type: 'code', lines: [line], items: [] }; continue; }
    if (!line.trim()) { if (cur?.type !== 'list') push(); continue; }
    if (/^#{1,6}\s/.test(line)) { push(); out.push({ type: 'heading', raw: line.trim(), items: [] }); continue; }
    if (/^\s*(\*\*\*+|---+|___+)\s*$/.test(line)) { push(); continue; }
    const kind: Block['type'] | null = /^\s*>/.test(line) ? 'quote' : /^\s*\|/.test(line) ? 'table' : null;
    if (kind) {
      if (cur?.type !== kind) { push(); cur = { type: kind, lines: [], items: [] }; }
      cur.lines.push(line);
      continue;
    }
    const li = line.match(/^(\s*)(?:(\d+)[.)]|[-*•])\s+(.*)$/);
    if (li) {
      if (cur?.type !== 'list') { push(); cur = { type: 'list', lines: [], items: [] }; }
      cur.lines.push(line);
      const text = li[3].trim();
      if (li[1].length >= 2 && cur.items.length) continue;
      cur.items.push({ ordered: !!li[2], label: /^(?:\*\*|\[|_)*\s*(?:[A-F]|\d)\b\s*(?:\*\*)?\s*[\u2014\u2013:).-]/.test(text), text });
      continue;
    }
    if (cur?.type === 'list' && /^\s{2,}\S/.test(line)) { cur.lines.push(line); continue; }
    if (cur?.type === 'list') push();
    if (cur?.type !== 'p') { push(); cur = { type: 'p', lines: [], items: [] }; }
    cur.lines.push(line);
  }
  push();
  return out.filter((b) => b.raw);
}

/** The words without markdown, for matching and for the bold line. */
export function plain(s: string): string {
  return s.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
}

const HOLD = '\u0001';
/** Sentences of one paragraph, as written. "e.g.", "v2.1" and file names stay inside their sentence. */
function sentences(s: string): string[] {
  const t = s.replace(/\s+/g, ' ')
    .replace(/\b(e\.g|i\.e|vs|etc|approx|no)\.(?=\s|,|\))/gi, (m) => m.replace(/\./g, HOLD))
    .replace(/(\w)\.(\w)/g, `$1${HOLD}$2`);
  const out: string[] = [];
  let cur = '';
  for (const w of t.split(' ')) {
    if (!w) continue;
    cur += (cur ? ' ' : '') + w;
    // "1." opening a sentence is a list number; "out of 10." ends one.
    if (/[.!?:]["”’')\]*_`]*$/.test(w) && !(cur === w && /^\d+[.)]$/.test(w))) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out.map((x) => x.split(HOLD).join('.').trim()).filter(Boolean);
}

const ASKING = /^(?:(?:so|then|and|or|otherwise|now|also|separately|finally|for now)[,:]?\s+)?(?:want|should|shall|may|can|could|would|do|does this|did|are you|is (?:it|this|that) (?:ok|okay|fine|right|good|alright)|is there|which|what(?:'s| is| would| do| should| can| did| happened)?\b|how (?:would|should|do|did)|ready|ok(?:ay)? to|any (?:preference|thoughts|objection)|where|when|who|anything)\b/i;
const ADDRESSED = /\b(you|your|I|me|my|we|us|happened)\b/i;

function isQuestion(raw: string): boolean {
  const s = plain(raw);
  if (!/\?["”’')\]*]*$/.test(s)) return false;
  if (ASKING.test(s) && (ADDRESSED.test(s) || /^which\b/i.test(s))) return true;
  const colon = s.lastIndexOf(': ');
  if (colon < 0) return false;
  const tail = s.slice(colon + 2);
  return ASKING.test(tail) && /\b(I|me|we|you want|you prefer)\b/.test(tail);
}

/**
 * A sentence only the person can act on. "Let me know if…" is politeness, not
 * an ask. "Please…" counts only where the paragraph speaks to her: an agent
 * asked for an error message answers "Please try again." (two power testers).
 */
function isStatementAsk(raw: string, paragraph = raw): boolean {
  const s = plain(raw);
  if (/\b(let me know|tell me) if\b/i.test(s)) return false;
  return (/^please\s+(?!note|bear)/i.test(s) && /\b(you|your|I|I['’]ll|me|my|we)\b/i.test(plain(paragraph)))
    || /(?:^|[,;.:\u2014\u2013]\s*|\b(?:so|just|and|then|or)\s+)say\s+(?:["“'‘`*]|yes\b|go\b|when\b|the word\b)/i.test(s)
    || /^tell me (?:which|what|how|when|whether)\b/i.test(s)
    || /^(?:once|when|after) you(?:['’]ve| have)? (?:approve|confirm|choose|pick|decide|created|reconnected|restarted|signed)/i.test(s)
    || /\b(?:then|and) (?:tell|ping|message) me\b/i.test(s)
    || /\btell me and I['’]ll\b/i.test(s)
    || /\bI (?:just )?need (?:your|you to|one \w+ from you)\b/i.test(s)
    || /\b(?:run|paste) (?:this|it|the following)\b.*\b(?:terminal|shell)\b/i.test(s);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const join = (xs: string[]) => xs.join(' ').trim() || null;
/** A lead-in like "I can either:" says nothing once its list is drawn as choices. */
const dropLeadIn = (xs: string[]) => (xs.length && /:["”’')\]*_]*$/.test(xs[xs.length - 1]) ? xs.slice(0, -1) : xs);

export function sessionLayout(message: string, questions: ToolQuestion[] = []): SessionLayout {
  const bs = blocks(message ?? '');
  const asked = questions.filter((q) => plain(q.question ?? ''));
  if (asked.length) {
    // The message may be from an earlier turn; only words from the asking turn lead into the question.
    const lead = asked[0].lead?.trim() ? [...blocks(asked[0].lead)].reverse().find((b) => b.type === 'p')?.raw ?? null : null;
    return {
      ...PLAIN, kind: 'asks', from: 'tool',
      bold: plain(asked[0].question), more: asked.slice(1).map((q) => plain(q.question)),
      context: lead, choices: (asked[0].options ?? []).filter((o) => o && o.trim()),
    };
  }

  const n = bs.length;
  type Hit = { i: number; k: number; ss: string[]; from: 'question' | 'statement' };
  let hit: Hit | null = null;
  const look = (test: (s: string, paragraph: string) => boolean, from: Hit['from'], first: number) => {
    for (let i = n - 1; i >= first && !hit; i--) {
      if (bs[i].type !== 'p') continue;
      const ss = sentences(bs[i].raw);
      for (let k = ss.length - 1; k >= 0 && !hit; k--) if (test(ss[k], bs[i].raw)) hit = { i, k, ss, from };
    }
  };
  const tail = Math.max(0, n - 4);
  look(isQuestion, 'question', tail);
  if (!hit) look(isStatementAsk, 'statement', tail);
  if (!hit && n > 4 && bs[0].type === 'p') {
    const ss = sentences(bs[0].raw);
    const k = ss.findIndex((s) => isStatementAsk(s, bs[0].raw));
    if (k >= 0) hit = { i: 0, k, ss, from: 'statement' };
  }
  if (!hit) return PLAIN;
  const { i, k, ss, from } = hit as Hit;
  const said = ss[k];

  // Choices: the list right after a question that asks between things, or the
  // nearest labelled list just before a "which…" question.
  const fits = (b: Block | undefined): b is Block => !!b && b.type === 'list' && b.items.length >= 2 && b.items.length <= 6 && b.items.every((x) => plain(x.text).length <= 220);
  let listAt = -1;
  if (from === 'question') {
    const next = bs[i + 1];
    if (k === ss.length - 1 && fits(next) && next.items.every((x) => x.ordered)) listAt = i + 1;
    else if (/\b(which|pick|choose|prefer)\b/i.test(said)) {
      for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
        const b = bs[j];
        if (fits(b) && (b.items.every((x) => x.ordered) || b.items.every((x) => x.label))) { listAt = j; break; }
      }
    }
  }
  const choices = listAt >= 0 ? bs[listAt].items.map((x) => x.text) : [];

  let bold = plain(said);
  let under: string | null = null;
  let context: string | null = join(ss.slice(0, k));
  const bare = words(plain(said)) <= 5;
  const leadBlock = listAt >= 0 && listAt < i ? bs[listAt - 1] : listAt > i ? null : undefined;
  if (bare && listAt >= 0 && listAt < i && leadBlock?.type === 'p' && k === 0) {
    const lead = dropLeadIn(sentences(leadBlock.raw));
    if (lead.length) { bold = plain(lead[0]); under = plain(said); context = join(lead.slice(1)); }
  } else if (bare && listAt > i && k > 0) {
    const lead = dropLeadIn(ss.slice(0, k));
    if (lead.length) { bold = plain(lead[0]); under = plain(said); context = join(lead.slice(1)); }
  } else if (bare && k > 0) {
    bold = plain(ss[k - 1]); under = plain(said); context = join(ss.slice(0, k - 1));
  }
  if (!context && !under) {
    const before = bs[(listAt >= 0 && listAt < i ? listAt : i) - 1];
    if (before && (before.type === 'p' || before.type === 'list' || before.type === 'code')) context = before.raw;
  }
  if (context && listAt >= 0 && listAt < i && context === bs[listAt].raw) context = null;

  // What follows the ask is kept when it is short or the ask points at it ("run this:").
  const rest = [join(ss.slice(k + 1)), ...bs.slice(i + 1).filter((_, j) => i + 1 + j !== listAt).map((b) => b.raw)].filter(Boolean) as string[];
  const restText = rest.join('\n\n');
  const after = rest.length && (/:["”’')\]*_]*$/.test(plain(said)) || (rest.length <= 2 && restText.length <= 400)) ? restText : null;

  return { kind: 'asks', from, bold, under, more: [], context, after, choices };
}

/** What the page draws for a layout: the bold ask, then the agent's own words, choices left to the strip. */
export function layoutMarkdown(l: SessionLayout, message: string): string {
  if (l.kind === 'plain' || !l.bold) return message;
  return [`**${l.bold}**`, l.under, ...l.more, l.context, l.after].filter(Boolean).join('\n\n');
}

/** The person's own words out of what the tool recorded as their message. */
export function theirWords(raw: string | null | undefined): string {
  let s = String(raw ?? '');
  const at = s.lastIndexOf('## My request:');
  if (at >= 0) s = s.slice(at + '## My request:'.length);
  const reply = s.match(/<send_user_message_question_reply>\s*(\[[\s\S]*?\])\s*(?:<\/send_user_message_question_reply>|$)/);
  if (reply) {
    try {
      const answers: unknown = JSON.parse(reply[1]);
      s = (Array.isArray(answers) ? answers : []).map((x) => {
        const a = x as { answer?: unknown; answers?: unknown; selected?: unknown };
        return ([] as unknown[]).concat(a.answer ?? a.answers ?? a.selected ?? []).map(String).join(', ');
      }).filter(Boolean).join('; ');
    } catch { s = ''; }
  }
  return s.replace(/<([a-z_-]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g, ' ')
    .replace(/# Files mentioned by the user:[\s\S]*?(?=\n\n[^#\n]|$)/, ' ')
    .replace(/\[Image #\d+\]/g, ' ').replace(/&#x20;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
