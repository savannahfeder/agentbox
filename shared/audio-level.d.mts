export function audioLevel(samples:Uint8Array):number;
export function watchAudioLevel(stream:MediaStream,onLevel:(level:number)=>void,host?:any):()=>void;
