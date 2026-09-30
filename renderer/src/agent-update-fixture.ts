// Browser review data only. These functions never execute a command.
export function updateFixture(fail=false){
 let state='available',started=0,attempt=0;
 const status=(engine:string)=>{
  if(state==='running'&&Date.now()-started>1800)state=fail?'failed':'current';
  return {engine,state,installed:state==='current'?'2.1.2':'2.1.1',latest:'2.1.2',message:state==='failed'?'Update did not finish. You can retry.':state==='current'?'Updated. Available models refreshed.':undefined};
 };
 return {
  action(engine:string,action:string){if(action==='start'&&state!=='running'){state='running';started=Date.now();attempt++;}return status(engine);},
  terminal(p:{action:string;offset?:number}){
   if(p.action==='close'){state='failed';return true;}
   const s=status('claude');const exited=s.state!=='running';const text='$ claude update\r\nChecking for updates…\r\n'+(exited?(fail?'Update failed: could not reach the download server.\r\n':'Updated to 2.1.2.\r\n'):'');
   return {token:'update-preview-'+attempt,cwd:'/preview',data:text.slice(p.offset||0),offset:text.length,truncated:false,exited,exitCode:exited?(fail?1:0):null,process:exited?'Exited':'claude'};
  }
 };
}
