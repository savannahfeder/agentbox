const documentUrl=value=>{try{const u=new URL(value);u.search='';u.hash='';return u.href;}catch{return null;}};
export function terminalSenderAllowed(event,contents,allowedUrls=[new URL('../renderer/dist/index.html',import.meta.url).href,process.env.ZERO_DEV_URL].filter(Boolean)){
 if(!contents||event?.sender!==contents||!event.senderFrame||event.senderFrame!==contents.mainFrame||event.senderFrame.parent)return false;
 const url=documentUrl(event.senderFrame.url);
 return !!url&&allowedUrls.some(allowed=>documentUrl(allowed)===url);
}
