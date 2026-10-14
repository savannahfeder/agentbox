import {it,expect,vi} from 'vitest';
import {setupLive} from '../renderer/src/live/live.js';
it('keeps action transitions private and publishes the final chat once',async()=>{
 const sent=[],listeners={};let release,control;
 const node=(tag,props={},...children)=>({tag,props,children,append(...c){this.children.push(...c)},replaceChildren(){this.children=[]},remove(){},classList:{toggle(){}},play:()=>Promise.resolve(),get firstChild(){return this.children[0]}});
 const body=node('body'),mount=node('nav');
 class Peer{constructor(){this.iceGatheringState='complete';this.localDescription={sdp:'v=0 test'}}addEventListener(){}addTrack(){}createOffer(){return {}}async setLocalDescription(){}async setRemoteDescription(){}close(){}createDataChannel(){return {readyState:'open',send:s=>sent.push(JSON.parse(s)),addEventListener:(type,fn)=>listeners[type]=fn,close(){}}}}
 vi.useFakeTimers();vi.stubGlobal('RTCPeerConnection',Peer);vi.stubGlobal('document',{body,createTextNode:s=>s});vi.stubGlobal('window',{addEventListener(){},removeEventListener(){}});vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
 try{
  control=setupLive({el:node,mount,api:async()=>({transport:{sdp:'v=0 answer'}}),execute:async()=>{control.context({current:{title:'WRONG TRANSIENT CHAT'}});await new Promise(r=>release=r);return {current:{title:'Final example'},latestAgentResult:'Done'}},toast(){},available:()=>true,recording:()=>false});
  await mount.children[0].props.onClick();listeners.message({data:JSON.stringify({type:'session.started'})});release();await Promise.resolve();await Promise.resolve();
  control.context({current:{title:'Final example'},latestAgentResult:'Done'});
  expect(sent.filter(e=>e.type==='session.thinking.append')).toHaveLength(1);
  const commentary=sent.filter(e=>e.type==='session.commentary.append');expect(commentary).toHaveLength(1);expect(commentary[0].content).toContain('Final example');expect(JSON.stringify(sent)).not.toContain('WRONG TRANSIENT CHAT');
 }finally{control?.destroy();vi.useRealTimers();vi.unstubAllGlobals()}
});
