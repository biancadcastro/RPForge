"use client";
import {PageHeading} from './page-heading';
import { Folder } from "./icons";
import {useEffect,useState} from 'react';
import type {DesktopBridge} from "../lib/desktop";
import {useToast} from './toast';
import {userMessage} from '../lib/user-message';
import {Notice} from './notice';
export function HelpScreen({api}:{api?:DesktopBridge}) {
  const toast=useToast();
  const [info,setInfo]=useState<Awaited<ReturnType<DesktopBridge['appInfo']>>>(),[failed,setFailed]=useState(false);
  useEffect(()=>{void api?.appInfo().then(setInfo).catch(()=>setFailed(true));},[api]);
  return (
    <main className="help-page wrap">
<PageHeading title="Ajuda" description="Escolha, revise e crie. Seus arquivos originais ficam preservados."/>
      {info?.environment?.local&&<Notice tone="warning" className="environment-notice" title={info.environment.label}><p>Este app está conectado à API local {info.environment.api} e ao site local {info.environment.site}. A conta, a licença e os dados deste modo ficam em um perfil separado e não valem em produção.</p></Notice>}
      <div className="help-grid">
        <section>
          <span className="step-number">01</span>
          <h2>Escolha os arquivos</h2>
          <p>
            Abra uma ferramenta pela barra lateral ou pelo botão direito do
            Windows e selecione a pasta ou a peça de origem.
          </p>
        </section>
        <section>
          <span className="step-number">02</span>
          <h2>Confira a saída</h2>
          <p>
            Ajuste os nomes, confira os avisos e escolha como tratar pastas
            existentes. Nada é gravado antes da sua confirmação.
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
            Clique com o botão direito em uma pasta ou peça e escolha Converter
            RPFs, Gerar YTYP, Roupas para OBJ, Roupas para Neon ou Separar pele
            com RPForge. A ação abre uma janela compacta; a configuração
            completa fica disponível quando você precisar.
          </p>
        </div>
      </div>
      <div className="help-grid">
        <section><h2>Planos Free e Pro</h2><p>Converter RPFs e Gerar YTYP funcionam sem conta. Roupas para OBJ, Roupas para Neon e Separar pele exigem o plano Pro. Em Separar pele, revise todos os níveis de detalhe e resolva as faces incertas antes de separar.</p></section>
        <section><h2>Dois computadores por conta</h2><p>A reconexão mantém a identidade desta instalação. Em Conta, abra Gerenciar conta e computadores para consultar as vagas e desconectar instalações antigas. Uma autorização já emitida pode continuar válida por até 72 horas sem internet.</p></section>
        <section><h2>Se houver uma interrupção</h2><p>Repita a operação com o mesmo destino para recuperar uma gravação interrompida. Backups e arquivos modificados são preservados. Se a recuperação pedir revisão manual, mantenha os temporários até conferir os resultados.</p></section>
      </div>
      <section className="help-version" aria-labelledby="help-version-title">
        <div><h2 id="help-version-title">Versão e suporte</h2><p>{info?`RPForge ${info.version}${info.development?' · ambiente de desenvolvimento':''}${info.environment?.local?' · '+info.environment.label.toLowerCase():''} · ${info.platform}`:failed?'Não foi possível ler a versão instalada.':'Carregando versão…'}</p><p>Para suporte, informe a versão, a ferramenta e a mensagem de erro. Nunca envie senha, códigos de recuperação ou arquivos de sessão.</p></div>
        <button className="button secondary" onClick={()=>void api?.openDownloads().catch(e=>toast({tone:'error',title:'Não foi possível abrir o site',message:userMessage(e)}))}>Instalação e atualização manual</button>
      </section>
    </main>
  );
}
