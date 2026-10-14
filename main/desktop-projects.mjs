import {createRequire} from 'node:module';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {checkProjectFolder} from '../shared/project-folder-check.mjs';

// shortcut: the desktop's persisted catalog refreshes after desktop sync; cloud documents are not a local checkout.
export function syncDesktopProjects(root,codexDir,{home}={}){
 try{home=fs.realpathSync(home);}catch{}
 let state={};try{state=JSON.parse(fs.readFileSync(path.join(codexDir,'.codex-global-state.json'),'utf8'));}catch{}
 const rows=[],locals=[];
 let db;try{const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');db=new DatabaseSync(path.join(codexDir,'state_5.sqlite'),{readOnly:true});
  locals.push(...db.prepare('SELECT p.id,p.name,r.path FROM projects p JOIN project_roots r ON r.project_id=p.id').all().map(p=>({...p,rootPaths:[p.path]})));
 }catch{/* older runtimes or catalogs use the persisted desktop state */}finally{db?.close();}
 for(const p of [...locals,...Object.values(state['local-projects']??{})]){
  if(!p||typeof p.name!=='string'||!Array.isArray(p.rootPaths))continue;
  for(const folder of p.rootPaths){
   if(typeof folder!=='string'||!path.isAbsolute(folder))continue;
   try{const real=fs.realpathSync(folder);if(!fs.statSync(real).isDirectory()||!checkProjectFolder(real,{home}).ok||rows.some(p=>p.repoPath===real))continue;
    rows.push({id:`${p.id??folder}:${real}`,name:p.name.trim(),repoPath:real,source:'codex'});
   }catch{/* unavailable roots are not local projects */}
  }
 }
 for(const folder of state['electron-saved-workspace-roots']??[]){
  if(rows.some(p=>p.repoPath===folder)||typeof folder!=='string'||!path.isAbsolute(folder))continue;
  try{const real=fs.realpathSync(folder);if(fs.statSync(real).isDirectory()&&checkProjectFolder(real,{home}).ok)rows.push({id:real,name:state['electron-workspace-root-labels']?.[folder]??path.basename(real),repoPath:real,source:'codex'});}catch{}
 }
 for(const account of Object.values(state['electron-persisted-atom-state']?.['chatgpt-sidebar-state-v1']??{})){
  for(const p of [...(account?.projects??[]),...(account?.pinnedProjects??[]).map(x=>x.project)]){
   if(p&&typeof p.id==='string'&&typeof p.name==='string')rows.push({id:p.id,name:p.name.trim(),source:'chatgpt'});
  }
 }
 fs.mkdirSync(root,{recursive:true});const existing=[];
 for(const name of fs.readdirSync(root)){try{existing.push({dir:path.join(root,name),...JSON.parse(fs.readFileSync(path.join(root,name,'project.json'),'utf8'))});}catch{}}
 for(const row of rows){
  if(!row.name)continue;
  const known=existing.find(p=>(p.externalProject?.id===row.id&&p.externalProject?.source===row.source)||(row.repoPath&&p.externalProject?.source==='codex'&&p.repoPath===row.repoPath));
  if(known){if(known.name!==row.name){const {dir,...project}=known;fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify({...project,name:row.name},null,2));known.name=row.name;}continue;}
  if(row.repoPath&&existing.some(p=>{try{return p.repoPath&&fs.realpathSync(p.repoPath)===row.repoPath;}catch{return false;}}))continue;
  const slug=`desktop-${createHash('sha256').update(`${row.source}:${row.id}`).digest('hex').slice(0,16)}`;const dir=path.join(root,slug);
  if(fs.existsSync(dir))continue;
  fs.mkdirSync(dir);const project={schemaVersion:1,id:slug,name:row.name,seenBy:'private',...(row.repoPath?{repoPath:row.repoPath}: {oneLiner:'ChatGPT · lokaler Arbeitsordner; Cloud-Inhalte werden nicht synchronisiert.'}),externalProject:{id:row.id,source:row.source}};
  fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(project,null,2));existing.push({dir,...project});
 }
}
