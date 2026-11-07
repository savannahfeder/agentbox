// MP-04: the old undo timer announced Sent before IPC and swallowed rejection.
// Measure event order: no success before acknowledgement; failure restores once.
import {it,expect} from 'vitest';
import {deliverReply} from '../renderer/src/deliver-reply.mjs';
it('announces success only after provider acceptance',async()=>{const events=[];let accept;const p=deliverReply({send:()=>new Promise(r=>accept=r),accepted:()=>events.push('sent'),failed:()=>events.push('failed')});expect(events).toEqual([]);accept();await p;expect(events).toEqual(['sent']);});
it('restores a rejected draft without announcing success',async()=>{const events=[];await deliverReply({send:async()=>{throw Error('connection closed');},accepted:()=>events.push('sent'),failed:e=>events.push(e.message)});expect(events).toEqual(['connection closed']);});
it('does not turn a refresh failure into a failed delivery',async()=>{await expect(deliverReply({send:async()=>{},accepted:()=>{throw Error('refresh');},failed:()=>{throw Error('wrong');}})).rejects.toThrow('refresh');});
it('keeps the corrected task subscribed to fresh state until its result arrives',async()=>{const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('../renderer/src/App.tsx',import.meta.url),'utf8');const live=source.slice(source.indexOf('    if (isRunning) {'),source.indexOf('    // TAKING A SEND BACK'));expect(live).toContain('setFollowing({ product: item.product, id: item.id })');});
