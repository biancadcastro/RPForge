"use client";
import {PageHeading} from './page-heading';
import { FormEvent, useEffect, useState } from "react";
import { AccountProfile, AuthOptions, BrowserAuthState, DesktopBridge } from "../lib/desktop";
import { Arrow, UserIcon } from "./icons";
import {ProviderIcon} from "./provider-icon";

export function AccountScreen({ api }: { api?: DesktopBridge }) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [browserAuth,setBrowserAuth]=useState<BrowserAuthState>({status:'idle'});
  const [options, setOptions] = useState<AuthOptions>();
  const [license,setLicense]=useState<Awaited<ReturnType<DesktopBridge['licenseInfo']>>>();
  useEffect(()=>{if(api&&profile)void api.licenseInfo().then(setLicense).catch(error=>setError(error.message));},[api,profile]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState(""),
    [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.profile().then((value) => {
      if (active) setProfile(value);
    }).catch(error=>{if(active)setError(error.message);});
    void api
      .authOptions()
      .then((value) => {
        if (active) setOptions(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    const unsubscribe = api.onProfile((value) => {
      if (active) {
        setProfile(value);
        setChallenge("");
        setBusy(false);
      }
    });
    const unsubAuth = api.onAuthChallenge((value) => {
      if (active) {
        setChallenge(value);
        setBusy(false);
      }
    });
    const unsubError = api.onAuthError((value) => {
      if (active) {
        setError(value);
        setBusy(false);
      }
    });
    const updateBrowser=(value:BrowserAuthState)=>{if(active){setBrowserAuth(value);if(value.challengeToken)setChallenge(value.challengeToken);setBusy(value.status==='starting'||value.status==='waiting');if(value.status==='error')setError(value.message||'Não foi possível conectar.');}};
    void api.browserAuthState().then(updateBrowser).catch(()=>{});
    const unsubBrowser=api.onBrowserAuth(updateBrowser);
    return () => {
      active = false;
      unsubscribe();
      unsubAuth();
      unsubError();
      unsubBrowser();
    };
  }, [api]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api || busy) return;
    const form = event.currentTarget,
      fields = new FormData(form);
    setBusy(true);
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
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function provider(id: string) {
    if (!api || busy) return;
    setError("");
    setBusy(true);
    try {
      await api.startOAuth(id);
    } catch (error) {
      setBusy(false);
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o provedor.",
      );
    }
  }
  return (
    <main className="account-page wrap">
<PageHeading className="account-intro" eyebrow="RPForge / Conta" title="Sua conta no RPForge" description="O mesmo perfil para suas ferramentas."/>
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
              Seu avatar e nick aparecem na barra lateral. As ações rápidas
              usam a sua sessão conectada.
            </p>
            <p>{license?.issue==='clock'?'Ajuste a data e a hora do Windows e tente validar novamente.':license?.plan==='pro'?'Plano Pro ativo':license?.plan==='free'?'Plano Free':license?.issue==='missing'?'Conecte novamente para autorizar esta instalação.':'Não foi possível validar a autorização agora. Tente novamente.'}
              {license?.installationId&&<small> · Instalação {license.installationId.slice(0,8)}</small>}</p>
            <button className="button secondary" disabled={busy} onClick={()=>{setBusy(true);setError('');void api?.licenseInfo().then(setLicense).catch(error=>setError(error.message)).finally(()=>setBusy(false));}}>Atualizar autorização</button>
            <button className="button secondary" disabled={busy} onClick={()=>void api?.openAccount().catch(error=>setError(error.message))}>Gerenciar conta e computadores</button>
            <button className="button secondary" disabled={busy} onClick={()=>{
              setBusy(true);setError('');
              void api?.signOut().then(()=>setProfile(null)).catch(error=>setError(error.message)).finally(()=>setBusy(false));
            }}>Desconectar este computador</button>
            {error&&<p role="alert" className="account-form-error">{error}</p>}
          </>
        ) : (
          <>
            <h2 id="account-heading">
              {challenge ? "Confirme seu acesso" : "Entrar"}
            </h2>
            <p>
              {challenge
                ? "Digite o código do autenticador ou um código de recuperação."
                : "Entre com a conta que você já usa no RPForge."}
            </p>
            {!options && !error && (
              <p role="status" className="account-loading">
                Carregando opções de entrada…
              </p>
            )}
            {!options&&error&&<button className="button secondary" disabled={busy} onClick={()=>{setBusy(true);setError('');void api?.authOptions().then(setOptions).catch(error=>setError(error.message)).finally(()=>setBusy(false));}}>Tentar carregar opções novamente</button>}
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
              {(challenge || options?.passwordAuthEnabled) && (
                <button
                  className="button primary account-submit"
                  disabled={busy}
                >
                  {busy
                    ? "Aguarde…"
                    : challenge
                      ? "Confirmar acesso"
                      : "Entrar"}
                  <Arrow />
                </button>
              )}
            </form>}
            {!challenge &&
              !!options?.providers.some((item) => item.enabled) && (
                <>
                  <div className="account-providers"><h3>{options.passwordAuthEnabled?'Ou continue com':'Escolha sua conta'}</h3><div className="account-provider-buttons">
                    {options.providers
                      .filter((item) => item.enabled)
                      .map((item) => (
                        <button
                          key={item.provider}
                          className="button secondary"
                          onClick={() => void provider(item.provider)}
                          disabled={busy}
                        >
                          <span className="provider-mark"><ProviderIcon provider={item.provider}/></span>
                          <span className="provider-label">Continuar com{" "}
                          {(
                            {
                              discord: "Discord",
                              google: "Google",
                              github: "GitHub",
                            } as Record<string, string>
                          )[item.provider] || item.provider}</span>
                          <Arrow />
                        </button>
                      ))}
                  </div><p className="browser-auth-hint">Discord, Google e GitHub são autorizados no navegador padrão do Windows.</p>
                  </div>
                </>
              )}
            </div>
            {error&&<p className="account-form-error" role="alert">{error}</p>}
            {error && !options && (
              <button
                className="text-link"
                onClick={() => {
                  setError("");
                  void api
                    ?.authOptions()
                    .then(setOptions)
                    .catch((error) => setError(error.message));
                }}
              >
                Tentar novamente <Arrow />
              </button>
            )}
          </>
        )}
        {(browserAuth.status==='starting'||browserAuth.status==='waiting')&&<div className="browser-auth-pending" role="status"><p>{browserAuth.status==='starting'?'Preparando a conexão…':'Aguardando autorização no navegador'}</p><small>{browserAuth.message||'A conta será conectada aqui quando você concluir.'}</small><button className="text-link" onClick={()=>void api?.cancelBrowserAuth()}>Cancelar conexão</button></div>}
        <p className="account-footnote">
          Seus arquivos permanecem no computador.
        </p>
      </section>
    </main>
  );
}
