// A remote session is alive while idle. Waiting for it to exit would make
// native commands unusable until remote access was disconnected.
import {it,expect} from 'vitest';
import {submitReply} from '../main/live-replies.mjs';
function fixture(remoteIdle){const sent=[];const s={product:'p',remoteIdle,child:{steer:async text=>sent.push(text)}};return {sent,sup:{sessions:new Map([['x',s]]),_handledAnswers:new Set(),_answerKey:()=> 'key',_saveState(){}}};}
it('sends an idle native command to the same process',async()=>{const {sup,sent}=fixture(true);await submitReply(sup,{product:'p',id:'x',answer:'/context'},()=>({id:'x'}));expect(sent).toEqual(['/context']);});
it('still refuses a slash command during an active turn',async()=>{const {sup,sent}=fixture(false);await expect(submitReply(sup,{product:'p',id:'x',answer:'/context'},()=>({id:'x'}))).rejects.toThrow();expect(sent).toEqual([]);});
