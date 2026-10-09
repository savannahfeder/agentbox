import {useEffect,useState} from 'react';
import {api} from '../api';
import {docKind} from '../doc-pane';
import {glanceFile,type Glance} from '../file-glance';
import {ArtifactThumbnail} from './ArtifactThumbnail';
import './message-files.css';

const KIND_LABEL={html:'Design',image:'Picture',markdown:'Document',code:'Code'} as const;

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
  const [glance,setGlance]=useState<Glance|null>(null);
  useEffect(()=>{
    let live=true;
    setGlance(null);
    glanceFile(api,product,path).then(g=>{if(live)setGlance(g);});
    return ()=>{live=false;};
  },[product,path,revision]);
  if (!glance) return null;
  const name=path.split('/').pop() ?? path;
  const kind=docKind(path);
  const picture=kind==='html' || kind==='image';
  return <button type="button" className="message-file" aria-pressed={open} title={`Open ${name}`} onClick={onOpen}>
    <span className="message-file-face">
      {picture ? <ArtifactThumbnail product={product} path={path} revision={revision}/> : <MiniPage title={glance.title || name} blocks={glance.blocks}/>}
      <i className="tick tl"/><i className="tick tr"/><i className="tick bl"/><i className="tick br"/>
    </span>
    <span className="message-file-foot"><span className="message-file-name">{name}</span><span className="message-file-kind">{kind ? KIND_LABEL[kind] : 'File'}</span></span>
  </button>;
}

/** A document drawn as a small page: its title and opening lines, set as
 * text, so it reads like the page it opens into rather than its source. */
function MiniPage({title,blocks}:{title:string;blocks:Glance['blocks']}) {
  return <span className="message-file-page" aria-hidden="true">
    <b>{title}</b>
    {blocks.map((b,i)=>b.heading ? <em key={i}>{b.text}</em> : <span key={i}>{b.text}</span>)}
  </span>;
}
