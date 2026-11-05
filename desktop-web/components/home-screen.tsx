"use client";
import {Arrow,WorkspaceIcon} from './icons';
import {tools,type Screen} from '../lib/desktop';
export function HomeScreen({navigate}:{navigate:(screen:Screen)=>void}){
 return <main className="home wrap app-home"><div className="page-heading"><h1>Ferramentas</h1><p>Escolha uma operação para começar.</p></div>
 <div className="home-tool-groups">{[{title:'Arquivos e recursos',ids:['converter','ytyp']},{title:'Roupas e geometria',ids:['clothing','skin','neon']}].map(group=><section key={group.title} className="home-tool-group"><h2>{group.title}</h2><div className="home-tool-list">{tools.filter(tool=>group.ids.includes(tool.id)).map(tool=><button key={tool.id} className="home-tool-row" onClick={()=>navigate(tool.id)}><span className="home-tool-icon"><WorkspaceIcon kind={tool.id}/></span><span className="home-tool-copy"><strong>{tool.title}</strong><span>{tool.description}</span></span><span className="home-file-type">{tool.badge}</span><Arrow/></button>)}</div></section>)}</div>
 <div className="home-shortcut-note"><WorkspaceIcon kind="home"/><p>As ferramentas também estão disponíveis no botão direito do Windows. Os arquivos são processados no seu computador.</p><button onClick={()=>navigate('help')}>Ver instruções <Arrow/></button></div></main>;
}
