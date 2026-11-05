"use client";
import { Arrow, Folder } from "./icons";
import { tools, Screen } from "../lib/desktop";
export function HelpScreen() {
  return (
    <main className="help-page wrap">
      <p className="breadcrumb">RPForge / Como usar</p>
      <h1>
        Como usar o RPForge
      </h1>
      <div className="help-grid">
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
    </main>
  );
}
