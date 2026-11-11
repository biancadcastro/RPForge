"use client";
import {PageHeading} from './page-heading';
import {Arrow,WorkspaceIcon} from './icons';
import {tools,type Screen} from '../lib/desktop';
export function HomeScreen({navigate}:{navigate:(screen:Screen)=>void}){
 return <main className="home wrap app-home"><PageHeading title="Ferramentas" description="Escolha uma operação para começar."/>
 <div className="home-tool-groups">{[{title:'Arquivos e recursos',ids:['converter','ytyp']},{title:'Roupas',ids:['clothing','neon','skin']}].map(group=><section key={group.title} className="home-tool-group"><h2>{group.title}</h2><div className="home-tool-list">{group.ids.map(id=>tools.find(tool=>tool.id===id)!).map(tool=><button key={tool.id} className="home-tool-row" onClick={()=>navigate(tool.id)}><span className="home-tool-icon"><WorkspaceIcon kind={tool.id}/></span><span className="home-tool-copy"><strong>{tool.title}</strong><span>{tool.description}</span></span><span className="home-file-type">{tool.badge}</span><span className={'home-access home-access--'+tool.access}>{tool.access==='pro'?'Pro':'Free'}</span><Arrow/></button>)}</div></section>)}</div>
 <div className="home-shortcut-note"><WorkspaceIcon kind="home"/><p>As ferramentas também estão disponíveis no botão direito do Windows. Os arquivos são processados no seu computador.</p><button className="button ghost" onClick={()=>navigate('help')}>Abrir a Ajuda <Arrow/></button></div>
 <aside className="home-transition" aria-labelledby="transition-title"><h2 id="transition-title">O que muda depois</h2><p>O RPForge está preparando um workspace no site para revisar e aprovar tarefas no navegador. Quando ele for liberado, este aplicativo continua responsável pelo botão direito do Windows, pelas transferências e por gravar os resultados no destino escolhido. Nada muda nesta versão: as ferramentas acima seguem funcionando localmente.</p></aside></main>;
}
