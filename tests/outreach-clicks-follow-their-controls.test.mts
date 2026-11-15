// A single retargeted comment made the cursor jump when the row changed.
import {it} from 'vitest';
import assert from 'node:assert/strict';
import {anchoredPointer, smoothPointer, recordedPointer} from '../scripts/lib/outreach-pointer.mts';
import {pointerAt} from '../scripts/lib/outreach-template.mjs';
it('lands on measured controls without an offset appearing at a scene boundary',()=>{
 const anchors=[{t:10,delta:[100,40]},{t:20,delta:[-60,20]}];
 assert.deepEqual(anchoredPointer([20,30],10,anchors),[120,70]);
 assert.deepEqual(anchoredPointer([20,30],20,anchors),[-40,50]);
 const a=anchoredPointer([20,30],14.999,anchors),b=anchoredPointer([20,30],15.001,anchors);
 assert(Math.hypot(a[0]-b[0],a[1]-b[1])<1);
 assert.deepEqual(anchoredPointer([20,30],0,[]),[20,30]);
});
it('prepares pointer samples once without changing the recorded path',()=>{
 const frames=[{t:0,html:'<div id="film-pointer" style="translate: -10px 20px;"></div>'},{t:.1,html:'<div id="film-pointer" style="translate: 10px 40px;"></div>'},{t:.3,html:'<div id="film-pointer" style="translate: 100px -30px;"></div>'}];
 const at=recordedPointer(frames);
 for(let i=-10;i<50;i++)assert.deepEqual(at(i/100),pointerAt(frames,i/100));
});
it('eases a recorded pointer discontinuity instead of teleporting',()=>{
 const point=(t:number)=>t<10?[0,0]:[1000,400];
 const before=smoothPointer(point,9.999),after=smoothPointer(point,10.001);
 assert(Math.hypot(after[0]-before[0],after[1]-before[1])<20);
 assert.deepEqual(smoothPointer(point,8),[0,0]);
});
