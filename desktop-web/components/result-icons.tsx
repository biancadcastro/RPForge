export function PixelSymbol({kind}:{kind:'check'|'folder'|'shield'|'arrow'}){
 const paths={check:'M2 9h3v3h3V9h3V6h3V3h3v6h-3v3h-3v3H8v3H5v-3H2z',folder:'M2 4h7v2h9v12H2zm2 2v10h12V8H8V6z',shield:'M8 2h4v2h6v9h-2v3h-3v2H7v-2H4v-3H2V4h6zm0 4H4v6h2v3h3v1h2v-1h3v-3h2V6h-5V4H9v2z',arrow:'M11 3h3v3h3v3h3v3h-3v3h-3v3h-3v-6H2V9h9z'};
 return <svg viewBox="0 0 22 22" aria-hidden="true" fill="currentColor" shapeRendering="crispEdges"><path fillRule="evenodd" d={paths[kind]}/></svg>;
}
