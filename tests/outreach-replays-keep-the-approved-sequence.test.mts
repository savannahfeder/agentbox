// A sparse screen recording held the app switcher after it had closed.
// Replay frames must cover the clock and bind data without changing that clock.
import { describe, expect, it } from 'vitest';
import { makeBindings, inject, validateTimeline, validateReplay, sceneAt, pointerAt, recordingTime, bridgeHold, replayKey } from '../scripts/lib/outreach-template.mjs';

describe('approved outreach replay', () => {
  it('reuses pointer-only frames while keeping scroll and content changes',()=>{
    const html='<div id="film-pointer" style="translate: 10px 20px;"></div><p>Same</p>';
    expect(replayKey({scroll:[]},html)).toBe(replayKey({scroll:[]},html.replace('10px 20px','11px 21px')));
    expect(replayKey({scroll:[]},html)).not.toBe(replayKey({scroll:[[0,100]]},html));
    expect(replayKey({scroll:[]},html)).not.toBe(replayKey({scroll:[]},html.replace('Same','Changed')));
  });
  it('fills only short static holds and rejects a missing content transition',()=>{
    const a={t:0,html:'<p>Same work</p>',scroll:[],site:false,switcher:false};
    const b={...a,t:.2};
    expect(bridgeHold(a,b)).toHaveLength(5);
    expect(()=>bridgeHold(a,{...b,html:'<p>Different work</p>'})).toThrow(/content/);
    expect(()=>bridgeHold(a,{...b,t:.31})).toThrow(/long/);
    expect(()=>bridgeHold(a,{...b,site:true})).toThrow(/content/);
  });
  it('uses the approved timing correction without speeding up more than fifteen percent',()=>{
    expect(recordingTime([[10,20],[20,20]],10)).toBe(11.5);
    expect(recordingTime([[10,20],[20,20]],15)).toBe(15.75);
    expect(recordingTime([[10,20],[20,20]],20)).toBe(20);
    expect(recordingTime([],7)).toBe(7);
  });
  it('rejects a switcher or homepage that survives the opening transition', () => {
    const frames = Array.from({length:300}, (_,i)=>({t:i/30,site:i<148,switcher:i>=120&&i<148}));
    expect(()=>validateReplay(frames,10)).not.toThrow();
    expect(()=>validateReplay(frames.map(f=>({...f,switcher:f.switcher||f.t===7})),10)).toThrow(/transition/);
    expect(()=>validateReplay(frames.map(f=>({...f,site:f.site||f.t===9})),10)).toThrow(/transition/);
  });
  const source = { company: { name: 'Sample Company' }, needsYou: [{ title: 'Fix the source timeout', summary: 'The source timeout is fixed.' }] };
  it('binds short visible project names and keeps machine identifiers out', () => {
    const bindings=makeBindings({projects:[{name:'API',slug:'api'}],team:{people:[{id:'maya',threads:[{title:'Fix API retries'}]}]}});
    expect(bindings.some(b=>b.source==='API')).toBe(true);
    expect(bindings.some(b=>b.source==='Fix API retries')).toBe(true);
    expect(bindings.some(b=>b.source==='maya'||b.source==='api')).toBe(false);
  });
  it('replaces company fields without accepting markup', () => {
    const bindings = makeBindings(source);
    const title = bindings.find((b) => b.source === source.needsYou[0].title);
    const html = `<h1>${title.token}</h1>`;
    expect(inject(html, bindings, { company: { name: 'Other Company' }, needsYou: [{ title: '<script>bad()</script>', summary: 'Different summary' }] })).toBe('<h1>&lt;script&gt;bad()&lt;/script&gt;</h1>');
  });
  it('rejects missing fields instead of retaining the original company', () => {
    const bindings = makeBindings(source);
    expect(() => inject(bindings[0].token, bindings, {})).toThrow(/Missing/);
  });
  it('rejects ambiguous shared text when the replacement values disagree', () => {
    const bindings = makeBindings({ first: 'Shared source title', second: 'Shared source title' });
    expect(() => inject(bindings[0].token, bindings, { first: 'First target title', second: 'Second target title' })).toThrow(/Ambiguous/);
  });
  it('keeps every frame and rejects a capture gap', () => {
    expect(() => validateTimeline([{ t: 0 }, { t: 1/30 }, { t: 2/30 }], 3/30, 30)).not.toThrow();
    expect(() => validateTimeline([{ t: 0 }, { t: 0.4 }], .5, 30)).toThrow(/gap/);
    expect(() => validateTimeline([{ t: 0 }, { t: -1 }], .1, 30)).toThrow(/order/);
  });
  it('allows bounded sampling jitter but rejects a stalled recorder', () => {
    expect(()=>validateTimeline([{t:0},{t:.15}],.18)).not.toThrow();
    expect(()=>validateTimeline([{t:0},{t:.151}],.18)).toThrow(/gap/);
  });
  it('selects the state at its exact boundary and keeps static holds', () => {
    const frames = [{t:0,id:'site'}, {t:4.9,id:'home'}, {t:19.9,id:'team'}];
    expect(sceneAt(frames,4.899).id).toBe('site');
    expect(sceneAt(frames,4.9).id).toBe('home');
    expect(sceneAt(frames,7).id).toBe('home');
    expect(sceneAt(frames,19.9).id).toBe('team');
  });
  it('interpolates the pointer between samples without moving scene boundaries', () => {
    const frames=[{t:0,html:'<div id="film-pointer" style="translate: -10px 20px;"></div>'},{t:.1,html:'<div id="film-pointer" style="translate: 10px 40px;"></div>'}];
    expect(pointerAt(frames,.05)).toEqual([0,30]);
    expect(pointerAt(frames,-1)).toEqual([-10,20]);
    expect(pointerAt(frames,2)).toEqual([10,40]);
    expect(sceneAt(frames,.05)).toBe(frames[0]);
    expect(pointerAt([{t:0,html:'<div></div>'}],0)).toBeNull();
  });
});
