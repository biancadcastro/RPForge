"use client";
import {PageHeading} from './page-heading';
import {OperationResult} from "./operation-result";
import { Arrow, Folder } from "./icons";
import {
  Archive,
  Choices,
  DesktopBridge,
  Draft,
  Progress,
  Screen,
  ToolId,
  emptyDraft,
} from "../lib/desktop";
type Props = {
  id: ToolId;
  draft: Draft;
  busy: boolean;
  api?: DesktopBridge;
  quick: boolean;
  progress?: Progress;
  change: (id: ToolId, patch: Partial<Draft>) => void;
  navigate: (screen: Screen) => void;
  choose: (id: ToolId) => Promise<void>;
  edit: (archive: string, patch: Choices[string]) => void;
  perform: (
    id: ToolId,
    action: "preview" | "convert" | "ytyp",
    folder?: string,
    choices?: Choices,
    review?: boolean,
    bridge?: DesktopBridge,
  ) => Promise<void>;
};
function Issues({ items }: { items: Archive[] }) {
  const issues = items.flatMap((item) =>
    (item.audit?.issues ?? []).map((issue) => ({
      ...issue,
      archive: item.archive,
    })),
  );
  return issues.length ? (
    <div className="issues">
      {issues.map((issue, index) => (
        <p
          key={index}
          className={issue.severity === "error" ? "error-note" : "warning-note"}
        >
          <span>{issue.severity === "error" ? "Erro" : "Atenção"}</span>{" "}
          {issue.archive}: {issue.message}
        </p>
      ))}
    </div>
  ) : null;
}
export function ToolWorkspace({
  id,
  draft,
  busy,
  api,
  quick,
  progress,
  change,
  navigate,
  choose,
  edit,
  perform,
}: Props) {
  const selected = draft.items.filter(
    (item) => draft.choices[item.archive]?.selected !== false,
  );
  const valid =
    selected.length > 0 &&
    selected.every(
      (item) =>
        item.ok &&
        item.audit?.ok !== false &&
        (!item.exists || !!draft.choices[item.archive]?.existing),
    );
  const resultOk = draft.results.filter((item) => item.ok),
    failures = draft.results.filter((item) => !item.ok);
  const openResult = () => {
    const output = resultOk.find(item=>!!item.output)?.output;
    if (output)
      void api
        ?.openFolder(output)
        .catch((error) => change(id, { error: String(error) }));
  };
  if(!busy&&draft.step==='result')return <main className="tool-workspace wrap result-workspace"><OperationResult context={'Arquivos e recursos / '+(id==='ytyp'?'Gerar YTYP':'Converter RPFs')} title={resultOk.length?(id==='ytyp'?'YTYP gerado':'Seus recursos estão prontos'):'Confira o diagnóstico'} description={resultOk.length+' concluído(s)'+(failures.length?' · '+failures.length+' com falha ou cancelado(s)':'. Os originais foram preservados.')} cards={draft.results.map(item=>({title:item.archive,folder:item.output,error:item.ok?undefined:item.error||(item.cancelled?'Operação cancelada.':'Não foi possível concluir este item.'),files:item.ok?item.generated:undefined,onOpen:item.ok&&item.output?()=>void api?.openFolder(item.output!).catch(error=>change(id,{error:String(error)})):undefined}))} destination={draft.folder} onOpen={resultOk.some(item=>!!item.output)?openResult:undefined} openLabel="Abrir resultado" onReset={()=>quick?void api?.close():change(id,emptyDraft())} resetLabel={quick?'Concluir':'Nova operação'} diagnostics={<>{draft.results.some(item=>item.audit?.issues?.length)&&<details className="pixel-result-diagnostics"><summary>Avisos e diagnóstico</summary><Issues items={draft.results}/></details>}{draft.error&&<p className="error-note" role="alert">{draft.error}</p>}</>}><p className="pixel-result-detail">Confira o resultado no FiveM.</p></OperationResult></main>;
  return (
    <main className={quick ? "quick-workspace" : "tool-workspace wrap"}>
      {!quick && (
        <p className="breadcrumb">
          <button onClick={() => navigate("home")} disabled={busy}>
            Início
          </button>
          <span>/</span>Ferramentas<span>/</span>
          {id === "converter" ? "Converter RPFs" : "Gerar YTYP"}
        </p>
      )}
<PageHeading className="tool-heading" title={id==='converter'?'Converter RPFs':'Gerar YTYP'} description={quick?undefined:id==='converter'?'Confira os nomes e a saída antes de levar seus recursos ao servidor.':'Registre os modelos YDR da sua pasta. Os originais ficam como estão.'} aside={!quick&&<span className="local-label">Processamento local</span>}/>
      {!quick && id === "converter" && draft.items.length > 0 && (
        <div className="stepper" aria-label="Etapas da conversão">
          {(["configure", "review", "result"] as const).map((step, index) => (
            <button
              key={step}
              aria-current={draft.step === step ? "step" : undefined}
              disabled={
                busy ||
                (step === "result" && !draft.results.length) ||
                step === "review"
              }
              onClick={() => change(id, { step })}
            >
              <span>{index + 1}</span>
              {["Configurar", "Revisar", "Resultado"][index]}
            </button>
          ))}
        </div>
      )}
      <div className={quick ? "quick-path" : "source-field"}>
        {!quick && <label>Pasta de origem</label>}
        <div>
          <span className="folder-icon">
            <Folder />
          </span>
          <span
            className={draft.folder ? "path-value" : "path-placeholder"}
            title={draft.folder}
          >
            {draft.folder ||
              (id === "converter"
                ? "Selecione uma pasta com arquivos .rpf"
                : "Selecione uma pasta com modelos .ydr")}
          </span>
          {!quick && (
            <button
              className="browse-button"
              onClick={() => void choose(id)}
              disabled={!api || busy}
            >
              Selecionar pasta
            </button>
          )}
        </div>
      </div>
      {draft.error && (
        <div className="error-message" role="alert">
          <strong>Não foi possível concluir</strong>
          <p>{draft.error}</p>
          <button
            className="text-link"
            onClick={() => void perform(id, id === "ytyp" ? "ytyp" : "preview")}
            disabled={busy || !draft.folder}
          >
            Tentar novamente <Arrow />
          </button>
        </div>
      )}
      <div className="operation-content">
        {busy ? (
          <div className="working-state" role="status">
            <span className="working-indicator" />
            <h2>
              {progress?.phase === "write" || progress?.phase === "convert"
                ? "Preparando seu recurso"
                : id === "ytyp"
                  ? "Gerando o YTYP"
                  : "Conferindo os arquivos"}
            </h2>
            <p>
              {progress?.label || "Seus arquivos originais são preservados."}
            </p>
            <progress
              aria-label="Progresso da operação"
              value={progress?.total ? progress.current : undefined}
              max={progress?.total || 100}
            />
          </div>
        ) : id === "ytyp" ? (
          <div className="empty-state">
            <span className="empty-file">
              .ydr <Arrow /> .ytyp
            </span>
            <h2>
              {draft.folder
                ? "Pasta pronta para gerar YTYP"
                : "Selecione os modelos YDR"}
            </h2>
            <p>
              {draft.folder
                ? "Os YTYPs existentes serão preservados. Clique em Gerar YTYP para continuar."
                : "Selecione a pasta com os YDRs. O RPForge prepara o YTYP sem alterar seus modelos."}
            </p>
            {!draft.folder && (
              <button
                className="button primary"
                onClick={() => void choose("ytyp")}
                disabled={!api}
              >
                Escolher pasta <Arrow />
              </button>
            )}
          </div>
        ) : draft.items.length === 0 ? (
          <div className="empty-state">
            <img src="/brand/symbol.png" alt="" />
            <h2>Selecione os arquivos RPF</h2>
            <p>
              Escolha a pasta com os RPFs. Você poderá conferir os nomes e
              revisar tudo antes de converter.
            </p>
            <button
              className="button primary"
              onClick={() => void choose("converter")}
              disabled={!api}
            >
              Escolher pasta <Arrow />
            </button>
          </div>
        ) : quick || draft.step === "review" ? (
          <>
            <div className="review-title">
              <h2>
                {quick ? "Confira a saída" : "Tudo certo para converter?"}
              </h2>
              <p>
                {selected.length} RPF(s) selecionado(s).{" "}
                {quick
                  ? "Os nomes atuais serão mantidos."
                  : "A conversão só começa ao clicar no botão abaixo."}
              </p>
            </div>
            <div className="review-list">
              {selected.map((item) => (
                <section key={item.archive}>
                  <h3>{item.archive}</h3>
                  <p className="output-path">{item.output || item.error}</p>
                  {item.exists && (
                    <p className="warning-note">
                      {quick
                        ? "A pasta já existe. Abra a configuração completa para escolher como continuar."
                        : draft.choices[item.archive]?.existing === "backup"
                          ? "O destino atual será preservado em backup antes da substituição."
                          : draft.choices[item.archive]?.existing === "cancel"
                            ? "Este item será cancelado."
                            : "Escolha o tratamento do destino na configuração."}
                    </p>
                  )}
                  {!item.ok && <p className="error-text">{item.error}</p>}
                </section>
              ))}
            </div>
            <Issues items={selected} />
          </>
        ) : (
          <>
            <div className="configuration-title">
              <h2>Prepare seus recursos</h2>
              <p>
                Edite os nomes se precisar. Maiúsculas e minúsculas são
                preservadas.
              </p>
            </div>
            <div className="archive-list">
              {draft.items.map((item) => (
                <section className="archive-config" key={item.archive}>
                  <div className="archive-title">
                    <label>
                      <input
                        type="checkbox"
                        checked={
                          draft.choices[item.archive]?.selected !== false
                        }
                        onChange={(event) =>
                          edit(item.archive, { selected: event.target.checked })
                        }
                      />
                      <span>{item.archive}</span>
                    </label>
                    <span>
                      {item.kind === "vehicle"
                        ? "Veículo"
                        : item.kind || "Conteúdo"}
                    </span>
                  </div>
                  {item.ok ? (
                    <>
                      <div className="config-fields">
                        <label>
                          Nome da pasta de saída
                          <input
                            aria-label={`Pasta de saída ${item.archive}`}
                            value={
                              draft.choices[item.archive]?.outputName ??
                              item.outputName ??
                              ""
                            }
                            onChange={(event) =>
                              edit(item.archive, {
                                outputName: event.target.value,
                              })
                            }
                            spellCheck={false}
                          />
                        </label>
                        {(item.models ?? []).map((model) => (
                          <label key={model}>
                            Nome no jogo
                            <input
                              aria-label={`Spawn ${model}`}
                              value={
                                draft.choices[item.archive]?.spawns?.[model] ??
                                model
                              }
                              onChange={(event) =>
                                edit(item.archive, {
                                  spawns: {
                                    ...draft.choices[item.archive]?.spawns,
                                    [model]: event.target.value,
                                  },
                                })
                              }
                              spellCheck={false}
                            />
                          </label>
                        ))}
                      </div>
                      {item.exists && (
                        <label className="existing-choice">
                          Já existe uma pasta com esse nome
                          <select
                            aria-label={`Destino existente ${item.archive}`}
                            value={draft.choices[item.archive]?.existing ?? ""}
                            onChange={(event) =>
                              edit(item.archive, {
                                existing: event.target.value as
                                  | "backup"
                                  | "cancel",
                              })
                            }
                          >
                            <option value="" disabled>
                              Escolha como continuar
                            </option>
                            <option value="backup">
                              Preservar backup e substituir
                            </option>
                            <option value="cancel">Cancelar este item</option>
                          </select>
                          <small>
                            Você também pode alterar o nome da pasta acima e
                            revisar novamente.
                          </small>
                        </label>
                      )}
                    </>
                  ) : (
                    <p className="error-text">{item.error}</p>
                  )}
                </section>
              ))}
            </div>
            <Issues items={draft.items} />
          </>
        )}
      </div>
      <footer className="operation-footer">
        <p role="status">
          {busy
            ? "Aguarde a operação terminar."
            : draft.step === "result"
              ? "Confira o resultado no FiveM."
              : id === "ytyp"
                ? "Nenhum modelo será alterado."
                : "A análise não altera os originais."}
        </p>
        <div className="footer-actions">
          {quick && (
            <button
              className="text-link"
              onClick={() => void api?.openFull()}
              disabled={busy}
            >
              Configurar no app
            </button>
          )}
          {draft.step === "result" ? (
            <>
              {resultOk.length > 0 && (
                <button className="button secondary" onClick={openResult}>
                  Abrir resultado <Folder />
                </button>
              )}
              <button
                className="button primary"
                onClick={() =>
                  quick ? void api?.close() : change(id, emptyDraft())
                }
              >
                {quick ? "Concluir" : "Nova operação"}
                {!quick && <Arrow />}
              </button>
            </>
          ) : draft.folder && id === "ytyp" && !quick ? (
            <button
              className="button primary"
              disabled={busy || !api}
              onClick={() => void perform("ytyp", "ytyp")}
            >
              Gerar YTYP <Arrow />
            </button>
          ) : draft.items.length > 0 && id === "converter" ? (
            <>
              {draft.step === "review" && !quick && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => change(id, { step: "configure" })}
                >
                  Voltar
                </button>
              )}
              <button
                className="button primary"
                disabled={
                  busy ||
                  !api ||
                  ((quick || draft.step === "review") &&
                    (!valid || !draft.reviewId))
                }
                onClick={() =>
                  void perform(
                    "converter",
                    quick || draft.step === "review" ? "convert" : "preview",
                    undefined,
                    undefined,
                    true,
                  )
                }
              >
                {quick || draft.step === "review"
                  ? "Converter agora"
                  : "Revisar conversão"}{" "}
                <Arrow />
              </button>
            </>
          ) : null}
        </div>
      </footer>
    </main>
  );
}
