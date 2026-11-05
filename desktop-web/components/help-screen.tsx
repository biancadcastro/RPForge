"use client";
import {PageHeading} from './page-heading';
import { Arrow, Folder } from "./icons";
import {useEffect,useState} from 'react';
import type {DesktopBridge} from "../lib/desktop";
export function HelpScreen({api}:{api?:DesktopBridge}) {
  const [info,setInfo]=useState<Awaited<ReturnType<DesktopBridge['appInfo']>>>(),[error,setError]=useState('');
  useEffect(()=>{void api?.appInfo().then(setInfo).catch(e=>setError(e.message));},[api]);
  return (
    <main className="help-page wrap">
<PageHeading eyebrow="RPForge / Como usar" title="Como usar o RPForge" description="Escolha, revise e crie. Seus arquivos originais ficam preservados."/>
      <div className="help-grid">
        <section><h2>Versão e suporte</h2><p>{info?`RPForge ${info.version}${info.development?' · ambiente de desenvolvimento':''} · ${info.platform} · Electron ${info.electron}`:'Carregando versão…'}</p><p>Para suporte, informe a versão, a ferramenta e a mensagem de erro. Nunca envie senha, códigos de recuperação ou arquivos de sessão.</p><button className="button secondary" onClick={()=>void api?.openDownloads().catch(e=>setError(e.message))}>Instalação e atualização manual</button>{error&&<p role="alert">{error}</p>}</section>
        <section>
          <span className="step-number">01</span>
          <h2>Escolha os arquivos</h2>
          <p>
            Abra Converter RPFs ou Gerar YTYP no menu Ferramentas e selecione a
            pasta de origem.
          </p>
        </section>
        <section>
          <span className="step-number">02</span>
          <h2>Confira a saída</h2>
          <p>
            Na conversão, ajuste os nomes, confira os avisos e escolha como
            tratar pastas existentes. Revise antes de gravar.
          </p>
        </section>
        <section>
          <span className="step-number">03</span>
          <h2>Leve ao servidor</h2>
          <p>
            Abra o resultado, adicione o recurso ao servidor e teste no FiveM.
            Seus arquivos originais são preservados.
          </p>
        </section>
      </div>
      <div className="help-note">
        <Folder />
        <div>
          <h3>Ações rápidas no Windows</h3>
          <p>
            Converter RPF e gerar YTYP pelo menu de contexto usam uma janela
            compacta. A configuração completa fica disponível quando você
            precisar.
          </p>
        </div>
      </div>
      <div className="help-grid">
        <section><h2>Ferramentas Free e Pro</h2><p>Converter RPFs e gerar YTYP funcionam sem conta. Exportar OBJ, converter Neon e separar pele exigem o plano Pro. Na separação, revise todos os LODs e resolva as faces incertas antes de exportar.</p></section>
        <section><h2>Dois computadores por conta</h2><p>A reconexão mantém a identidade desta instalação. Em Conta, abra Gerenciar conta e computadores para consultar as vagas e desconectar instalações antigas. Uma licença offline já emitida pode continuar válida por até 72 horas.</p></section>
        <section><h2>Se houver uma interrupção</h2><p>Repita a operação com o mesmo destino para recuperar uma gravação interrompida. Backups e arquivos modificados são preservados. Se a recuperação pedir revisão manual, mantenha os temporários até conferir os resultados.</p></section>
      </div>
    </main>
  );
}
