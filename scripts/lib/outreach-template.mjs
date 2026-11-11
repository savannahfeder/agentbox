export const escapeHtml = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function makeBindings(source) {
  const byText = new Map();
  function visit(value, path) {
    if (typeof value === 'string' && value.trim().length >= 2 && !/File$/.test(path.at(-1) ?? '') && !['key','slug','id','state','from','assignee','engine','avatar'].includes(path.at(-1))) {
      const entry = byText.get(value) ?? { source: value, paths: [], token: `__OUTREACH_${byText.size}__` };
      entry.paths.push(path);
      byText.set(value, entry);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
    }
  }
  visit(source, []);
  return [...byText.values()];
}

function get(object, path) {
  for (const part of path) object = object?.[part];
  return object;
}

export function inject(html, bindings, target) {
  const byToken = new Map(bindings.map((b) => [b.token, b]));
  return html.replace(/__OUTREACH_\d+__/g, (token) => {
    const binding = byToken.get(token);
    if (!binding) throw new Error(`Unknown binding ${token}`);
    const values = binding.paths.map((path) => get(target, path));
    if (values.some((v) => typeof v !== 'string')) throw new Error(`Missing field ${binding.paths.map((p) => p.join('.')).join(', ')}`);
    if (new Set(values).size > 1) throw new Error(`Ambiguous field ${binding.source}`);
    return escapeHtml(values[0]);
  });
}

export function validateTimeline(frames, duration, fps = 30) {
  const step = 1 / fps;
  if (!frames.length || frames[0].t > step) throw new Error('Opening capture gap');
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].t <= frames[i - 1].t) throw new Error('Capture order is invalid');
    if (frames[i].t - frames[i - 1].t > step * 4.5) throw new Error(`Capture gap at ${frames[i - 1].t}`);
  }
  if (duration - frames.at(-1).t > step * 2.1) throw new Error('Ending capture gap');
}

export function sceneAt(frames, t) {
  let lo = 0, hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return frames[Math.max(0, lo - 1)];
}

export function pointerAt(frames, t) {
  const frame=sceneAt(frames,t),next=frames[Math.min(frames.indexOf(frame)+1,frames.length-1)];
  const point=f=>{
    const match=f.html.match(/id="film-pointer"[^>]*style="[^"]*translate:\s*([-\d.]+)px\s+([-\d.]+)px/);
    return match?[Number(match[1]),Number(match[2])]:null;
  };
  const a=point(frame),b=point(next);
  if(!a||!b)return a;
  const u=next.t>frame.t?Math.max(0,Math.min(1,(t-frame.t)/(next.t-frame.t))):0;
  return a.map((v,i)=>v+(b[i]-v)*u);
}

export function recordingTime(beats, t) {
  const points=[[0,0]];
  for(const [planned,actual]of beats) {
    if(planned===null)continue;
    const [previous,offset]=points.at(-1),room=.15*Math.max(0,planned-previous);
    points.push([planned,Math.min(Math.max(actual-planned,offset-room),offset+room)]);
  }
  let i=0;
  while(i+1<points.length&&points[i+1][0]<=t)i++;
  const [start,offset]=points[i],next=points[i+1];
  if(!next)return t+offset;
  const u=Math.max(0,Math.min(1,(t-start)/(next[0]-start)));
  return t+offset+(next[1]-offset)*u;
}

export function bridgeHold(before, after) {
  if(after.t-before.t>.3)throw new Error('Capture hold is too long to reconstruct');
  const logical=html=>html.replace(/ (style|title)="[^"]*"/g,'').replace(/\b(?:workspace-collapsed|gt-rail-open)\b/g,'').replace(/(width|height)="\d+"/g,'$1="size"').replace(/\s+/g,' ');
  if(before.site!==after.site||before.switcher!==after.switcher||JSON.stringify(before.scroll)!==JSON.stringify(after.scroll)||logical(before.html)!==logical(after.html))throw new Error('Capture gap crosses a content change');
  const frames=[];
  for(let k=1;before.t+k/30<after.t-1e-9;k++) {
    const t=before.t+k/30,point=pointerAt([before,after],t);
    const html=point?before.html.replace(/(id="film-pointer"[^>]*style="[^"]*translate:\s*)[-\d.]+px\s+[-\d.]+px/,(_,prefix)=>`${prefix}${point[0]}px ${point[1]}px`):before.html;
    frames.push({...before,t,html,staticHold:true});
  }
  return frames;
}

export function replayKey(frame,html) {
  return html.replace(/(<div id="film-pointer"[^>]*style="[^"]*?)translate:[^;"]+;?/,'$1')+JSON.stringify(frame.scroll);
}

export async function pointerSprite(browser,html) {
  const context=await browser.newContext({viewport:{width:29,height:29},deviceScaleFactor:2});
  try {
    const page=await context.newPage();
    await page.setContent('<style>html,body{margin:0;background:transparent;width:29px;height:29px}</style>');
    await page.evaluate(html=>{document.body.innerHTML=new DOMParser().parseFromString(html,'text/html').getElementById('film-pointer').querySelector('svg').outerHTML;},html);
    const png=await page.screenshot({omitBackground:true});
    if(png[25]!==6)throw new Error('Pointer sprite must retain its alpha channel');
    return png;
  } finally {await context.close();}
}

export function validateReplay(frames, duration) {
  validateTimeline(frames, duration);
  if (frames.some((f) => f.t >= 5.4 && (f.site || f.switcher))) {
    throw new Error('Homepage transition stalled after 5.4s');
  }
}

export function injectDOM({bindings,target,source}) {
  const get=(object,path)=>path.reduce((v,k)=>v?.[k],object);
  const byToken=new Map(bindings.map(b=>[b.token,b]));
  const embedded=bindings.filter(b=>b.source.length>=7).sort((a,b)=>b.source.length-a.source.length);
  const textOf=(el)=>el?.textContent??'';
  const personOf=(el)=>{
    const area=el.closest('.hm-mate,.td-person');
    if(!area)return null;
    return source.team.people.findIndex(p=>bindings.some(b=>b.source===p.name&&textOf(area).includes(b.token)));
  };
  const choose=(binding,el)=>{
    let paths=binding.paths;
    const person=personOf(el);
    const team=paths.filter(p=>p[0]==='team'&&(person===null||Number(p[2])===person));
    const core=paths.filter(p=>p[0]!=='team');
    paths=person!==null&&team.length?team:core.length?core:paths;
    if(person!==null) {
      const line=el.closest('.td-line');
      const section=line?.closest('[data-group="working"]');
      const index=section?[...section.querySelectorAll('.td-line')].indexOf(line):0;
      const thread=paths.filter(p=>p[3]==='threads'&&Number(p[4])===index);
      if(thread.length)paths=thread;
    }
    if(paths.some(p=>p[0]==='projects')) {
      const row=el.closest('.hm-row,.row,.td-line');
      if(row) {
        const titleBinding=bindings.find(b=>textOf(row).includes(b.token)&&b.paths.some(p=>p.at(-1)==='title'));
        if(titleBinding) {
          let titles=titleBinding.paths.filter(p=>p.at(-1)==='title'&&(person!==null?p[0]==='team'&&Number(p[2])===person:p[0]!=='team'));
          const record=titles[0]&&get(target,titles[0].slice(0,-1));
          if(record?.project) return target.projects.find(p=>p.slug===record.project)?.name??record.project;
        }
      }
    }
    const values=paths.map(p=>get(target,p));
    if(values.some(v=>typeof v!=='string'))throw new Error(`Missing replay field ${binding.source}`);
    if(new Set(values).size>1)throw new Error(`Ambiguous replay field ${binding.source}`);
    return values[0];
  };
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const changes=[];
  const projectLabels=[];
  const notes=[];
  for(const row of document.querySelectorAll('.row,.hm-row')) {
    if(row.matches('.hm-mate'))continue;
    const b=bindings.find(b=>textOf(row).includes(b.token)&&b.paths.some(p=>p.at(-1)==='title'&&p[0]!=='team'));
    const p=b?.paths.find(p=>p.at(-1)==='title'&&p[0]!=='team');
    const record=p&&get(target,p.slice(0,-1));
    const project=record&&target.projects.find(p=>p.slug===record.project);
    const label=row.querySelector('.th-cell-proj')??[...row.querySelectorAll('.hm-tag')].at(-1);
    if(project&&label)projectLabels.push([label,project.name]);
    if(record?.key==='maya'&&row.matches('.row')) {
      const title=row.querySelector('.th-cell-title');
      if(title)notes.push([title,`Maya commented: ${record.comment}`]);
    }
  }
  for(let node=walker.nextNode();node;node=walker.nextNode()) {
    if(node.parentElement.closest('style,script'))continue;
    let text=node.textContent;
    for(const binding of embedded) {
      if(text.includes(binding.source))text=text.split(binding.source).join(binding.token);
    }
    if(!/__OUTREACH_\d+__/.test(text))continue;
    changes.push([node,text.replace(/__OUTREACH_\d+__/g,token=>{
      const b=byToken.get(token);
      if(!b)throw new Error(`Unknown replay field ${token}`);
      return choose(b,node.parentElement);
    })]);
  }
  for(const [node,text]of changes)node.textContent=text;
  for(const [node,text]of projectLabels)node.textContent=text;
  for(const [node,text]of notes) {
    const note=node.querySelector('.th-aside')??document.createElement('span');
    note.className='th-aside';note.textContent=text;
    if(!note.parentElement)node.append(note);
  }
  for(const el of document.querySelectorAll('[title]'))el.title=el.title.replaceAll(source.company.name,target.company.name).replaceAll(source.company.domain??'\0',target.company.domain??'');
  const mark=document.querySelector('.th-mark');
  if(mark)mark.textContent=target.company.name[0];
}

export function cameraBox(events, t, width = 1440, height = 810) {
  const full = [0,0,width,height];
  const smooth = (u) => {u=Math.max(0,Math.min(1,u));return u*u*u*(10-15*u+6*u*u);};
  const lerp = (seg,at) => seg.from.map((v,i)=>v+(seg.to[i]-v)*smooth((at-seg.t)/seg.dur));
  let seg = null;
  for (const event of events) {
    if (event.t>t) break;
    const from = seg ? lerp(seg,event.t) : full;
    let to = full;
    if (event.rect) {
      const [l,top,w,h]=event.rect;
      const scale=Math.max(1,Math.min(event.scale||Math.min(2,.8*width/w,.8*height/h),.94*width/w,.94*height/h,2.2));
      const cw=width/scale,ch=height/scale;
      const cx=Math.min(Math.max(l+w/2,cw/2),width-cw/2),cy=Math.min(Math.max(top+h/2,ch/2),height-ch/2);
      to=[cx-cw/2,cy-ch/2,cx+cw/2,cy+ch/2];
    }
    seg={t:event.t,dur:event.dur,from,to};
  }
  return seg ? lerp(seg,t) : full;
}

export function captureDOM({ bindings }) {
  const root = document.documentElement;
  const clone = root.cloneNode(true);
  const original = [root, ...root.querySelectorAll('*')];
  const copied = [clone, ...clone.querySelectorAll('*')];
  const index = new Map(original.map((el, i) => [el, copied[i]]));
  const scroll = [];
  for (let i = 0; i < original.length; i++) {
    const el = original[i], other = copied[i];
    if (el.scrollTop || el.scrollLeft) {
      other.setAttribute('data-replay-scroll', String(scroll.length));
      scroll.push([el.scrollLeft, el.scrollTop]);
    }
    if (el instanceof HTMLTextAreaElement) other.textContent = el.value;
    if (el instanceof HTMLInputElement) other.setAttribute('value', el.value);
    if (el instanceof HTMLCanvasElement) {
      const im = document.createElement('img');
      for (const a of other.attributes) im.setAttribute(a.name, a.value);
      const style=getComputedStyle(el);
      for(const prop of ['display','position','width','height','top','left','right','bottom','opacity','transform','filter','z-index'])im.style.setProperty(prop,style.getPropertyValue(prop));
      const cache = (window.__outreachCanvasCache ??= new WeakMap());
      if (!cache.has(el)) cache.set(el, el.toDataURL());
      im.src = cache.get(el);
      other.replaceWith(im);
    }
  }
  for (const animation of document.getAnimations()) {
    const el = animation.effect?.target, other = index.get(el);
    if (!other || !(el instanceof Element)) continue;
    const style = getComputedStyle(el);
    for (const prop of ['transform', 'opacity', 'filter', 'clip-path']) other.style.setProperty(prop, style.getPropertyValue(prop));
  }
  for (const el of clone.querySelectorAll('script')) el.remove();
  const byText = new Map(bindings.map((b) => [b.source, b.token]));
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('style')) continue;
    const token = byText.get(node.textContent);
    if (token) node.textContent = token;
  }
  const el = document.getElementById('film-switcher');
  return {
    html: clone.querySelector('body').innerHTML + [...clone.children].filter(el=>!['HEAD','BODY'].includes(el.tagName)).map(el=>el.outerHTML).join(''),
    scroll,
    site: !!document.getElementById('film-site'),
    switcher: !!el?.classList.contains('on'),
  };
}
