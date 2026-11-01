const documentUrl=(value: string)=>{try{const u=new URL(value);u.search='';u.hash='';return u.href;}catch{return null;}};
export function terminalSenderAllowed(event: { sender?: unknown; senderFrame?: { url: string; parent?: unknown } | null } | null | undefined,contents: { mainFrame?: unknown } | null | undefined,allowedUrls: string[]=[new URL('../renderer/dist/index.html',import.meta.url).href,process.env.ZERO_DEV_URL].filter(Boolean) as string[]){
 if(!contents||event?.sender!==contents||!event.senderFrame||event.senderFrame!==contents.mainFrame||event.senderFrame.parent)return false;
 const url=documentUrl(event.senderFrame.url);
 return !!url&&allowedUrls.some(allowed=>documentUrl(allowed)===url);
}
