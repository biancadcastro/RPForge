export type PixelKind='check'|'folder'|'shield'|'arrow'|'info'|'warning'|'error'|'close';
export function PixelSymbol({kind}:{kind:PixelKind}){
 const paths:Record<PixelKind,string>={check:'M2 9h3v3h3V9h3V6h3V3h3v6h-3v3h-3v3H8v3H5v-3H2z',folder:'M2 4h7v2h9v12H2zm2 2v10h12V8H8V6z',shield:'M8 2h4v2h6v9h-2v3h-3v2H7v-2H4v-3H2V4h6zm0 4H4v6h2v3h3v1h2v-1h3v-3h2V6h-5V4H9v2z',arrow:'M11 3h3v3h3v3h3v3h-3v3h-3v3h-3v-6H2V9h9z',
  info:'M6 2h10v2h2v2h2v10h-2v2h-2v2H6v-2H4v-2H2V6h2V4h2zm4 4v3h2V6zm0 5v6h2v-6z',
  warning:'M10 1h2v3h2v4h2v4h2v4h2v5H2v-5h2v-4h2V8h2V4h2zm0 7v6h2V8zm0 8v2h2v-2z',
  error:'M6 2h10v2h2v2h2v10h-2v2h-2v2H6v-2H4v-2H2V6h2V4h2zm1 5v2h2v2H7v2h2v-2h4v2h2v-2h-2V9h2V7h-2v2H9V7z',
  close:'M4 4h3v3h2v2h4V7h2V4h3v3h-3v3h-2v2h2v3h3v3h-3v-3h-2v-2H9v2H7v3H4v-3h3v-3h2v-2H7V7H4z'};
 return <svg viewBox="0 0 22 22" aria-hidden="true" fill="currentColor" shapeRendering="crispEdges"><path fillRule="evenodd" d={paths[kind]}/></svg>;
}
