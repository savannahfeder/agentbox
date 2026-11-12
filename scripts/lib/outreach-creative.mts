type Creative={hero?:{url?:string;headline?:string;checkedAt?:string;motion?:string};headlines?:string[]};
export function validateCreative(film:{creative?:Creative;company?:{siteMotionFile?:string}}) {
  const creative=film.creative,hero=creative?.hero;
  if(!hero?.url?.startsWith('https://')||!hero.headline?.trim()||!hero.checkedAt||!Number.isFinite(Date.parse(hero.checkedAt)))throw new Error('Refresh and record the current hero reference before exporting');
  if(hero.motion!=='static'&&!film.company?.siteMotionFile)throw new Error('Animated or unknown hero needs a verified motion recording; static replay cannot preserve it');
  const headlines=creative?.headlines;
  if(!headlines||headlines.length!==3||new Set(headlines).size!==3)throw new Error('Write three distinct headline proposals');
  for(const headline of headlines){
    const sentences=headline.trim().split(/[.!?]+/).filter(part=>part.trim());
    if(sentences.length!==1||/[\n:;—]/.test(headline)||headline.trim().split(/\s+/).length<5)throw new Error('Each headline must be one clear sentence, without stacked fragments');
  }
}
