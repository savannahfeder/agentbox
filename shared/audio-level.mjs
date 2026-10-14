export function audioLevel(samples) {
 let sum=0;for(const sample of samples){const value=(sample-128)/128;sum+=value*value}
 return samples.length?Math.min(1,Math.sqrt(sum/samples.length)):0;
}
export function watchAudioLevel(stream,onLevel,host=globalThis) {
 const context=new host.AudioContext();let source,analyser,frame,stopped=false;
 const stop=()=>{if(stopped)return;stopped=true;if(frame!==undefined)host.cancelAnimationFrame(frame);source?.disconnect();analyser?.disconnect();void context.close().catch(()=>{})};
 try {
  source=context.createMediaStreamSource(stream);analyser=context.createAnalyser();analyser.fftSize=256;source.connect(analyser);
  const samples=new Uint8Array(analyser.fftSize);
  const tick=()=>{if(stopped)return;analyser.getByteTimeDomainData(samples);onLevel(audioLevel(samples));frame=host.requestAnimationFrame(tick)};
  void context.resume().catch(()=>{});frame=host.requestAnimationFrame(tick);return stop;
 } catch(error){stop();throw error}
}
