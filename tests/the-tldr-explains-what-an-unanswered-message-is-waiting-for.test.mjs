// An unanswered message said it was waiting for an unspecified reply, even
// when the supervisor already knew it was queued, paused, or signed out.
import {it,expect} from 'vitest';
import {threadTldr} from '../shared/thread-tldr.mjs';
it('uses the actual scheduling explanation for an unanswered message',()=>{
 for(const statusText of ['Queued. An agent starts on it as soon as one is free.','Agent spawning is paused.','Codex is signed out.'])
  expect(threadTldr([{who:'you',at:2,text:'Continue.'}],null,{statusText}).text).toBe(statusText);
});
it('does not invent a queue when no scheduling facts are available',()=>{
 expect(threadTldr([{who:'you',text:'Continue.'}]).text).toBe('Noch keine Antwort des Agents auf deine neueste Nachricht.');
});
it('keeps the actual agent answer once it arrives',()=>{
 expect(threadTldr([{who:'you',at:1,text:'Continue.'},{who:'it',at:2,text:'Checked and fixed.'}],null,{statusText:'Queued.'}).text).toBe('Checked and fixed.');
});
