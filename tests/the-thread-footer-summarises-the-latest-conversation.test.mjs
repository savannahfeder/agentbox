// A lifted Result could lag newer spoken replies. The footer must use the
// newest message, preserve the request, and never call an unanswered reply done.
import {describe,it,expect} from 'vitest';
import {threadTldr} from '../shared/thread-tldr.mjs';
const user=(at,text)=>({at,who:'you',text});
const agent=(at,text)=>({at,who:'it',text});
describe('current thread TL;DR',()=>{
 it('uses the newest spoken update instead of an old lifted Result',()=>{
  const t=threadTldr([user(1,'Check the login.'),agent(4,'Cookies cleared. Login still fails.')],{at:2,text:'Initial investigation finished.'});
  expect(t.text).toBe('Cookies cleared. Login still fails.');expect(t.context).toBe('Check the login.');expect(t.at).toBe(4);
 });
 it('does not treat a re-imported old snapshot as a new reply',()=>{const t=threadTldr([agent(1,'Old snapshot.\n\nRead from Codex. Replies happen there.'),user(2,'Check mobile.'),agent(3,'Mobile verified.')],{at:4,text:'Old snapshot.\n\nRead from Codex. Replies happen there.'});expect(t.text).toBe('Mobile verified.');});
 it('uses a later result and ignores tool activity',()=>{
  expect(threadTldr([agent(2,'Investigating'),{at:8,kind:'work',text:'old tool'}],{at:6,text:'Fixed the login.'}).text).toBe('Fixed the login.');
 });
 it('shows the latest unanswered request rather than a settled answer',()=>{
  const t=threadTldr([agent(2,'Done.'),user(3,'But does it work on mobile?')],null,{running:true});
  expect(t.text).toBe('Agent arbeitet an deiner neuesten Nachricht.');expect(t.context).toBe('But does it work on mobile?');
  expect(threadTldr([user(3,'Please retry.')],{at:2,text:'Done.'}).text).toBe('Deine neueste Nachricht wartet auf eine Antwort.');
 });
 it('keeps at most two sentences, removes formatting and skips options and code',()=>{
  const text='## Gist\n\n**Login fixed.** Browser verified. More detail here.\n\n## Options\n1. Delete everything';
  expect(threadTldr([agent(1,text)]).text).toBe('Login fixed. Browser verified.');
  expect(threadTldr([agent(1,'![picture](secret.png)\n```sh\nremove all\n```\n[The login](https://example.com) still fails.')]).text).toBe('The login still fails.');
 });
 it('keeps prices and version numbers intact',()=>{expect(threadTldr([agent(1,'Version 6.1 läuft. Kosten: 800.50 Euro. Details folgen.')]).text).toBe('Version 6.1 läuft. Kosten: 800.50 Euro.');});
 it('bounds long messages and does not invent an empty result',()=>{
  expect(threadTldr([agent(1,'a'.repeat(2000))]).text.length).toBeLessThanOrEqual(240);
  expect(threadTldr([],null)).toBeNull();
 });
});
