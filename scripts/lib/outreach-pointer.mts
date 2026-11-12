type Anchor={t:number;delta:number[]};
export function smoothPointer(at:(t:number)=>number[]|null,t:number) {
  const total=[0,0];let weights=0;
  for(let i=-50;i<=50;i++){
    const point=at(t+i*.004);if(!point)continue;
    const weight=Math.exp(-.5*(i/25)**2);weights+=weight;
    total[0]+=point[0]*weight;total[1]+=point[1]*weight;
  }
  return weights?total.map(value=>value/weights):null;
}
export function anchoredPointer(point:number[],t:number,anchors:Anchor[]) {
  if(!anchors.length)return point;
  let before=anchors[0],after=anchors.at(-1)!;
  for(const anchor of anchors){if(anchor.t<=t)before=anchor;else{after=anchor;break;}}
  const u=after.t>before.t?Math.max(0,Math.min(1,(t-before.t)/(after.t-before.t))):0;
  const eased=u*u*u*(10-15*u+6*u*u);
  return point.map((value,i)=>value+before.delta[i]+(after.delta[i]-before.delta[i])*eased);
}
