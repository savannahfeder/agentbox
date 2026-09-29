// A fixed allowlist exposes the instruction files, never arbitrary paths.
// Defaults are shipped separately so an edited live file can always be reset.
//
// THERE ARE THREE OF THEM NOW, NOT FOUR (w-3dc46f3a67). Five editable layers of
// prompts was too many for a person to manage, so some were merged.
//
// A person opening that page is answering two questions, what should agents do
// and how should they talk to me, so the writing rules and the finishing rules
// became ONE document: `message-rules.md`, "How agents write to you". In
// practice a rules file is mostly about how agents write to the person rather
// than what they do, which is why the two were one thing all along.
// `joinMessageRules` below carries the two old files into the new one.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Every line this file prints is prefixed with the app's own name, read from the
// one place that holds it. Typing it here is what left three dead names in the
// code through two renames (tests/the-app-is-named-in-one-place).
import {nameSlug} from '../shared/product-name.mjs';
// ADHD MODE IS A FOURTH FILE, NOT A PARAGRAPH INSIDE THE THIRD (w-5737fe67cf).
// Its text is appended to the instructions while the mode is on and removed when
// it is off. Kept in its own file so edits to it never mix with the user's own
// rules, and survive while the mode is off. Whether it is on lives in the
// config (`adhdMode`).
const files = {rules:'founder.md',messages:'message-rules.md',adhd:'adhd-mode.md',system:'worker.md'};
// The two names the joined document replaced, read only by the migration.
const WAS_MESSAGES = ['writing-rules.md','finishing.md'];
const defaults = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../shared/instruction-defaults.json',import.meta.url)),'utf8'));
function fileFor(id) {
 if (!Object.hasOwn(files,id)) throw new Error('Unknown instruction section');
 return files[id];
}
export function readInstruction(appDir,id,shippedDir=appDir) {
 const file=fileFor(id);
 const defaultText=id==='rules' ? '' : defaults[id];
 let text=defaultText;
 try {text=fs.readFileSync(path.join(appDir,'briefs',file),'utf8');} catch(e) {if(e.code!=='ENOENT') throw e; if(id==='system') text=readSystemTemplate(shippedDir,appDir);}
 return {text,defaultText};
}
/**
 * RESTORE POINTS, BECAUSE A SAVE USED TO BE THE END OF THE OLD TEXT
 * (w-94b3af4e70).
 *
 * Why the page needs this at all: a user can edit the agent instructions, lose
 * something that mattered, and want an earlier version back.
 *
 * Until this, the only thing the page could hand back was our shipped text, so
 * recovering meant throwing away everything the user had written to get the
 * default. The box saves 400ms after a keystroke, straight over
 * the file, so a paragraph deleted at noon was gone at noon.
 *
 * WHAT COUNTS AS A VERSION: the text that was in the file before a save, kept
 * under the time that text was itself saved, so the list reads as the versions
 * the user wrote rather than as a log of keystrokes. A burst of typing is one
 * version and not two hundred, because text that has been sitting untouched for
 * less than QUIET_MS is still being written and is not a place to come back to.
 *
 * It never throws into a save. Losing a restore point is a small thing and
 * failing to write what the user just typed is not.
 */
const HISTORY='instruction-history';
const KEEP=20;
const QUIET_MS=10*60*1000;
function historyDir(appDir,id) {return path.join(appDir,HISTORY,id);}
export function listVersions(appDir,id) {
 fileFor(id);
 const dir=historyDir(appDir,id);
 let names;
 try {names=fs.readdirSync(dir);} catch(e) {if(e.code!=='ENOENT') throw e; return [];}
 return names.filter(n=>n.endsWith('.md')).map(n=>{
  const ts=Number(n.slice(0,-3));
  if(!Number.isFinite(ts)) return null;
  try {return {ts,chars:fs.readFileSync(path.join(dir,n),'utf8').length};} catch {return null;}
 }).filter(Boolean).sort((a,b)=>b.ts-a.ts);
}
export function readVersion(appDir,id,ts) {
 fileFor(id);
 const at=Number(ts);
 if(!Number.isFinite(at)) throw new Error('Unknown version');
 return {text:fs.readFileSync(path.join(historyDir(appDir,id),`${at}.md`),'utf8')};
}
function keepVersion(appDir,id,now=Date.now()) {
 try {
  const live=path.join(appDir,'briefs',fileFor(id));
  let stat,text;
  try {stat=fs.statSync(live); text=fs.readFileSync(live,'utf8');}
  catch(e) {if(e.code!=='ENOENT') throw e; return;}
  if(now-stat.mtimeMs<QUIET_MS) return;
  const ts=Math.floor(stat.mtimeMs);
  const have=listVersions(appDir,id);
  if(have.some(v=>v.ts===ts)) return;
  if(have.length && readVersion(appDir,id,have[0].ts).text===text) return;
  const dir=historyDir(appDir,id);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,`${ts}.md`),text,'utf8');
  for(const old of [{ts},...have].sort((a,b)=>b.ts-a.ts).slice(KEEP)) fs.rmSync(path.join(dir,`${old.ts}.md`),{force:true});
 } catch(e) {console.warn(`${nameSlug}: could not keep a restore point for ${id}: ${e.message}`);}
}
export function writeInstruction(appDir,id,text,now=Date.now()) {
 const file=fileFor(id);
 if(typeof text!=='string') throw new Error('Instructions must be text');
 keepVersion(appDir,id,now);
 const target=path.join(appDir,'briefs',file);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 const temporary=`${target}.tmp-${process.pid}`;
 fs.writeFileSync(temporary,text,'utf8');
 fs.renameSync(temporary,target);
 return {ok:true};
}

// Installed bundles are read-only. User templates shadow the shipped brief.
export function readSystemTemplate(appDir,dataDir=appDir) {
 for(const root of new Set([dataDir,appDir])) {
  try {return fs.readFileSync(path.join(root,'briefs','worker.md'),'utf8');}
  catch(e) {if(e.code!=='ENOENT') throw e;}
 }
 return defaults.system;
}

/**
 * THE USER'S OWN WRITING, CARRIED OUT OF THE CHECKOUT ONCE (w-3dc46f3a67).
 *
 * Until this ran, the four boxes in Settings read and wrote `dataDir/briefs`,
 * and running from source `dataDir` is the git checkout the whole fleet works
 * in. So the user's rules were being kept in the one folder every worker is
 * allowed to `git checkout`, and agents had been committing to them.
 *
 * WHAT MOVES IS ONLY WHAT THE USER WROTE, and the test for that is the shipped
 * default. A file whose text IS the default is our file sitting where we put
 * it, and copying it into the user's folder would freeze it there: the next
 * release's worker brief would never reach them, because the "edit" would
 * shadow it forever. So a file is carried across only when it differs from the
 * default, which is typically founder.md and writing-rules.md and neither of the
 * two we ship. Those two are the same pair package.json keeps out of the download.
 *
 * It is a COPY, not a move, and it never overwrites. The checkout keeps its
 * copy so that merging this cannot lose a word, and a second run finds the
 * target already there and does nothing. Never throws: a migration that cannot
 * run must not stop the app from starting.
 *
 * Returns the ids it carried, so a caller can say what really happened.
 */
export function carryHerBriefsAcross(fromDir,toDir) {
 const carried=[];
 if(!fromDir||!toDir||path.resolve(fromDir)===path.resolve(toDir)) return carried;
 for(const [id,file] of Object.entries(files)) {
  try {
   const target=path.join(toDir,'briefs',file);
   if(fs.existsSync(target)) continue;
   let text;
   try {text=fs.readFileSync(path.join(fromDir,'briefs',file),'utf8');}
   catch(e) {if(e.code!=='ENOENT') console.warn(`${nameSlug}: could not read ${file}: ${e.message}`); continue;}
   if(text===(id==='rules' ? '' : defaults[id])) continue;
   writeInstruction(toDir,id,text);
   carried.push(id);
  } catch(e) {console.warn(`${nameSlug}: could not carry ${file} into the data folder: ${e.message}`);}
 }
 return carried;
}

/**
 * THE TWO OLD MESSAGE FILES, JOINED INTO ONE, ONCE (w-3dc46f3a67).
 *
 * `writing-rules.md` said how an agent writes to the user during a task and
 * `finishing.md` said how it writes the last message. They are one box now, so
 * they have to become one document, and this is where that happens: on the
 * first boot after the change, before anything reads the new name.
 *
 * WHAT IT DOES WITH THE HALF THE USER NEVER WROTE. The writing rules ship
 * empty, so anything in that file is the user's. The finishing rules ship with
 * 5,794 characters of text, so most people have never touched them. When the
 * user has the one and not the other, the joined document takes the shipped
 * finishing text as its second half rather than leaving it out: the user's copy
 * shadows the default from here on, and dropping it would quietly stop every
 * task ending the way it does today.
 *
 * AND WHEN THE USER WROTE NEITHER, IT WRITES NOTHING AT ALL. That is the fresh
 * install, and leaving them with no file of their own is what keeps a later
 * release's default reaching them. Same rule as `carryHerBriefsAcross` above:
 * never freeze our own text into the user's folder.
 *
 * Never throws, never overwrites. Returns what it joined, or null.
 */
export function joinMessageRules(shippedDir,toDir) {
 try {
  const target=path.join(toDir,'briefs',files.messages);
  if(fs.existsSync(target)) return null;
  const read=(dir,name)=>{try {return fs.readFileSync(path.join(dir,'briefs',name),'utf8');} catch {return null;}};
  const either=(name)=>read(toDir,name) ?? read(shippedDir,name);
  const [writing,finishing]=WAS_MESSAGES.map((name)=>(either(name) ?? '').trim());
  if(!writing && !finishing) return null;
  const ending=finishing || defaults.messages.trim();
  const joined=[writing,ending].filter(Boolean).join('\n\n');
  writeInstruction(toDir,'messages',`${joined}\n`);
  return {writing:writing.length,ending:ending.length,total:joined.length+1};
 } catch(e) {
  console.warn(`${nameSlug}: could not join the message rules: ${e.message}`);
  return null;
 }
}
