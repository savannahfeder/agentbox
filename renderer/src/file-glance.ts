/** What a file under a message says at a glance, as plain words: its own
 * title, the first thing it says, and its opening blocks for a miniature page.
 * The card used to print the raw first five lines, `#` marks and all, in a
 * 180px box. */
export type Glance = {title:string|null;line:string|null;blocks:{heading:boolean;text:string}[]};

type Reader = {
  readDoc:(p:{product:string;src:string})=>Promise<{ok:boolean;text?:string}>;
  codeChange:(p:{product:string;src:string})=>Promise<{ok:boolean;change?:unknown}>;
  resolveDoc:(p:{product:string;src:string})=>Promise<{ok:boolean}>;
};

/** Whether a file a message names opens at all, and what it says. `null`
 * means no tile: in w-9ed13d72b3 three bare names from another repository
 * each drew a 200px box saying "Preview unavailable". */
export async function glanceFile(reader:Reader, product:string, path:string):Promise<Glance|null> {
  const kind = kindOf(path);
  try {
    if (kind === 'markdown' || kind === 'html') {
      const r = await reader.readDoc({product, src:path});
      return r.ok ? fileGlance(r.text ?? '', kind) : null;
    }
    if (kind === 'code') {
      const r = await reader.codeChange({product, src:path});
      return r.ok && r.change ? {title:'Code changes', line:null, blocks:[]} : null;
    }
    const r = await reader.resolveDoc({product, src:path});
    return r.ok ? {title:null, line:null, blocks:[]} : null;
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
