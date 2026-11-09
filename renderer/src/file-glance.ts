import type {CarryState} from '../../shared/carried-files.mts';

/** What a file under a message says at a glance, as plain words: its own
 * title, the first thing it says, and its opening blocks for a miniature page.
 * The card used to print the raw first five lines, `#` marks and all, in a
 * 180px box. */
export type Glance = {title:string|null;line:string|null;blocks:{heading:boolean;text:string}[];coming?:boolean;missing?:boolean;carry?:CarryState;opened?:string};

type Answer = {ok:boolean;coming?:boolean;waits?:boolean;error?:string;carry?:CarryState;opened?:string};
type Reader = {
  readDoc:(p:{product:string;src:string})=>Promise<Answer&{text?:string}>;
  codeChange:(p:{product:string;src:string})=>Promise<{ok:boolean;change?:unknown}>;
  resolveDoc:(p:{product:string;src:string})=>Promise<Answer>;
};

/** Whether a file a message names opens at all, and what it says. `null`
 * means no tile: in w-9ed13d72b3 three bare names from another repository
 * each drew a 200px box saying "Preview unavailable". */
export async function glanceFile(reader:Reader, product:string, path:string):Promise<Glance|null> {
  const kind = kindOf(path);
  try {
    if (kind === 'markdown' || kind === 'html') {
      const r = await reader.readDoc({product, src:path});
      if (r.coming) return {title:null, line:r.error ?? null, blocks:[], coming:true, ...(r.carry ? {carry:r.carry} : {})};
      if (!r.ok) return r.carry ? {title:null, line:r.error ?? null, blocks:[], carry:r.carry, missing:true} : null;
      return {...fileGlance(r.text ?? '', kind), ...(r.carry ? {carry:r.carry} : {})};
    }
    if (kind === 'code') {
      const r = await reader.codeChange({product, src:path});
      return r.ok && r.change ? {title:'Code changes', line:null, blocks:[]} : null;
    }
    const r = await reader.resolveDoc({product, src:path});
    if (r.coming) return {title:null, line:r.error ?? null, blocks:[], coming:true, ...(r.carry ? {carry:r.carry} : {})};
    if (!r.ok) return r.carry ? {title:null, line:r.error ?? null, blocks:[], carry:r.carry, missing:true} : null;
    return {title:null, line:null, blocks:[], ...(r.opened ? {opened:r.opened} : {}), ...(r.carry ? {carry:r.carry} : {})};
  } catch {
    return null;
  }
}

function kindOf(path:string) {
  const clean = path.split(/[?#]/)[0] ?? '';
  return /\.html?$/i.test(clean) ? 'html' : /\.(md|markdown)$/i.test(clean) ? 'markdown' : /\.change$/i.test(clean) ? 'code' : 'other';
}

export function fileGlance(text:string, kind:'markdown'|'html'|string|null = 'markdown'):Glance {
  return kind === 'html' ? htmlGlance(text) : markdownGlance(text);
}

function markdownGlance(text:string):Glance {
  let title:string|null=null, line:string|null=null, inFence=false;
  const blocks:Glance['blocks']=[];
  for (const raw of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {inFence=!inFence;continue;}
    if (inFence) continue;
    const heading=raw.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const words=plain(heading[1] ?? '');
      if (!words) continue;
      if (!title) title=words; else if (blocks.length<6) blocks.push({heading:true,text:words});
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(raw) || /^\s*\|/.test(raw) || /^\s*<!--/.test(raw)) continue;
    const words=plain(raw.replace(/^\s*(?:[-*+]|\d+[.)]|>)\s+/,''));
    if (!words) continue;
    if (!line) line=words;
    if (blocks.length<6) blocks.push({heading:false,text:words});
  }
  return {title,line,blocks};
}

/** A page's own name: its <title>, else its first heading. */
function htmlGlance(text:string):Glance {
  const body=text.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi,'');
  const pick=(re:RegExp)=>{const m=body.match(re);return m ? decode(m[1]!.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim() || null : null;};
  const title=pick(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? pick(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const line=pick(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return {title,line,blocks:[]};
}

function decode(s:string) {
  return s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
}

function plain(s:string) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/(\*\*|__|\*|_|`)(.+?)\1/g,'$2')
    .replace(/\s+/g,' ')
    .trim();
}

/** A link's own label (`[plan.md](reports/plan.md)`) reads as a second, bare name for the same file: one tile for it, not two. */
export const withoutBareTwins = (paths:string[]) => paths.filter(p => (p.includes('/') || !paths.some(q => q !== p && (q.endsWith(`/${p}`) || isCopyOf(q, p)))) && !arrivedAsCopy(p, paths));

// A copy that came across sits in attachments/ under a prefix: `attachments/mw94aqml-7ooz52-rows.csv` is rows.csv.
const isCopyOf = (q:string, name:string) => q.startsWith('attachments/') && q.endsWith(`-${name}`);
// A sender's own full path, when the file itself came across: the copy is the one that opens here.
const arrivedAsCopy = (p:string, paths:string[]) => /^(?:\/|~\/)/.test(p) && paths.some(q => isCopyOf(q, p.split('/').pop() ?? ''));
