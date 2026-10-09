// Read the installed provider at use time so installs and removals need no rebuild.
export async function readComposerCatalog(server, cwd) {
 const sources = await Promise.allSettled([
  server.request('plugin/installed',{cwds:[cwd]}).then(r=>r.marketplaces.flatMap(m=>(m.plugins??[]).filter(p=>p.installed&&p.enabled).map(p=>({kind:'plugin',name:p.interface?.displayName??p.name,description:p.interface?.shortDescription??'',insert:`[$${p.interface?.displayName??p.name}](plugin://${p.id})`,icon:p.interface?.composerIconUrl??p.interface?.logoUrlDark??p.interface?.logoUrl??null})))),
  server.request('skills/list',{cwds:[cwd],forceReload:true}).then(r=>r.data.flatMap(d=>(d.skills??[]).filter(s=>s.enabled!==false).map(s=>({kind:'skill',name:s.name,description:s.interface?.shortDescription??s.shortDescription??s.description??'',insert:`[$${s.name}](${s.path})`,icon:s.interface?.iconSmallUrl??s.interface?.iconLargeUrl??null})))),
  (async()=>{const rows=[];let cursor;do{const r=await server.request('app/list',{forceRefetch:true,...(cursor?{cursor}:{})});rows.push(...r.data.filter(a=>a.isAccessible&&a.isEnabled!==false).map(a=>({kind:'app',name:a.name,description:a.description??'',insert:`[$${a.name}](app://${a.id})`,icon:a.logoUrlDark??a.logoUrl??null})));cursor=r.nextCursor;}while(cursor);return rows;})(),
 ]);
 if(sources.every(s=>s.status==='rejected'))throw new Error('Could not load installed Codex integrations.');
 return sources.flatMap(s=>s.status==='fulfilled'?s.value:[]);
}
export function completionQuery(text,caret=text.length) {
 const m=text.slice(0,caret).match(/(?:^|\s)([@/])([^\s@/]*)$/u);
 return m?{start:caret-m[2].length-1,end:caret,trigger:m[1],query:m[2].toLowerCase()}:null;
}
export function completionMatches(rows,trigger,query) {
 return rows.filter(r=>(trigger!=='/'||r.kind==='skill')&&r.name.toLowerCase().includes(query.toLowerCase()));
}
export function insertCompletion(text,range,value){return text.slice(0,range.start)+value+' '+text.slice(range.end);}

// Explicit inputs activate the selected integration instead of asking the model
// to guess from its display name. Ordinary links remain ordinary prose.
export function composerReferences(text) {
 const rows=[];
 for(const m of text.matchAll(/\[\$([^\]\n]+)\]\(([^)\n]+)\)/g)) {
  const [,name,path]=m;
  if(/^(app:\/\/[a-zA-Z0-9_-]+|plugin:\/\/[a-zA-Z0-9_@.+-]+)$/.test(path))rows.push({type:'mention',name,path});
  else if(path.startsWith('/')&&path.endsWith('/SKILL.md'))rows.push({type:'skill',name,path});
 }
 return rows;
}

export async function readPageReferences(server,threadId) {
 const rows=[];let cursor;
 do {
  const result=await server.request('mcpServer/tool/call',{threadId,server:'codex_apps',tool:'chatgpt_space.list_pages',arguments:{limit:100,...(cursor?{cursor}:{})}});
  if(result.isError)throw Error('Could not load ChatGPT Pages.');
  const body=JSON.parse(result.content.find(c=>c.type==='text')?.text??'{}');
  rows.push(...(body.items??[]).filter(p=>p.access?.can_read!==false).map(p=>({kind:'page',name:p.title||'Untitled Page',description:'ChatGPT Page',insert:p.url?`[${p.title||'Page'}](${p.url})`:`Page: ${p.title||'Untitled'} (ID: ${p.page_id??p.id})`,icon:null})));
  cursor=body.next_cursor;
 }while(cursor);
 return rows;
}

export async function readBrowserTabs(mcpServers,fetcher=fetch) {
 const args=mcpServers?.['chrome-devtools']?.args??[];
 const word=args[args.indexOf('--port')+1];
 if(!args.includes('--port')||!/^\d+$/.test(word)||Number(word)<1||Number(word)>65535)return [];
 const response=await fetcher(`http://127.0.0.1:${Number(word)}/json/list`,{signal:AbortSignal.timeout(2000)});
 if(!response.ok)throw Error('Could not read configured Chrome tabs.');
 return (await response.json()).filter(t=>t.type==='page'&&safeTabUrl(t.url)).map(t=>({kind:'tab',name:t.title||t.url,description:'Chrome tab',insert:`[${(t.title||'Tab').replace(/[\[\]\n]/g,' ')}](${t.url})`,icon:null}));
}

function safeTabUrl(value) {
 try {
  const url=new URL(value);
  const privateKey=/^(?:access[_-]?token|refresh[_-]?token|token|code|state|password|secret|api[_-]?key|key)$/i;
  return /^https?:$/.test(url.protocol)&&!url.username&&!url.password
    && ![...url.searchParams.keys(),...new URLSearchParams(url.hash.slice(1)).keys()].some(key=>privateKey.test(key));
 }catch{return false;}
}
