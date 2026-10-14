// The composer had no integration picker; reload the provider's catalog rather
// than keeping a build-time copy, and never offer disabled or inaccessible apps.
import {it,expect,vi} from 'vitest';
import {readComposerCatalog,completionQuery,completionMatches,insertCompletion} from '../shared/composer-catalog.mjs';
it('reloads skills and app pages with provider logos',async()=>{
 const request=vi.fn(async(method,p)=>method==='skills/list'?{data:[{skills:[{name:'design',path:'/fixture/SKILL.md',description:'Design',enabled:true},{name:'off',enabled:false}]}]}:p.cursor?{data:[{id:'other',name:'Other',isAccessible:false}]}:{data:[{id:'mail',name:'Mail',isAccessible:true,isEnabled:true,logoUrl:'https://example.org/logo.png'}],nextCursor:'next'});
 const rows=await readComposerCatalog({request},'/fixture');
 expect(rows.map(r=>r.name)).toEqual(['design','Mail']);expect(rows[1].icon).toBe('https://example.org/logo.png');
 expect(request).toHaveBeenCalledWith('skills/list',{cwds:['/fixture'],forceReload:true});
 expect(request).toHaveBeenCalledWith('app/list',expect.objectContaining({forceRefetch:true,cursor:'next'}));
});
it('completes at the caret without touching trailing text or email addresses',()=>{
 expect(completionQuery('use @ma later',7)).toEqual({start:4,end:7,trigger:'@',query:'ma'});
 expect(completionQuery('me@example.org',6)).toBeNull();expect(completionQuery('/de',3)?.trigger).toBe('/');
 expect(insertCompletion('use @ma later',{start:4,end:7},'[$Mail](app://mail)')).toBe('use [$Mail](app://mail)  later');
 expect(completionMatches([{kind:'app',name:'Mail'},{kind:'skill',name:'design'}],'/','')).toEqual([{kind:'skill',name:'design'}]);
});
it('keeps a working source when the other is unavailable',async()=>{
 const rows=await readComposerCatalog({request:async(m)=>{if(m==='app/list')throw Error('offline');return {data:[{skills:[{name:'test',path:'/fixture/SKILL.md'}]}]};}},'/fixture');expect(rows).toHaveLength(1);
});
it('uses the selected project folder and does not start a worker',async()=>{
 const {Supervisor}=await import('../main/supervisor.mjs');
 const request=vi.fn(async()=>({data:[]}));const fake={config:{},store:{readItem:()=>({id:'task'}),listProducts:()=>[{slug:'project',dir:'/fixture'}]},_engineFor:()=> 'codex',_codexHome:()=>'/fixture',_codexServer:()=>({handshake:Promise.resolve(),client:{request}}),productFolder:p=>p?.dir};
 await Supervisor.prototype.composerCatalog.call(fake,'project','task');
 expect(request).toHaveBeenCalledWith('skills/list',{cwds:['/fixture'],forceReload:true});
});
it('sends a selected app and skill as explicit provider inputs',async()=>{
 const {composerReferences}=await import('../shared/composer-catalog.mjs');
 expect(composerReferences('Use [$Mail](app://mail) and [$design](/fixture/SKILL.md)')).toEqual([{type:'mention',name:'Mail',path:'app://mail'},{type:'skill',name:'design',path:'/fixture/SKILL.md'}]);
 expect(composerReferences('[$bad](https://example.org) [$oops](../../SKILL.md)')).toEqual([]);
});
it('offers installed enabled plugins with their composer logos',async()=>{
 const request=async(m)=>m==='plugin/installed'?{marketplaces:[{plugins:[{name:'sites',id:'sites@market',installed:true,enabled:true,interface:{displayName:'Sites',composerIconUrl:'https://example.org/sites.png'}},{name:'off',installed:true,enabled:false}]}]}:{data:[]};
 const rows=await readComposerCatalog({request},'/fixture');expect(rows).toEqual([expect.objectContaining({kind:'plugin',name:'Sites',icon:'https://example.org/sites.png',insert:'[$Sites](plugin://sites@market)'})]);
});
it('reports a provider outage instead of claiming an empty installed catalog',async()=>{
 await expect(readComposerCatalog({request:async()=>{throw Error('offline');}},'/fixture')).rejects.toThrow('Could not load');
});
it('reads accessible Pages through the connected app without asking a model',async()=>{
 const {readPageReferences}=await import('../shared/composer-catalog.mjs');
 const request=vi.fn(async(_m,p)=>({content:[{type:'text',text:JSON.stringify({items:[{id:'page-one',title:'Planning',access:{can_read:true}}],next_cursor:null})}]}));
 const rows=await readPageReferences({request},'thread');expect(rows[0]).toEqual(expect.objectContaining({kind:'page',name:'Planning'}));
 expect(request).toHaveBeenCalledWith('mcpServer/tool/call',expect.objectContaining({server:'codex_apps',tool:'chatgpt_space.list_pages',threadId:'thread'}));
});
it('lists only browser pages from the already configured local Chrome connection',async()=>{
 const {readBrowserTabs}=await import('../shared/composer-catalog.mjs');
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>[{type:'page',title:'Docs',url:'https://example.org'},{type:'service_worker',url:'chrome-extension://example'}]}));
 expect(await readBrowserTabs({'chrome-devtools':{args:['--port','9222']}},fetcher)).toEqual([expect.objectContaining({kind:'tab',name:'Docs',insert:'[Docs](https://example.org)'})]);
 expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:9222/json/list',expect.any(Object));
 await readBrowserTabs({},fetcher);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('never puts sign-in tokens or credential-bearing URLs into a browser reference',async()=>{
 const {readBrowserTabs}=await import('../shared/composer-catalog.mjs');
 const fetcher=async()=>({ok:true,json:async()=>[{type:'page',url:'https://example.org/#access_token=fixture'},{type:'page',url:'https://example.org/callback?code=fixture&state=fixture'},{type:'page',url:'https://user:demo@example.org'},{type:'page',title:'Inbox',url:'https://example.org/#inbox'}]}); // Deliberately fake credentials on example.org test URL rejection.
 expect((await readBrowserTabs({'chrome-devtools':{args:['--port','9222']}},fetcher)).map(r=>r.name)).toEqual(['Inbox']);
});
it('also discovers integrations before a new chat has an item id',async()=>{
 const {Supervisor}=await import('../main/supervisor.mjs');const request=vi.fn(async()=>({data:[]}));
 const fake={config:{},store:{readItem:()=>null,listProducts:()=>[{slug:'project',dir:'/fixture'}]},_codexHome:()=>null,_codexServer:()=>({handshake:Promise.resolve(),client:{request}}),productFolder:p=>p.dir};
 await Supervisor.prototype.composerCatalog.call(fake,'project','','codex');expect(request).toHaveBeenCalledWith('skills/list',{cwds:['/fixture'],forceReload:true});
});
it('shows available skills when another provider never answers',async()=>{
 vi.useFakeTimers();
 try{
  const request=async m=>m==='skills/list'?{data:[{skills:[{name:'new-skill',path:'/fixture/SKILL.md',enabled:true}]}]}:new Promise(()=>{});
  const result=readComposerCatalog({request},'/fixture');let settled=false;result.then(()=>{settled=true});
  await vi.advanceTimersByTimeAsync(2000);expect(settled).toBe(true);expect(await result).toEqual([expect.objectContaining({name:'new-skill'})]);
 }finally{vi.useRealTimers()}
});
it('keeps the skill picker responsive when optional Pages configuration hangs',async()=>{
 const {Supervisor}=await import('../main/supervisor.mjs');vi.useFakeTimers();
 try{
  const request=async m=>m==='config/read'?new Promise(()=>{}):m==='skills/list'?{data:[{skills:[{name:'fresh',path:'/fixture/SKILL.md'}]}]}:m==='plugin/installed'?{marketplaces:[]}:{data:[]};
  const fake={config:{codexPlugins:true},store:{readItem:()=>({id:'task'}),listProducts:()=>[{slug:'project',dir:'/fixture'}]},_engineFor:()=> 'codex',_codexHome:()=>'/fixture',_codexServer:()=>({handshake:Promise.resolve(),client:{request}}),productFolder:p=>p.dir};
  const result=Supervisor.prototype.composerCatalog.call(fake,'project','task');await vi.advanceTimersByTimeAsync(4000);
  expect(await result).toEqual([expect.objectContaining({name:'fresh'})]);
 }finally{vi.useRealTimers()}
});
