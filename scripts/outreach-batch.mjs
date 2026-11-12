import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const [template,list,app,face,masks,sounds,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: outreach-batch.mjs template targets.json app-dist face.mp4 masks sounds output');
const scripts=path.dirname(fileURLToPath(import.meta.url));
const python=process.env.OUTREACH_PYTHON||'python3';
const targets=JSON.parse(fs.readFileSync(list));
fs.mkdirSync(output,{recursive:true});
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'outreach-batch-'));
async function run(command,args,env={}){
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'inherit',env:{...process.env,...env}});
    child.once('error',reject);
    child.once('exit',(code)=>code===0?resolve():reject(new Error(`${path.basename(command)} exited ${code}`)));
  });
}
const failed=[];
try {
  const sfx=path.join(scratch,'sounds.wav');
  await run(python,[path.join(scripts,'outreach-sounds.py'),path.join(template,'manifest.json'),sounds,sfx]);
  for(const target of targets){
    const started=Date.now();
    const film=path.join(output,target.output),partial=film.replace(/\.mp4$/,'.partial.mp4');
    const screen=path.join(scratch,`${target.slug}.mp4`);
    const review=path.join(output,'stills',target.slug,path.basename(target.output,'.mp4'));
    try {
      if(fs.existsSync(film))throw new Error(`Output already exists: ${film}`);
      console.log(`START ${target.slug}`);
      await run(process.execPath,['--experimental-strip-types',path.join(scripts,'outreach-render.mjs'),template,target.input,screen,app,'--layers'],{OUTREACH_LEAD_SLUG:target.slug});
      await run(python,[path.join(scripts,'outreach-overlay.py'),screen,sfx,face,masks,partial,'97.1']);
      await run(python,[path.join(scripts,'outreach-check.py'),partial,face,review]);
      fs.renameSync(partial,film);
      fs.copyFileSync(screen+'.qa.json',film+'.qa.json');
      const report=JSON.parse(fs.readFileSync(path.join(review,'checks.json')));
      report.film=film;report.elapsed_seconds=(Date.now()-started)/1000;
      fs.writeFileSync(path.join(review,'checks.json'),JSON.stringify(report,null,2));
      console.log(`PASS ${target.slug} ${report.elapsed_seconds.toFixed(1)} seconds ${film}`);
    } catch(error){
      failed.push(target.slug);console.error(`FAILED ${target.slug}: ${error.message}`);
    } finally {
      fs.rmSync(screen,{force:true});fs.rmSync(screen+'.qa.json',{force:true});fs.rmSync(partial,{force:true});
    }
  }
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
if(failed.length)throw new Error(`Films needing repair: ${failed.join(', ')}`);
