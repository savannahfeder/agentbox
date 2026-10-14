import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export async function openWebsite(src,{platform=process.platform,execute=run,external}={}){
 const url=new URL(src);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('A website needs an HTTP or HTTPS address without credentials.');
 if(platform==='darwin')await execute('/usr/bin/open',['-a','Google Chrome',url.href],{timeout:10000});
 else await external(url.href);
}
