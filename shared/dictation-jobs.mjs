let jobs=[];const listeners=new Set();let serial=0;
export const dictationJobs=()=>jobs;
export const watchDictations=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
const update=()=>{jobs=[...jobs];for(const listener of listeners)listener()};
async function run(job){if(job.running)return;job.running=true;job.error='';update();try{job.text??=await job.transcribe();if(typeof job.text!=='string'||!job.text.trim())throw Error('Keine Sprache erkannt.');const delivered=await job.deliver(job.text);if(delivered===false){job.ready=true;}else jobs=jobs.filter(j=>j!==job);}catch(error){job.error=error.message;}finally{job.running=false;update();}}
export function queueDictation({target,transcribe,deliver,send}){const job={id:++serial,target,transcribe,deliver,send,running:false,error:''};jobs.push(job);return run(job)}
export function retryDictation(id){const job=jobs.find(j=>j.id===id);return job?run(job):Promise.resolve()}

export function editDictation(id,text){const job=jobs.find(j=>j.id===id);if(job){job.text=text;update()}}
export function sendDictation(id){const job=jobs.find(j=>j.id===id);if(job?.send){job.deliver=job.send;job.ready=false;return run(job)}return Promise.resolve()}
export function dismissDictation(id){jobs=jobs.filter(j=>j.id!==id);update()}
