import {ArtifactControlGlyph} from './ArtifactControlGlyph';
import {focusControl,type FocusControlStyle} from '../focus-control';
export function FocusControl({style,focused,onClick}:{style:FocusControlStyle;focused:boolean;onClick:()=>void}) {
 const action=focusControl(style,focused);
 return <button type="button" className={`artifact-expand focus-mode-control${style==='corners-icon'||style==='corners-bare'?' focus-icon-only':''}${style==='corners-bare'?' focus-bare':''}`} title={action.hint} aria-label={action.label} onClick={onClick}>
 {action.icon && <ArtifactControlGlyph>
 {style.startsWith('corners') ? <path d={focused?'M3 7h4V3m6 0v4h4M3 13h4v4m6 0v-4h4':'M7 3H3v4m10-4h4v4M3 13v4h4m6 0h4v-4'}/> : <><rect x="2.5" y="3.5" width="15" height="13" rx="1"/>{focused?<><path d="M7.5 3.5v13M12 8l-2 2 2 2m-2-2h5"/></>:<rect x="6" y="6.5" width="8" height="7" rx=".5"/>}</>}
 </ArtifactControlGlyph>}
 {style!=='corners-icon' && style!=='corners-bare' && <span>{action.label}</span>}{focused && style==='text' && <kbd>Esc</kbd>}
 </button>;
}
