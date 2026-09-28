export function remotePreviewCommand(href,text){
 const url=new URL(href);
 return url.hostname==='127.0.0.1'&&['A','B','C'].includes(url.searchParams.get('remotePreview'))&&/^\/(remote-control|rc)$/.test(text.trim());
}
