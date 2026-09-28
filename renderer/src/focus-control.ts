export type FocusControlStyle = 'text'|'corners'|'corners-icon'|'corners-bare'|'layout';
export function focusControl(style:FocusControlStyle,focused:boolean) {
 return {label:focused?'Exit Focus':'Focus',hint:focused?'Return to the task · Esc':'Give this document the full workspace',icon:style==='text'?null:`${style.startsWith('corners')?'corners':style}-${focused?'exit':'enter'}`};
}
