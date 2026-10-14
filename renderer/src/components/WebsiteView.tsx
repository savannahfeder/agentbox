import {createElement, useEffect, useRef} from 'react';

/** Desktop guests navigate normally; browser tabs still obey the site's framing policy. */
export function WebsiteView({src,title,desktop,ready,onReady,onError}: {
  src:string; title:string; desktop:boolean; ready?:boolean;
  onReady:()=>void; onError:(message:string)=>void;
}) {
  const guest=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    if(!desktop || !guest.current)return;
    const view=guest.current;
    const failed=(event:Event)=>{
      const failure=event as Event & {errorCode:number;errorDescription:string;isMainFrame:boolean};
      if(failure.isMainFrame && failure.errorCode!==-3)onError(`Die Webseite konnte nicht geladen werden: ${failure.errorDescription}. Du kannst sie in Chrome öffnen.`);
    };
    view.addEventListener('did-stop-loading',onReady);
    view.addEventListener('did-fail-load',failed);
    return ()=>{view.removeEventListener('did-stop-loading',onReady);view.removeEventListener('did-fail-load',failed);};
  },[src,desktop,onReady,onError]);
  const props={src,title,className:'doc-view',style:{opacity:ready?1:0}};
  return desktop
    ? createElement('webview',{...props,ref:guest,partition:'persist:websites',webpreferences:'contextIsolation=yes,sandbox=yes,nodeIntegration=no'})
    : <iframe {...props} onLoad={onReady} onError={()=>onError('Die Webseite konnte nicht geladen werden. Bitte in Chrome öffnen.')}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />;
}
