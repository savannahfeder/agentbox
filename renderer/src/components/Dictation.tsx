import {AudioWaveform} from './AudioWaveform';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {queueDictation,dictationJobs,watchDictations,retryDictation,editDictation,sendDictation,dismissDictation} from '../../../shared/dictation-jobs.mjs';
let active:MediaRecorder|null=null;let starting=false;
export function DictationStatus(){const jobs=useSyncExternalStore(watchDictations,dictationJobs,dictationJobs);return jobs.length?<div className="dictation-jobs" aria-live="polite">{jobs.map(job=><div key={job.id}>{job.target}: {job.ready?'Transkript bearbeiten':job.error||'Wird transkribiert …'}{(job.ready||job.error)&&job.text&&<textarea aria-label={`Transkript für ${job.target}`} value={job.text} onChange={e=>editDictation(job.id,e.target.value)}/>} {job.ready&&<button onClick={()=>void sendDictation(job.id)}>↑ Senden</button>}{job.error&&<button onClick={()=>void retryDictation(job.id)}>Erneut versuchen</button>}{(job.ready||job.error)&&<button onClick={()=>dismissDictation(job.id)}>Verwerfen</button>}</div>)}</div>:null;}
export function DictationButtons({target,onDraft,onSend,onQueued,onNotice}:{target:string;onDraft:(text:string)=>boolean|void|Promise<boolean|void>;onSend:(text:string)=>void|Promise<void>;onQueued?:()=>void;onNotice:(text:string)=>void}){
 const [recording,setRecording]=useState(false);const [input,setInput]=useState<MediaStream|null>(null);const recorder=useRef<MediaRecorder|null>(null);const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const r=recorder.current;if(r?.state==='recording')r.stop();};},[]);
 const finish=(send:boolean)=>{const r=recorder.current;if(!r||r.state==='inactive')return;const deliver=send?onSend:onDraft;
  r.addEventListener('stop',()=>{if(send)onQueued?.();},{once:true});
  (r as MediaRecorder&{deliver?:(text:string)=>boolean|void|Promise<boolean|void>}).deliver=deliver;r.stop();};
 const start=async()=>{let stream:MediaStream|undefined;let ownsStart=false;try{if(starting||active?.state==='recording')throw Error('Bitte die andere Aufnahme zuerst stoppen.');if(!window.zero?.transcribeAudio)throw Error('Diktat benötigt die aktualisierte App.');starting=true;ownsStart=true;stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current){stream.getTracks().forEach(t=>t.stop());return;}const r=new MediaRecorder(stream),chunks:BlobPart[]=[];recorder.current=r;active=r;setInput(stream);setRecording(true);
  r.addEventListener('dataavailable',e=>{if(e.data.size)chunks.push(e.data)});
  const limit=setTimeout(()=>r.state==='recording'&&r.stop(),120000);
  r.addEventListener('stop',()=>{clearTimeout(limit);stream!.getTracks().forEach(t=>t.stop());active=null;if(mounted.current){setRecording(false);setInput(null);}const blob=new Blob(chunks,{type:r.mimeType});const deliver=(r as MediaRecorder&{deliver?:(text:string)=>boolean|void|Promise<boolean|void>}).deliver??onDraft;
   void queueDictation({target,transcribe:async()=>{const result=await window.zero!.transcribeAudio({audio:await blob.arrayBuffer(),mime:blob.type});return result.text},deliver,send:onSend});});r.start();
 }catch(error){stream?.getTracks().forEach(t=>t.stop());if(active===recorder.current)active=null;if(mounted.current){setRecording(false);setInput(null);}onNotice((error as Error).message)}finally{if(ownsStart)starting=false}};
 if(typeof window==='undefined'||!window.zero?.transcribeAudio)return null;
 return <span className="dictation-buttons">{recording?<>{input&&<AudioWaveform stream={input}/>}<button type="button" onClick={()=>finish(false)} title="Stoppen und Text bearbeiten" aria-label="Stoppen und Text bearbeiten">■</button><button type="button" onClick={()=>finish(true)} title="Nach Transkription automatisch senden" aria-label="Nach Transkription automatisch senden">↑</button></>:<button type="button" onClick={()=>void start()} title="Sprachnachricht aufnehmen">🎙 Diktieren</button>}</span>;
}
