// WHAT BROKE: a thread named create.md, look-build.md and plan.md from another
// repository. None of them could be read here, and each still drew a 200px
// card under the message with an empty box saying "Preview unavailable", which
// is most of a screen of nothing. A file that could be read was no better: the
// card printed its first five raw lines, `# Pricing research` and `## What I
// would do` included. Measured by photographing a thread with three such
// names in the built renderer (w-9ed13d72b3): three cards, ~200px each.
//
// NOW: a file nothing can read gets no tile at all, and a file that can be read
// is a small framed tile with its own title and opening lines as plain words.
import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {fileGlance,glanceFile} from '../renderer/src/file-glance.ts';

const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
const reader=({docs={},changes={},pages={}}={})=>({
  readDoc:async({src})=>src in docs ? {ok:true,text:docs[src]} : {ok:false,error:'not found'},
  codeChange:async({src})=>src in changes ? {ok:true,change:changes[src]} : {ok:false},
  resolveDoc:async({src})=>src in pages ? {ok:true,url:pages[src]} : {ok:false},
});

describe('a file nothing can read gets no tile', ()=>{
  it('is null for the three names from the reported thread', async()=>{
    for (const path of ['create.md','look-build.md','plan.md'])
      expect(await glanceFile(reader(),'agentbox-team',path)).toBeNull();
  });
  it('is null for a page, a change and a picture that do not resolve', async()=>{
    expect(await glanceFile(reader(),'p','designs/w-1/page.html')).toBeNull();
    expect(await glanceFile(reader(),'p','runs/w-1/the-change-it-made.change')).toBeNull();
    expect(await glanceFile(reader(),'p','shots/a.png')).toBeNull();
  });
  it('is null when reading throws rather than answering', async()=>{
    const broken={readDoc:async()=>{throw new Error('bridge gone');},codeChange:async()=>{throw new Error('x');},resolveDoc:async()=>{throw new Error('x');}};
    expect(await glanceFile(broken,'p','notes/a.md')).toBeNull();
  });
  it('is a tile the moment the same name can be read', async()=>{
    const g=await glanceFile(reader({docs:{'plan.md':'# Launch plan\n\nShip it.'}}),'p','plan.md');
    expect(g).toMatchObject({title:'Launch plan',line:'Ship it.'});
  });
  it('is a tile for a picture or a change that resolves', async()=>{
    expect(await glanceFile(reader({pages:{'shots/a.png':'x'}}),'p','shots/a.png')).not.toBeNull();
    expect(await glanceFile(reader({changes:{'c.change':{files:[]}}}),'p','c.change')).toMatchObject({title:'Code changes'});
  });
});

describe('a document reads as words, not as its source', ()=>{
  it('takes the title from the first heading and drops the marks', ()=>{
    const g=fileGlance('# Pricing research\n\nThree charge **per seat**; see [the sheet](x.md).\n\n## What I would do\n\n- Start at $12.');
    expect(g.title).toBe('Pricing research');
    expect(g.line).toBe('Three charge per seat; see the sheet.');
    expect(g.blocks).toEqual([
      {heading:false,text:'Three charge per seat; see the sheet.'},
      {heading:true,text:'What I would do'},
      {heading:false,text:'Start at $12.'},
    ]);
    expect(JSON.stringify(g)).not.toContain('#');
  });
  it('skips code fences, rules and tables', ()=>{
    const g=fileGlance('```\n# not a heading\n```\n---\n| a | b |\nReal words.');
    expect(g.title).toBeNull();
    expect(g.line).toBe('Real words.');
  });
  it('has no line for a file that is only a heading, and nothing for an empty one', ()=>{
    expect(fileGlance('# Only a title')).toEqual({title:'Only a title',line:null,blocks:[]});
    expect(fileGlance('')).toEqual({title:null,line:null,blocks:[]});
  });
  it('stops at six blocks so a long file does not build a long page', ()=>{
    const g=fileGlance('# T\n'+Array.from({length:20},(_,i)=>`line ${i}`).join('\n'));
    expect(g.blocks).toHaveLength(6);
  });
  it('names a design page by its <title>, else its first heading', ()=>{
    expect(fileGlance('<html><head><title>Pricing &amp; plans</title></head><body><h1>Other</h1></body></html>','html').title).toBe('Pricing & plans');
    expect(fileGlance('<body><h1>Simple <b>plans</b></h1><p>For teams.</p></body>','html')).toMatchObject({title:'Simple plans',line:'For teams.'});
    expect(fileGlance('<body><div>no heading</div><script>let t="<h1>x</h1>"</script></body>','html').title).toBeNull();
  });
});

describe('the thread draws the tiles', ()=>{
  it('uses the tiles for every real thread, and draws nothing for a file it could not read', ()=>{
    const focus=read('components/Focus.tsx');
    expect(focus).toContain('<MessageFiles product={product} paths={previewPaths}');
    expect(focus).toContain('inlineArtifacts && !previewSample && <MessageFiles');
    const tiles=read('components/MessageFiles.tsx');
    expect(tiles).toContain('if (!glance) return null;');
    expect(tiles).not.toContain('<span>Preview unavailable</span>');
    expect(tiles).not.toContain('localStorage');
  });
  it('keeps the frame square and its corner marks on the picture, in the line colour', ()=>{
    const css=read('components/message-files.css');
    expect(css).not.toMatch(/border-radius:(?!0)/);
    expect(css).toContain('.message-file .tick {position:absolute;z-index:1;width:8px;height:8px;border:0 solid var(--line-strong);}');
    expect(css).toContain('.message-file .tick.tl {top:0;left:0;');
  });
});
