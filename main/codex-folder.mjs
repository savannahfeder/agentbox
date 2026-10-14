import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
export function codexFolder(name, {at = Date.now(), id} = {}) {
 const date = new Date(at);
 const day = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 const root = path.join(os.homedir(),'Documents','Codex',day);
 const slug = String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || (id ? 'chat' : '');
 if (!slug || (id && !/^w-[a-f0-9]+$/.test(id))) throw Error('Please enter a project name.');
 fs.mkdirSync(root,{recursive:true});
 // A renamed chat keeps its files in the original directory.
 if(id){const existing=fs.readdirSync(root).find(n=>n.endsWith(`-${id}`));if(existing)return path.join(root,existing);}
 const dir=path.join(root,`${slug}${id?`-${id}`:''}`);
 fs.mkdirSync(dir,{recursive:!!id});
 if (!id) {
  const git = args => execFileSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd:dir,stdio:'pipe'});
  git(['init','-q']);
  git(['-c','user.name=Agent','-c','user.email=agent@localhost','commit','--allow-empty','-m','Initialize project']);
 }
 return dir;
}
