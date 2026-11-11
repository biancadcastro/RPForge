/** The single place that turns anything thrown into text for the person using the app.
 * The main process already sends friendly text; technical detail, when present, follows
 * DETAIL_MARKER (same marker as src/user-error.js) and is shown collapsed. */
export const DETAIL_MARKER='\n\nDetalhe técnico: ';
export const GENERIC_MESSAGE='Não foi possível concluir a operação. Tente de novo.';
export const NETWORK_MESSAGE='Sem conexão com o RPForge. Verifique a internet e tente de novo.';
export function userMessage(error:unknown,fallback=GENERIC_MESSAGE):string{
 let text=error instanceof Error?error.message:typeof error==='string'?error:'';
 text=text.replace(/^Error invoking remote method '[^']+':\s*/,'').replace(/^(?:[A-Z]\w*Error|Error):\s*/,'').trim();
 if(!text)return fallback;
 if(/^(?:fetch failed|Failed to fetch|NetworkError|net::ERR_)/i.test(text))return NETWORK_MESSAGE;
 if(/^(?:Cannot read|undefined is not|[a-z]+ is not a function|Unexpected token)/i.test(text))return fallback+DETAIL_MARKER+text;
 return text;
}
export function splitUserMessage(text:string){
 const at=text.indexOf(DETAIL_MARKER);
 return at<0?{message:text,detail:''}:{message:text.slice(0,at),detail:text.slice(at+DETAIL_MARKER.length)};
}
