export async function setHeroFrame({url,time}:{url:string;time:number}) {
  const host=document.getElementById('film-site');
  if(!host)throw new Error('Recorded hero has no scene');
  const cache=window as Window & {outreachHero?:HTMLVideoElement};
  let video=cache.outreachHero;
  if(!video||video.src!==url){
    video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
    Object.assign(video.style,{position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'cover'});
    video.src=url;cache.outreachHero=video;
  }
  host.replaceChildren(video);
  const wait=(event:string)=>new Promise<void>((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video!.removeEventListener(event,done);video!.removeEventListener('error',failed);};
    const done=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(new Error('Could not decode recorded hero'));};
    const timer=setTimeout(()=>{cleanup();reject(new Error(`Recorded hero timed out at ${time}s`));},5000);
    video!.addEventListener(event,done,{once:true});video!.addEventListener('error',failed,{once:true});
  });
  if(video.readyState<1)await wait('loadedmetadata');
  if(!Number.isFinite(video.duration)||video.duration<5.4&&time>=2)throw new Error('Recorded hero is too short');
  video.pause();
  const seek=Math.max(.001,Math.min(time,video.duration-1/30));
  if(Math.abs(video.currentTime-seek)>.0001){const ready=wait('seeked');video.currentTime=seek;await ready;}
  if(video.readyState<2)await wait('loadeddata');
}
