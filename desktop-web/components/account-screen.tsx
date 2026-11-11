"use client";
import {PageHeading} from './page-heading';
import { FormEvent, useEffect, useRef, useState } from "react";
import { AccountProfile, AuthOptions, BrowserAuthState, DesktopBridge } from "../lib/desktop";
import { Arrow, UserIcon } from "./icons";
import {ProviderIcon} from "./provider-icon";
import {Notice} from './notice';
import {ConfirmDialog} from './confirm-dialog';
import {useToast} from './toast';
import {userMessage} from '../lib/user-message';

type License = Awaited<ReturnType<DesktopBridge['licenseInfo']>>;
const providerNames: Record<string, string> = { discord: "Discord", google: "Google", github: "GitHub" };
function planText(license?: License) {
  if (!license) return { title: "Conferindo o plano…", text: "" };
  if (license.plan === "pro") return { title: "Plano Pro ativo", text: "Todas as ferramentas estão liberadas neste computador." };
  if (license.plan === "free") return { title: "Plano Free", text: "Converter RPFs e Gerar YTYP estão liberados. O plano Pro libera Roupas para OBJ, Roupas para Neon e Separar pele." };
  if (license.issue === "clock") return { title: "Data e hora do Windows incorretas", text: "Ajuste a data e a hora do Windows e atualize a autorização." };
  if (license.issue === "revoked") return { title: "Autorização revogada", text: "Este computador foi desconectado da sua conta pelo site. Desconecte e entre novamente para autorizar esta instalação." };
  if (license.issue === "missing") return { title: "Autorização ausente", text: "Desconecte e entre novamente para autorizar esta instalação." };
  return { title: "Autorização não confirmada", text: "Não foi possível validar a autorização agora. Verifique a internet e atualize a autorização." };
}

export function AccountScreen({ api }: { api?: DesktopBridge }) {
  const toast = useToast();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [browserAuth,setBrowserAuth]=useState<BrowserAuthState>({status:'idle'});
  const [options, setOptions] = useState<AuthOptions>();
  const [license,setLicense]=useState<License>();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(""),
    [confirmSignOut, setConfirmSignOut] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState(""),
    [avatarFailed, setAvatarFailed] = useState(false);
  const busy = !!pending;
  const connected = useRef<boolean | undefined>(undefined);
  useEffect(()=>{if(api&&profile)void api.licenseInfo().then(setLicense).catch(error=>setError(userMessage(error)));},[api,profile]);
  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.profile().then((value) => {
      if (active) { setProfile(value); connected.current = !!value; }
    }).catch(error=>{if(active)setError(userMessage(error));});
    void api
      .authOptions()
      .then((value) => {
        if (active) setOptions(value);
      })
      .catch((error) => {
        if (active) setError(userMessage(error));
      });
    const unsubscribe = api.onProfile((value) => {
      if (active) {
        if (value && connected.current === false) toast({ tone: "success", title: "Conta conectada", message: "Bem-vindo, " + value.displayName + "." });
        connected.current = !!value;
        setProfile(value);
        setChallenge("");
        setPending("");
      }
    });
    const unsubAuth = api.onAuthChallenge((value) => {
      if (active) {
        setChallenge(value);
        setPending("");
      }
    });
    const unsubError = api.onAuthError((value) => {
      if (active) {
        setError(userMessage(value));
        setPending("");
      }
    });
    const updateBrowser=(value:BrowserAuthState)=>{if(active){setBrowserAuth(value);if(value.challengeToken)setChallenge(value.challengeToken);setPending(value.status==='starting'||value.status==='waiting'?'provider:'+(value.provider||''):'');if(value.status==='error')setError(userMessage(value.message,'Não foi possível conectar. Tente de novo.'));}};
    void api.browserAuthState().then(updateBrowser).catch(()=>{});
    const unsubBrowser=api.onBrowserAuth(updateBrowser);
    return () => {
      active = false;
      unsubscribe();
      unsubAuth();
      unsubError();
      unsubBrowser();
    };
  }, [api, toast]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api || busy) return;
    const form = event.currentTarget,
      fields = new FormData(form);
    setPending("password");
    setError("");
    try {
      if (challenge)
        await api.verifyMfa(challenge, String(fields.get("code") || "").trim());
      else {
        const result = await api.signIn(
          String(fields.get("email") || ""),
          String(fields.get("password") || ""),
        );
        if (result.mfaRequired && result.challengeToken) {
          setChallenge(result.challengeToken);
          return;
        }
      }
      form.reset();
      setProfile(await api.profile());
    } catch (error) {
      setError(userMessage(error, "Não foi possível entrar. Tente de novo."));
    } finally {
      setPending("");
    }
  }
  async function provider(id: string) {
    if (!api || busy) return;
    setError("");
    setPending("provider:" + id);
    try {
      await api.startOAuth(id);
    } catch (error) {
      setPending("");
      setError(userMessage(error, "Não foi possível abrir o navegador. Tente de novo."));
    }
  }
  function retryOptions() {
    setPending("options");
    setError("");
    void api?.authOptions().then(setOptions).catch((error) => setError(userMessage(error))).finally(() => setPending(""));
  }
  function refreshLicense() {
    setPending("license");
    setError("");
    void api?.licenseInfo().then((value) => {
      setLicense(value);
      toast({ tone: value.plan ? "success" : "warning", title: value.plan ? "Autorização atualizada" : "Autorização não confirmada", message: planText(value).title + "." });
    }).catch((error) => setError(userMessage(error))).finally(() => setPending(""));
  }
  function signOut() {
    setConfirmSignOut(false);
    setPending("signout");
    setError("");
    void api?.signOut().then(() => {
      connected.current = false;
      setProfile(null);
      setLicense(undefined);
      toast({ tone: "success", title: "Computador desconectado", message: "Entre novamente quando quiser usar as ferramentas Pro." });
    }).catch((error) => setError(userMessage(error))).finally(() => setPending(""));
  }
  const plan = planText(license);
  const waitingBrowser = browserAuth.status === 'starting' || browserAuth.status === 'waiting';
  return (
    <main className="account-page wrap">
<PageHeading className="account-intro" title="Sua conta no RPForge" description="O mesmo perfil para suas ferramentas."/>
      <section
        className={`account-panel ${profile || !options?.passwordAuthEnabled || !options?.providers.some(item=>item.enabled) || challenge ? "single-column" : ""}`}
        aria-labelledby="account-heading"
      >
        {profile ? (
          <>
            <div className="profile-summary">
              <span className="profile-avatar">
                {profile.avatarUrl && !avatarFailed ? (
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <UserIcon />
                )}
              </span>
              <div>
                <h2 id="account-heading">{profile.displayName}</h2>
                <p>Conta conectada</p>
              </div>
            </div>
            <p>
              Sua foto e seu nome de exibição aparecem na barra lateral. As ações
              rápidas do Windows usam a conta conectada.
            </p>
            <div className={"account-plan" + (license && !license.plan ? " account-plan--issue" : "")}>
              <strong>{plan.title}</strong>
              {plan.text && <p>{plan.text}</p>}
              {license?.installationId && <small>Instalação {license.installationId.slice(0,8)}</small>}
            </div>
            <button className="button secondary" disabled={busy} aria-busy={pending === "license" || undefined} onClick={refreshLicense}>{pending === "license" ? "Atualizando…" : "Atualizar autorização"}</button>
            <button className="button secondary" disabled={busy} onClick={()=>void api?.openAccount().catch(error=>toast({tone:'error',title:'Não foi possível abrir o site',message:userMessage(error)}))}>Gerenciar conta e computadores</button>
            <button className="button danger" disabled={busy} aria-busy={pending === "signout" || undefined} onClick={()=>setConfirmSignOut(true)}>{pending === "signout" ? "Desconectando…" : "Desconectar este computador"}</button>
            {error&&<Notice message={error}/>}
          </>
        ) : (
          <>
            <h2 id="account-heading">
              {challenge ? "Confirme seu acesso" : "Entrar"}
            </h2>
            <p>
              {challenge
                ? "Digite o código do autenticador ou um código de recuperação."
                : "Entre com a conta que você já usa no site do RPForge."}
            </p>
            {!options && !error && (
              <p role="status" className="account-loading">
                <span className="working-indicator" aria-hidden="true" />
                Carregando opções de entrada…
              </p>
            )}
            <div className="account-entry-columns">
            {(challenge||options?.passwordAuthEnabled)&&<form onSubmit={submit}>
              {challenge ? (
                <label>
                  Código de verificação
                  <input
                    name="code"
                    autoComplete="one-time-code"
                    required
                    minLength={6}
                    maxLength={32}
                    autoFocus
                  />
                </label>
              ) : (
                options?.passwordAuthEnabled && (
                  <>
                    <label>
                      E-mail
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      Senha
                      <div className="account-password">
                        <input
                          name="password"
                          aria-label="Senha"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          maxLength={128}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-pressed={showPassword}
                        >
                          {showPassword ? "Ocultar" : "Mostrar"}
                        </button>
                      </div>
                    </label>
                  </>
                )
              )}
              <button
                className="button primary account-submit"
                disabled={busy}
                aria-busy={pending === "password" || undefined}
              >
                {pending === "password"
                  ? "Aguarde…"
                  : challenge
                    ? "Confirmar acesso"
                    : "Entrar"}
                {pending !== "password" && <Arrow />}
              </button>
            </form>}
            {!challenge &&
              !!options?.providers.some((item) => item.enabled) && (
                  <div className="account-providers"><h3>{options.passwordAuthEnabled?'Ou continue com':'Escolha sua conta'}</h3><div className="account-provider-buttons">
                    {options.providers
                      .filter((item) => item.enabled)
                      .map((item) => {
                        const waiting = pending === "provider:" + item.provider;
                        return (
                        <button
                          key={item.provider}
                          className="button secondary"
                          onClick={() => void provider(item.provider)}
                          disabled={busy}
                          aria-busy={waiting || undefined}
                        >
                          <span className="provider-mark"><ProviderIcon provider={item.provider}/></span>
                          <span className="provider-label">{waiting ? "Aguarde…" : "Continuar com " + (providerNames[item.provider] || item.provider)}</span>
                          <Arrow />
                        </button>
                      );})}
                  </div><p className="browser-auth-hint">Discord, Google e GitHub são autorizados no navegador padrão do Windows.</p>
                  </div>
              )}
            </div>
            {error && (
              <Notice
                message={error}
                action={!options ? <button className="button ghost" disabled={busy} aria-busy={pending === "options" || undefined} onClick={retryOptions}>Tentar de novo <Arrow /></button> : undefined}
              />
            )}
          </>
        )}
        {waitingBrowser&&<div className="browser-auth-pending" role="status"><span className="working-indicator" aria-hidden="true"/><div><p>{browserAuth.status==='starting'?'Abrindo o navegador…':'Aguardando autorização no navegador'}</p><small>{browserAuth.message?userMessage(browserAuth.message):'A conta será conectada aqui quando você concluir.'}</small></div><button className="button ghost" onClick={()=>void api?.cancelBrowserAuth()}>Cancelar conexão</button></div>}
        <p className="account-footnote">
          Seus arquivos permanecem no computador.
        </p>
      </section>
      {confirmSignOut && <ConfirmDialog title="Desconectar este computador?" message="As ferramentas Pro deixam de funcionar aqui até você entrar de novo. Seus arquivos não são afetados." confirmLabel="Desconectar" cancelLabel="Cancelar" onConfirm={signOut} onCancel={() => setConfirmSignOut(false)} />}
    </main>
  );
}
