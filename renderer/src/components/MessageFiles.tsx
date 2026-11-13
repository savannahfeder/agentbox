import {useEffect,useState} from 'react';
import {api} from '../api';
import {docKind} from '../doc-pane';
import {glanceFile,type Glance} from '../file-glance';
import {ArtifactThumbnail} from './ArtifactThumbnail';
import {FileCover} from './FileCover';
import {shownName} from '../../../shared/artifact-marks.mts';
import {carryLine} from '../../../shared/carried-files.mts';
import './message-files.css';

const KIND_LABEL={html:'Design',image:'Picture',markdown:'Document',code:'Code',website:'Website',pdf:'PDF',film:'Film',deck:'Slides'} as const;
type TileKind=keyof typeof KIND_LABEL;
const tileKind=(path:string):TileKind|null=>(/\.pptx(?:[?#]|$)/i.test(path) ? 'deck' : docKind(path));
const COMING_LOOKS_MS=3000;
// Said "Not delivered" to a reader: the sender may press Try again.
const FAILED_LOOKS_MS=15000;

/** EVERY FILE A MESSAGE NAMES, AS SMALL FRAMED TILES SIDE BY SIDE
 * (w-9ed13d72b3). These replaced a 200px card per file that printed the raw
 * markdown, `#` marks and all, and drew an empty "Preview unavailable" box for
 * any file it could not read. Picked over rows, chips and no previews, then
 * over three other tile faces and three other corner marks: a picture for a
 * design, a small page for a document, the window's corner marks tucked onto
 * the picture's corners, and the name with its kind underneath. */
export function MessageFiles({product,paths,revision,openDoc,onOpen}:{product:string;paths:string[];revision:number;openDoc?:string|null;onOpen:(path:string)=>void}) {
  if (!paths.length) return null;
  return <div className="message-files" aria-label="Files">
    {paths.map(path=><MessageFile key={path} product={product} path={path} revision={revision} open={openDoc===path} onOpen={()=>onOpen(path)}/>)}
  </div>;
}

/** A file nothing can read gets no tile; the message still names it.
 * The tile opens the file beside the task, as the card it replaced did. */
function MessageFile({product,path,revision,open,onOpen}:{product:string;path:string;revision:number;open:boolean;onOpen:()=>void}) {
  // undefined until the first read answers. A refresh keeps the tile it had
  // until the new read lands, rather than taking it away and back.
  const [glance,setGlance]=useState<Glance|null|undefined>(undefined);
  const [looks,setLooks]=useState(0);
  useEffect(()=>{
    let live=true;
    let timer:ReturnType<typeof setTimeout>|undefined;
    glanceFile(api,product,path).then(g=>{
      if(!live)return;
      setGlance(g);
      const state=g?.carry?.state;
      if(g?.coming || state==='coming' || state==='offline')timer=setTimeout(()=>setLooks(n=>n+1),COMING_LOOKS_MS);
      else if(state==='failed')timer=setTimeout(()=>setLooks(n=>n+1),FAILED_LOOKS_MS);
    });
    return ()=>{live=false;if(timer)clearTimeout(timer);};
  },[product,path,revision,looks]);
  const name=shownName(path) || path;
  const kind=tileKind(path);
  // How long the file is, once its cover has read it: "5 slides", "0:12".
  const [size,setSize]=useState<string|null>(null);
  if (glance===undefined) return <span className="message-file" aria-hidden="true">
    <span className="message-file-face arriving"/>
    <span className="message-file-foot"><span className="message-file-name">{name}</span><span className="message-file-kind">{kind ? KIND_LABEL[kind] : 'File'}</span></span>
  </span>;
  if (!glance) return null;
  const said=carryLine(glance.carry);
  const retry=()=>{api.retryFile({product,src:path}).finally(()=>setLooks(n=>n+1));};
  // Not here yet, or not going to be: the tile holds its place and says why.
  if (glance.coming || glance.missing) return <span className="message-file-slot">
    <button type="button" className="message-file" title={glance.line ?? `Open ${name}`} onClick={onOpen}>
      <span className={said?.state==='failed' ? 'message-file-face' : 'message-file-face arriving'}/>
      <span className="message-file-foot"><span className="message-file-name">{name}</span><span className="message-file-kind">{kind ? KIND_LABEL[kind] : 'File'}</span></span>
    </button>
    <FileState said={said ?? {state:'coming',label:'On its way',percent:null,retry:false}} onRetry={retry}/>
  </span>;
  const covered=(kind==='deck' || kind==='pdf' || kind==='film' || kind==='image') && glance.opened;
  return <span className="message-file-slot">
    <button type="button" className="message-file" data-kind={kind ?? 'file'} aria-pressed={open} title={`Open ${name}`} onClick={onOpen}>
      <span className="message-file-face">
        {covered ? <FileCover kind={kind} opened={glance.opened!} onSize={setSize}/>
          : kind==='html' || kind==='image' ? <ArtifactThumbnail product={product} path={path} revision={revision}/>
          : <MiniPage title={glance.title || name} blocks={glance.blocks}/>}
        {kind==='film' && size && <span className="message-file-badge">{size}</span>}
      </span>
      <span className="message-file-foot"><span className="message-file-name">{name}</span><span className="message-file-kind">{kind==='film' || !size ? (kind ? KIND_LABEL[kind] : 'File') : size}</span></span>
    </button>
    {said && <FileState said={said} onRetry={retry}/>}
  </span>;
}

/** How the file got to the people on the thread: Sent, On its way with how far, or Not delivered and why. */
function FileState({said,onRetry}:{said:NonNullable<ReturnType<typeof carryLine>>;onRetry:()=>void}) {
  return <span className={`message-file-state ${said.state}`} role="status">
    <span className="message-file-state-words">{said.label}</span>
    {said.percent!==null && <span className="message-file-bar" aria-hidden="true"><i style={{width:`${said.percent}%`}}/></span>}
    {said.retry && <button type="button" className="message-file-retry" onClick={onRetry}>Try again</button>}
  </span>;
}

/** A document drawn as a small page: its title and opening lines, set as
 * text, so it reads like the page it opens into rather than its source. */
function MiniPage({title,blocks}:{title:string;blocks:Glance['blocks']}) {
  return <span className="message-file-page" aria-hidden="true">
    <b>{title}</b>
    {blocks.map((b,i)=>b.heading ? <em key={i}>{b.text}</em> : <span key={i}>{b.text}</span>)}
  </span>;
}
