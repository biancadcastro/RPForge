export function AtelierIcon({name}:{name:string}){
 const paths:Record<string,React.ReactNode>={
  eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,hidden:<><path d="M3 3l18 18M10 5a12 12 0 0 1 12 7 18 18 0 0 1-4 5M6 6a18 18 0 0 0-4 6s4 7 10 7a12 12 0 0 0 4-1"/></>,
  undo:<><path d="M9 4L3 10l6 6M3 10h11a6 6 0 0 1 0 12"/></>,wire:<><path d="m12 2 9 5v10l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v10M7 4.5l10 15M17 4.5 7 19.5"/></>,
  fit:<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>,pan:<><path d="M9 12V5a2 2 0 0 1 4 0v7M13 7a2 2 0 0 1 4 0v5M17 9a2 2 0 0 1 4 0v6c0 5-3 7-7 7h-1c-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l3 3"/></>,zoom:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/></>,
  file:<><path d="M5 2h9l5 5v15H5ZM14 2v6h5"/></>,check:<path d="m5 12 4 4L19 6"/>,warning:<><path d="m12 3 10 18H2ZM12 9v5M12 17h.01"/></>,shield:<><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z"/><path d="m8 11 3 3 5-6"/></>,chevron:<path d="m9 5 7 7-7 7"/>,swap:<><path d="M4 6h16M16 2l4 4-4 4M20 18H4M8 14l-4 4 4 4"/></>,
 };
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.file}</svg>;
}
