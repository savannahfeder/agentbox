// September 18 security review: missing IPC identity previously passed the
// terminal guard. September 18: no maintenance team; permit compatible
// upgrades instead of requiring manual manifest edits. The lockfile still
// records exactly what was tested. Only the app's exact top frame may access its local shell.
import {it,expect} from 'vitest';
import {terminalSenderAllowed} from '../main/terminal-access.mjs';
import fs from 'node:fs';
import semver from 'semver';
it('accepts only the app main frame',()=>{
 const frame={url:'file:///app/renderer/dist/index.html',parent:null};const contents={mainFrame:frame};
 expect(terminalSenderAllowed({sender:contents,senderFrame:frame},contents,[frame.url])).toBe(true);
 for(const event of [{},{sender:contents},{sender:{},senderFrame:frame},{sender:contents,senderFrame:{parent:frame,url:frame.url}}])expect(terminalSenderAllowed(event,contents)).toBe(false);
});
it('rejects a frame navigated to remote content',()=>{
 const frame={url:'https://untrusted.invalid',parent:null};const contents={mainFrame:frame};
 expect(terminalSenderAllowed({sender:contents,senderFrame:frame},contents)).toBe(false);
});
// September 25: the three @xterm packages moved to devDependencies, because
// they are compiled into renderer/dist at build time and a copy installed from
// npm never loads one. node-pty stayed, because main/terminal.mjs requires it
// at run time. NOTHING ABOUT THE PROPERTY BELOW CHANGED: each of the four is
// still pinned to a caret range and the lockfile still records the integrity
// hash of the exact build that was tested. Which of the two lists holds a
// package says when it is needed, not how carefully it is pinned, so this now
// asks whichever list holds it.
it('allows compatible terminal upgrades while locking each tested build' ,()=>{
 const p=JSON.parse(fs.readFileSync('package.json')),l=JSON.parse(fs.readFileSync('package-lock.json'));
 for(const name of ['@xterm/xterm','@xterm/addon-fit','@xterm/addon-serialize','node-pty']){
  const declared=p.dependencies[name]??p.devDependencies[name];
  const inLock=l.packages[''].dependencies?.[name]??l.packages[''].devDependencies?.[name];
  expect(declared,`${name} is in neither list`).toMatch(/^\^\d+\.\d+\.\d+$/);
  expect(semver.satisfies(l.packages['node_modules/'+name].version,declared)).toBe(true);
  expect(inLock).toBe(declared);
  expect(l.packages['node_modules/'+name].integrity).toMatch(/^sha512-/);
 }
});
