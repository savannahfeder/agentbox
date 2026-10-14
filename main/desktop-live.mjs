import fs from 'node:fs';
import http from 'node:http';
export async function desktopLiveSession(config,sdp){
 if(!config)throw Error('The existing mobile Live service must be configured for desktop calls.');
 const endpoint=new URL(config.url);
 if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)||endpoint.username||endpoint.password)throw Error('Desktop Live requires a loopback service.');
 if(typeof sdp!=='string'||!sdp.startsWith('v=')||sdp.length>100000)throw Error('Invalid SDP.');
 const {session}=JSON.parse(fs.readFileSync(config.accessFile,'utf8'));
 if(typeof session!=='string'||!session)throw Error('Live service credentials are unavailable.');
 const origin=new URL(config.origin).origin;
 const result=await new Promise((resolve,reject)=>{
  const request=http.request(new URL('/api/live-session',endpoint),{method:'POST',headers:{Host:new URL(origin).host,Origin:origin,Cookie:`agentbox_session=${session}`,'Content-Type':'application/json'}},response=>{
   let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk});response.on('error',reject);response.on('end',()=>{if(response.statusCode!==201&&response.statusCode!==200)return reject(Error(`Live service refused the connection (${response.statusCode}).`));try{resolve(JSON.parse(body))}catch(error){reject(error)}});
  });
  request.setTimeout(30000,()=>request.destroy(Error('Live service timed out.')));request.on('error',reject);request.end(JSON.stringify({sdp,desktop:true}));
 });
 if(typeof result.transport?.sdp!=='string')throw Error('Live service returned no SDP answer.');
 return {transport:{sdp:result.transport.sdp}};
}

export async function desktopTranscribe(config,audio,mime){
 if(!config)throw Error('Der vorhandene Sprachdienst ist nicht eingerichtet.');
 const endpoint=new URL(config.url);
 if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)||endpoint.username||endpoint.password)throw Error('Diktat benötigt einen lokalen Sprachdienst.');
 if(!(audio instanceof ArrayBuffer)||audio.byteLength<44||audio.byteLength>18*1024*1024)throw Error('Ungültige oder zu große Aufnahme.');
 const type=String(mime).split(';')[0];if(!['audio/webm','audio/mp4','audio/wav','audio/ogg','audio/mpeg'].includes(type))throw Error('Unbekanntes Audioformat.');
 const {session}=JSON.parse(fs.readFileSync(config.accessFile,'utf8'));if(!session)throw Error('Sprachdienst-Zugang fehlt.');const origin=new URL(config.origin).origin;
 return new Promise((resolve,reject)=>{const req=http.request(new URL('/api/transcribe',endpoint),{method:'POST',headers:{Host:new URL(origin).host,Origin:origin,Cookie:`agentbox_session=${session}`,'Content-Type':type}},res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk});res.on('end',()=>{try{const data=JSON.parse(body);if(res.statusCode!==200||typeof data.text!=='string'||!data.text.trim())return reject(Error(data.error||'Transkription fehlgeschlagen.'));resolve({text:data.text})}catch{reject(Error('Ungültige Antwort des Sprachdienstes.'))}});res.on('error',reject)});req.setTimeout(180000,()=>req.destroy(Error('Transkription dauert zu lange. Aufnahme kann erneut versucht werden.')));req.on('error',reject);req.end(Buffer.from(audio));});
}
