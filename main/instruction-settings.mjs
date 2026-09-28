// A fixed allowlist exposes the instruction files, never arbitrary paths.
// Defaults are shipped separately so an edited live file can always be reset.
//
// THERE ARE THREE OF THEM NOW, NOT FOUR (w-3dc46f3a67, 2026-09-22). Hers, on
// being shown the five prompts a person could edit: "Those five layers of
// prompts that the user can adjust might be overkill. Maybe we decide not to
// expose some of them, or maybe we would best aggregate others."
//
// A person opening that page is answering two questions, what should agents do
// and how should they talk to me, so the writing rules and the finishing rules
// became ONE document: `message-rules.md`, "How agents write to you". The
// evidence they were one thing all along is her own rules file, where three of
// four paragraphs are about how agents write to her rather than what they do.
// `joinMessageRules` below carries the two old files into the new one.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Every line this file prints is prefixed with the app's own name, read from the
// one place that holds it. Typing it here is what left three dead names in the
// code through two renames (tests/the-app-is-named-in-one-place).
import {nameSlug} from '../shared/product-name.mjs';
// ADHD MODE IS A FOURTH FILE, NOT A PARAGRAPH INSIDE THE THIRD (w-5737fe67cf,
// 2026-09-25). Hers: "it should really just append that text to your content if
// you have ADHD mode on, and then remove it when you turn it off... Maybe it
// opens a new section with additional instructions that get applied." Kept in
// its own file so her edits to it never mix with her own rules, and survive
// while the mode is off. Whether it is on lives in her config (`adhdMode`).
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
export function writeInstruction(appDir,id,text) {
 const file=fileFor(id);
 if(typeof text!=='string') throw new Error('Instructions must be text');
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
 * HER OWN WRITING, CARRIED OUT OF THE CHECKOUT ONCE (w-3dc46f3a67, 2026-09-21).
 *
 * Until this ran, the four boxes in Settings read and wrote `dataDir/briefs`,
 * and running from source `dataDir` is the git checkout the whole fleet works
 * in. Measured on her repo that day: briefs/founder.md had four commits, all of
 * them an agent's, and the working copy matched the newest exactly. Her rules
 * were being kept in the one folder every worker is allowed to `git checkout`.
 *
 * WHAT MOVES IS ONLY WHAT SHE WROTE, and the test for that is the shipped
 * default. A file whose text IS the default is our file sitting where we put
 * it, and copying it into her folder would freeze it there: the next release's
 * worker brief would never reach her, because her "edit" would shadow it
 * forever. So a file is carried across only when it differs from the default,
 * which on her Mac is founder.md and writing-rules.md and neither of the two we
 * ship. Those two are the same pair package.json keeps out of the download.
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
 * THE TWO OLD MESSAGE FILES, JOINED INTO ONE, ONCE (w-3dc46f3a67, 2026-09-22).
 *
 * `writing-rules.md` said how an agent writes to her during a task and
 * `finishing.md` said how it writes the last message. They are one box now, so
 * they have to become one document, and this is where that happens: on the
 * first boot after the change, before anything reads the new name.
 *
 * WHAT IT DOES WITH THE HALF SHE NEVER WROTE. The writing rules ship empty, so
 * anything in that file is hers. The finishing rules ship with 5,794 characters
 * of text, so most people have never touched them. When she has the one and not
 * the other, the joined document takes the shipped finishing text as its second
 * half rather than leaving it out: her copy shadows the default from here on,
 * and dropping it would quietly stop every task ending the way it does today.
 *
 * AND WHEN SHE WROTE NEITHER, IT WRITES NOTHING AT ALL. That is the fresh
 * install, and leaving her with no file of her own is what keeps a later
 * release's default reaching her. Same rule as `carryHerBriefsAcross` above:
 * never freeze our own text into her folder.
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
