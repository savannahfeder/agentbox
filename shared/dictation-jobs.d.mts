export interface DictationJob {id:number;target:string;running:boolean;error:string;ready?:boolean;text?:string}
export function dictationJobs():DictationJob[];
export function watchDictations(fn:()=>void):()=>void;
export function queueDictation(p:{target:string;transcribe:()=>Promise<string>;deliver:(text:string)=>boolean|void|Promise<boolean|void>;send?:(text:string)=>void|Promise<void>}):Promise<void>;
export function retryDictation(id:number):Promise<void>;

export function editDictation(id:number,text:string):void;
export function sendDictation(id:number):Promise<void>;
export function dismissDictation(id:number):void;
