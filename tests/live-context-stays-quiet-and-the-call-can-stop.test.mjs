// Opening a completed chat spoke it again; tool results and commentary also read the same result twice.
import {it,expect,vi} from 'vitest';
import {setupLive} from '../renderer/src/live/live.js';
it('updates opened chats silently, speaks only the initial review, and stops audio immediately',async()=>{
 const sent=[],listeners={},tracks=[{stop:vi.fn()}];
 const node=(tag,props={},...children)=>({tag,props,children,append(...c){this.children.push(...c)},replaceChildren(){this.children=[]},remove(){},pause:vi.fn(),classList:{toggle(){}},play:()=>Promise.resolve(),get firstChild(){return this.children[0]}});
 const mount=node('nav');
 class Peer{constructor(){this.iceGatheringState='complete';this.localDescription={sdp:'v=0 test'}}addEventListener(){}addTrack(){}createOffer(){return {}}async setLocalDescription(){}async setRemoteDescription(){}close(){}createDataChannel(){return {readyState:'open',send:s=>sent.push(JSON.parse(s)),addEventListener:(type,fn)=>listeners[type]=fn,close(){}}}}
 vi.useFakeTimers();vi.stubGlobal('RTCPeerConnection',Peer);vi.stubGlobal('document',{body:mount,createTextNode:s=>s});vi.stubGlobal('window',{addEventListener(){},removeEventListener(){}});vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>tracks})}});
 let current={current:{id:'qa-a',product:'qa',title:'Example A'},latestAgentResult:'Latest A'},control;
 try{
  control=setupLive({el:node,mount,api:async()=>({transport:{sdp:'v=0 answer'}}),execute:async a=>{if(a.action==='next')current={current:{id:'qa-b',product:'qa',title:'Example B'},latestAgentResult:'Latest B'};return current},toast(){},available:()=>true,recording:()=>false});
  await mount.children[0].props.onClick();listeners.message({data:JSON.stringify({type:'session.started'})});for(let n=0;n<8;n++)await Promise.resolve();
  listeners.message({data:JSON.stringify({type:'session.output_transcript.delta',delta:'First example'})});
  const call={type:'response.event',event:{type:'response.output_item.done',item:{type:'function_call',call_id:'qa-next',name:'agentbox_action',arguments:'{"action":"next"}'}}};listeners.message({data:JSON.stringify(call)});for(let n=0;n<8;n++)await Promise.resolve();
  listeners.message({data:JSON.stringify({type:'session.output_transcript.delta',delta:'Next example'})});
  const log=mount.children[1].children[3];expect(log.children.filter(row=>row.children[0]?.children[0]==='GPT Live · ')).toHaveLength(2);
  control.context({current:{id:'qa-done',title:'Completed example',status:'done'},latestAgentResult:'Already done'});
  expect(sent.filter(e=>e.type==='session.commentary.append')).toHaveLength(1);
  expect(sent.some(e=>e.type==='session.thinking.append'&&e.content.includes('Completed example'))).toBe(true);
  const panel=mount.children[1],heading=panel.children[1],stop=heading.children[2],audio=panel.children[2];
  expect(stop.children).toContain('Call beenden');stop.props.onClick();
  expect(audio.pause).toHaveBeenCalled();expect(tracks[0].stop).toHaveBeenCalled();expect(sent.at(-1).type).toBe('session.close');expect(control.isActive()).toBe(false);
  listeners.message({data:JSON.stringify({type:'session.closed'})});
 }finally{control?.destroy();vi.useRealTimers();vi.unstubAllGlobals()}
});
