import {useEffect,useRef} from 'react';
import {watchAudioLevel} from '../../../shared/audio-level.mjs';
export function AudioWaveform({stream}:{stream:MediaStream}) {
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const node=canvas.current,paint=node?.getContext('2d');if(!node||!paint)return;
  const history=new Array<number>(40).fill(0);let last=0;
  const draw=(level:number)=>{const now=performance.now();if(now-last<40)return;last=now;history.shift();history.push(level);paint.clearRect(0,0,240,36);paint.fillStyle=getComputedStyle(node).color;
   history.forEach((value,index)=>{const height=3+Math.min(1,value*3)*29;paint.beginPath();paint.roundRect(index*6+1,(36-height)/2,3,height,1.5);paint.fill()});};
  draw(0);try{return watchAudioLevel(stream,draw)}catch{node.setAttribute('aria-label','Aufnahme läuft · Pegelanzeige nicht verfügbar')}
 },[stream]);
 return <canvas ref={canvas} width={240} height={36} className="dictation-waveform" role="img" aria-label="Aufnahme läuft · Mikrofonpegel"/>;
}
