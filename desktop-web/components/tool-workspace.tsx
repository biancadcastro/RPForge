"use client";
import {PageHeading} from './page-heading';
import {OperationResult} from "./operation-result";
import {Breadcrumb} from './breadcrumb';
import {Notice} from './notice';
import {useToast} from './toast';
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
import {userMessage} from '../lib/user-message';
import {folderNameProblem,kindLabel,plural,spawnProblem} from '../lib/text';
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
const GROUP = "Arquivos e recursos";
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
        <Notice key={index} tone={issue.severity === "error" ? "error" : "warning"} title={issue.archive} message={issue.message}/>
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
  const toast = useToast();
  const tool = id === "converter" ? "Converter RPFs" : "Gerar YTYP";
  const selected = draft.items.filter(
    (item) => draft.choices[item.archive]?.selected !== false,
  );
  const nameOf = (item: Archive) => draft.choices[item.archive]?.outputName ?? item.outputName ?? "";
  const spawnOf = (item: Archive, model: string) => draft.choices[item.archive]?.spawns?.[model] ?? model;
  const fieldProblems = (item: Archive) =>
    !!folderNameProblem(nameOf(item)) || (item.models ?? []).some((model) => !!spawnProblem(spawnOf(item, model)));
  const configInvalid = selected.some((item) => item.ok && fieldProblems(item));
  const blockedByExisting = selected.some((item) => item.exists && !draft.choices[item.archive]?.existing);
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
  const openFailed = (error: unknown) =>
    toast({ tone: "error", title: "Não foi possível abrir a pasta", message: userMessage(error) });
  const openResult = () => {
    const output = resultOk.find(item=>!!item.output)?.output;
    if (output) void api?.openFolder(output).catch(openFailed);
  };
  if(!busy&&draft.step==='result'){
    const done = resultOk.length
      ? plural(resultOk.length, id === "ytyp" ? "pasta concluída" : "recurso concluído", id === "ytyp" ? "pastas concluídas" : "recursos concluídos")
      : "Nenhum item concluído";
    const failed = failures.length ? plural(failures.length, "item com falha ou cancelado", "itens com falha ou cancelados") : "";
    return <main className="tool-workspace wrap result-workspace"><OperationResult group={GROUP} tool={tool} quick={quick} onHome={()=>navigate('home')}
      title={resultOk.length?(id==='ytyp'?'YTYP gerado':'Seus recursos estão prontos'):'Confira o diagnóstico'}
      description={done+(failed?'. '+failed+'.':'. Os originais foram preservados.')}
      cards={draft.results.map(item=>({title:item.archive,folder:item.output,error:item.ok?undefined:item.error||(item.cancelled?'Operação cancelada.':'Não foi possível concluir este item.'),files:item.ok?item.generated:undefined,onOpen:item.ok&&item.output?()=>void api?.openFolder(item.output!).catch(openFailed):undefined}))}
      destination={draft.folder} onOpen={resultOk.some(item=>!!item.output)?openResult:undefined} openLabel="Abrir resultado"
      onReset={()=>quick?void api?.close():change(id,emptyDraft())} resetLabel={quick?'Concluir':'Nova operação'}
      diagnostics={<>{draft.results.some(item=>item.audit?.issues?.length)&&<details className="pixel-result-diagnostics"><summary>Avisos e diagnóstico</summary><Issues items={draft.results}/></details>}{draft.error&&<Notice message={draft.error}/>}</>}>
      <p className="pixel-result-detail">Confira o resultado no FiveM.</p></OperationResult></main>;
  }
  const failedToRead = !!draft.error && draft.items.length === 0 && !!draft.folder;
  return (
    <main className={quick ? "quick-workspace" : "tool-workspace wrap"}>
      {!quick && <Breadcrumb group={GROUP} current={tool} onHome={() => navigate("home")} disabled={busy}/>}
<PageHeading className="tool-heading" title={tool} description={quick?undefined:id==='converter'?'Confira os nomes e a saída antes de levar seus recursos ao servidor.':'Registre os modelos YDR da sua pasta. Os originais ficam como estão.'} aside={!quick&&<span className="local-label">Processamento local</span>}/>
      {!quick && id === "converter" && draft.items.length > 0 && (
        <ol className="stepper" aria-label="Etapas da conversão">
          {(["configure", "review", "result"] as const).map((step, index) => (
            <li key={step} aria-current={draft.step === step ? "step" : undefined}>
              <span>{index + 1}</span>
              {["Configurar", "Revisar", "Resultado"][index]}
            </li>
          ))}
        </ol>
      )}
      <div className={quick ? "quick-path" : "source-field"}>
        {!quick && <label htmlFor="source-folder">Pasta de origem</label>}
        <div>
          <span className="folder-icon">
            <Folder />
          </span>
          <span
            id="source-folder"
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
        <Notice
          title={id === "ytyp" ? "Não foi possível gerar o YTYP" : "Não foi possível concluir"}
          message={draft.error}
          action={draft.folder ? <button
            className="button ghost"
            onClick={() => void perform(id, id === "ytyp" ? "ytyp" : "preview")}
            disabled={busy}
          >
            Tentar de novo <Arrow />
          </button> : undefined}
        />
      )}
      <div className="operation-content">
        {busy ? (
          <div className="working-state" role="status">
            <span className="working-indicator" aria-hidden="true" />
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
        ) : failedToRead ? null : id === "ytyp" ? (
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
                {quick ? "Confira a saída" : valid ? "Tudo certo para converter?" : "Corrija antes de converter"}
              </h2>
              <p>
                {plural(selected.length, "RPF selecionado", "RPFs selecionados")}.{" "}
                {quick
                  ? blockedByExisting
                    ? "Já existe uma pasta com o mesmo nome. Configure no app para escolher como continuar."
                    : "Os nomes atuais serão mantidos."
                  : valid
                    ? "A conversão só começa ao clicar no botão abaixo."
                    : "Volte à configuração para corrigir os itens marcados."}
              </p>
            </div>
            <div className="review-list">
              {selected.map((item) => (
                <section key={item.archive}>
                  <h3>{item.archive}</h3>
                  {item.ok && <p className="output-path">{item.output}</p>}
                  {item.exists && (
                    <Notice tone="warning" message={
                      quick
                        ? "A pasta de destino já existe."
                        : draft.choices[item.archive]?.existing === "backup"
                          ? "O destino atual será preservado em backup antes da substituição."
                          : draft.choices[item.archive]?.existing === "cancel"
                            ? "Este item será cancelado."
                            : "Escolha o tratamento do destino na configuração."}/>
                  )}
                  {!item.ok && <Notice message={item.error}/>}
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
              {draft.items.map((item) => {
                const name = nameOf(item), nameProblem = folderNameProblem(name), nameId = `name-${item.archive}`;
                return (
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
                    <span>{item.ok ? kindLabel(item.kind) : "Não lido"}</span>
                  </div>
                  {item.ok ? (
                    <>
                      <div className="config-fields">
                        <label>
                          Nome da pasta de saída
                          <input
                            aria-label={`Nome da pasta de saída de ${item.archive}`}
                            aria-invalid={nameProblem ? true : undefined}
                            aria-describedby={nameProblem ? nameId : undefined}
                            value={name}
                            onChange={(event) =>
                              edit(item.archive, {
                                outputName: event.target.value,
                              })
                            }
                            spellCheck={false}
                          />
                          {nameProblem && <span className="field-error" id={nameId}>{nameProblem}</span>}
                        </label>
                        {(item.models ?? []).map((model) => {
                          const spawn = spawnOf(item, model), problem = spawnProblem(spawn), spawnId = `spawn-${item.archive}-${model}`;
                          return (
                          <label key={model}>
                            Nome no jogo (spawn)
                            <input
                              aria-label={`Nome no jogo (spawn) de ${model}`}
                              aria-invalid={problem ? true : undefined}
                              aria-describedby={problem ? spawnId : undefined}
                              value={spawn}
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
                            {problem && <span className="field-error" id={spawnId}>{problem}</span>}
                          </label>
                        );})}
                      </div>
                      {item.exists && (
                        <label className="existing-choice">
                          Já existe uma pasta com esse nome
                          <select
                            aria-label={`Já existe uma pasta com esse nome (${item.archive})`}
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
                    <Notice message={item.error}/>
                  )}
                </section>
              );})}
            </div>
            <Issues items={draft.items} />
          </>
        )}
      </div>
      <footer className="operation-footer">
        <p role="status">
          {busy
            ? "Aguarde a operação terminar."
            : configInvalid && draft.step === "configure" && !quick
              ? "Corrija os nomes marcados para continuar."
              : id === "ytyp"
                ? "Nenhum modelo será alterado."
                : "A análise não altera os originais."}
        </p>
        <div className="footer-actions">
          {quick && (
            <button
              className={blockedByExisting ? "button primary" : "button secondary"}
              onClick={() => void api?.openFull()}
              disabled={busy}
            >
              Configurar no app
            </button>
          )}
          {draft.folder && id === "ytyp" && !quick ? (
            <button
              className="button primary"
              disabled={busy || !api}
              aria-busy={busy || undefined}
              onClick={() => void perform("ytyp", "ytyp")}
            >
              Gerar YTYP <Arrow />
            </button>
          ) : draft.items.length > 0 && id === "converter" && !(quick && blockedByExisting) ? (
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
                aria-busy={busy || undefined}
                disabled={
                  busy ||
                  !api ||
                  (draft.step === "configure" && !quick && configInvalid) ||
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
