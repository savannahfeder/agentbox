import {limitRows} from '../../../shared/usage.mjs';
import {agoQuiet} from '../format';
import type {Usage} from '../types';
export function UsageOverview({readings,now}: {readings:Usage[];now:number}) {
 const available=readings.filter(reading=>reading.limits.length);
 return <section className="settings-usage" aria-label="Usage">
  <h2>Usage</h2>
  {!available.length ? <p className="settings-usage-empty">No usage reading yet. Your coding agents’ limits will appear here when available.</p> :
  <div className="settings-usage-grid">{available.map(reading=><section key={reading.engine} className="settings-usage-provider" aria-label={reading.engine==='codex'?'Codex':'Claude Code'}>
   <h3>{reading.engine==='codex'?'Codex':'Claude Code'}</h3>
   {limitRows(reading.limits,now).map(row=><div className="settings-usage-window" key={row.key}>
    <div><span>{row.name}</span><span>{row.used}% used</span></div>
    <span className="usage-meter wide" aria-hidden="true"><i style={{width:`${row.used}%`}}/></span>
    {row.when && <p>{row.when}</p>}
   </div>)}
   <small>{agoQuiet(reading.at,now)==='now'?'Read just now':`Read ${agoQuiet(reading.at,now)} ago`}</small>
  </section>)}</div>}
 </section>;
}
