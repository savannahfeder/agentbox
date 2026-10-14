import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.mjs';
import {Supervisor} from '../main/supervisor.mjs';
it('quick projects get a dated Codex folder without overwriting existing work',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'box-codex-'));const spy=vi.spyOn(os,'homedir').mockReturnValue(home);
 const s=await new Store({accountRoot:path.join(home,'store'),products:[]}).init();
 try{const made=s.createProduct({name:'Test Project',codexFolder:true});const p=s.listProducts().find(p=>p.slug===made.slug);expect(p.repoPath).toMatch(/Documents\/Codex\/\d{4}-\d{2}-\d{2}\/test-project$/);expect(fs.statSync(p.repoPath).isDirectory()).toBe(true);expect(fs.existsSync(path.join(p.repoPath,'.git'))).toBe(true);expect(()=>s.createProduct({name:'Test Project',codexFolder:true})).toThrow();}finally{s.unwatch();spy.mockRestore();fs.rmSync(home,{recursive:true,force:true})}
});
it('projectless threads have separate persistent Codex working directories',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'box-personal-'));const spy=vi.spyOn(os,'homedir').mockReturnValue(home);
 const s=Object.create(Supervisor.prototype);const p={personal:true,dir:path.join(home,'store')};const a={id:'w-abcdef',createdAt:Date.now(),title:'Hello world',labels:['projectless']};
 try{const folder=s.workFolderFor(a,p);expect(folder).toMatch(/Documents\/Codex\/\d{4}-\d{2}-\d{2}\/hello-world-w-abcdef$/);expect(fs.statSync(folder).isDirectory()).toBe(true);expect(s.workFolderFor({...a,title:'Renamed'},p)).toBe(folder);expect(s.workFolderFor({...a,id:'w-123456'},p)).not.toBe(folder);}finally{spy.mockRestore();fs.rmSync(home,{recursive:true,force:true})}
});
