"use client";
import { useEffect, useRef, useState } from "react";
import {
  Choices,
  DesktopBridge,
  Draft,
  Launch,
  Progress,
  Screen,
  ToolId,
  emptyDraft,
} from "../lib/desktop";
import { HomeScreen } from "./home-screen";
import { HelpScreen } from "./help-screen";
import { MainNavigation } from "./main-navigation";
import { ToolWorkspace } from "./tool-workspace";
import { AccountScreen } from "./account-screen";
import { ClothingWorkspace } from './clothing-workspace';
import { NeonWorkspace } from './neon-workspace';
import { SkinWorkspace } from './skin-workspace';
import {WindowChrome} from './window-chrome';
import {useToast} from './toast';
import {userMessage} from '../lib/user-message';

export const screenTitles:Record<Screen,string>={home:'Ferramentas',converter:'Converter RPFs',ytyp:'Gerar YTYP',clothing:'Roupas para OBJ',neon:'Roupas para Neon',skin:'Separar pele',account:'Conta',help:'Ajuda'};

export function DesktopApp() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [api, setApi] = useState<DesktopBridge>();
  const [launch, setLaunch] = useState<Launch>({
    mode: "full",
    action: "preview",
    folder: "",
  });
  const [screen, setScreen] = useState<Screen>("account");
  const [launchReady,setLaunchReady]=useState(false);
  const [loginRequired,setLoginRequired]=useState(false);
  const loginRequiredRef=useRef(false);
  const [skinEditing,setSkinEditing]=useState(false);
  const [drafts, setDrafts] = useState<Record<ToolId, Draft>>({
    converter: emptyDraft(),
    ytyp: emptyDraft(),
  });
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<Progress>();
  const draftRef = useRef(drafts);
  draftRef.current = drafts;
  const busyRef = useRef(false);
  function change(id: ToolId, patch: Partial<Draft>) {
    setDrafts((previous) => ({
      ...previous,
      [id]: { ...previous[id], ...patch },
    }));
  }
  async function perform(
    id: ToolId,
    action: "preview" | "convert" | "ytyp",
    folder?: string,
    choices?: Choices,
    review = false,
    bridge = api,
  ) {
    if (!bridge || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setProgress(undefined);
    const draft = draftRef.current[id],
      source = folder ?? draft.folder;
    change(id, {
      error: "",
      ...(action === "preview" ? { results: [], reviewId: null } : {}),
    });
    try {
      const response =
        action === "preview"
          ? await bridge.preview(source, choices ?? draft.choices)
          : action === "convert"
            ? await bridge.convert(source, draft.reviewId!)
            : await bridge.ytyp(source);
      if (action === "preview")
        change(id, {
          folder: source,
          items: response.data,
          choices: choices ?? draft.choices,
          reviewId: response.reviewId,
          step: review ? "review" : "configure",
        });
      else
        change(id, {
          folder: source,
          results: response.data,
          reviewId: null,
          step: "result",
        });
    } catch (error) {
      change(id, {
        error: userMessage(error),
        reviewId: null,
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(undefined);
    }
  }
  const performRef = useRef(perform);
  performRef.current = perform;
  useEffect(() => {
    const bridge = window.rpforge;
    if (!bridge) return;
    setApi(bridge);
    const open = (value: Launch) => {
      setLaunch(value);
      setLaunchReady(true);
      if (value.notice) toastRef.current({ tone: "error", title: "Não foi possível abrir pelo Explorer", message: value.notice });
      loginRequiredRef.current=!!value.loginRequired;setLoginRequired(!!value.loginRequired);
      if(value.loginRequired){setScreen('account');return;}
      if (value.action === 'obj') { setScreen('clothing'); return; }
      if (value.action === 'neon') { setScreen('neon'); return; }
      if (value.action === 'skin') { setScreen('skin'); return; }
      if (value.folder) {
        const id = value.action === "ytyp" ? "ytyp" : "converter";
        setScreen(id);
        change(id, { ...emptyDraft(), folder: value.folder });
        if (value.mode === "quick")
          void performRef.current(
            id,
            value.action,
            value.folder,
            {},
            false,
            bridge,
          );
        else if (id === "converter")
          void performRef.current(
            id,
            "preview",
            value.folder,
            {},
            false,
            bridge,
          );
      }else setScreen('home');
    };
    const fallback = (error: unknown) => {
      toastRef.current({ tone: "error", title: "Não foi possível abrir a ferramenta", message: userMessage(error) });
      open({ mode: "full", action: "preview", folder: "" });
    };
    void bridge.bootstrap().then(open, fallback);
    const unsubscribe = bridge.onProgress((value) => {
        if (value.phase === "error") { toastRef.current({ tone: "error", title: "Não foi possível abrir pelo Explorer", message: userMessage(value.label) }); return; }
        if (value.phase === "busy") { toastRef.current({ tone: "info", title: "Operação em andamento", message: value.label }); return; }
        setProgress(value);
      }),
      unlaunch = bridge.onLaunch(open),
      unprofile=bridge.onProfile(profile=>{
        if(!profile&&loginRequiredRef.current){setScreen('account');}
        else if(loginRequiredRef.current)void bridge.bootstrap().then(open,fallback);
      });
    return () => {
      unsubscribe();
      unlaunch();
      unprofile();
    };
  }, []);

  // Keyboard users start in the content: each screen moves focus to its title.
  useEffect(() => {
    if (!launchReady) return;
    const frame = requestAnimationFrame(() => {
      const heading = Array.from(document.querySelectorAll<HTMLElement>("main h1")).find((element) => element.getClientRects().length);
      if (heading && !document.querySelector("[role=dialog],[role=alertdialog]")) heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [screen, launchReady, loginRequired]);
  function navigate(target: typeof screen) {
    if (!busyRef.current&&!loginRequiredRef.current) {
      setScreen(target);
    }
  }
  async function choose(id: ToolId) {
    if (!api || busyRef.current) return;
    try {
      const selected = await api.selectFolder();
      if (!selected) return;
      change(id, { ...emptyDraft(), folder: selected });
      if (id === "converter") await perform(id, "preview", selected, {});
    } catch (error) {
      change(id, { error: userMessage(error) });
    }
  }
  function edit(archive: string, patch: Choices[string]) {
    const draft = drafts.converter;
    change("converter", {
      choices: {
        ...draft.choices,
        [archive]: { ...draft.choices[archive], ...patch },
      },
      reviewId: null,
    });
  }
  const quick = launch.mode === "quick",
    id: ToolId = screen === "ytyp" ? "ytyp" : "converter";
  const draft = drafts[id];

  return (
    <div className={(quick ? "desktop quick" : "desktop")+(skinEditing?' atelier-shell':'')+(loginRequired?' login-shell':'')}>
      <WindowChrome api={api} quick={quick} title={screenTitles[screen]}/>
      {launchReady && !loginRequired && !quick && !skinEditing && (
        <MainNavigation
          screen={screen}
          busy={busy}
          api={api}
          onNavigate={navigate}
        />
      )}
      {!launchReady && (
        <p className="app-loading" role="status">
          <span className="working-indicator" aria-hidden="true" />
          Abrindo o RPForge…
        </p>
      )}

      {!launchReady ? null : loginRequired ? <AccountScreen api={api}/> : screen === 'clothing' || screen === 'neon' || screen === 'skin' ? null : screen === "home" && !quick ? (
        <HomeScreen navigate={navigate} />
      ) : screen === "account" && !quick ? (
        <AccountScreen api={api} />
      ) : screen === "help" && !quick ? (
        <HelpScreen api={api} />
      ) : (
        <ToolWorkspace
          id={id}
          draft={draft}
          busy={busy}
          api={api}
          quick={quick}
          progress={progress}
          change={change}
          navigate={navigate}
          choose={choose}
          edit={edit}
          perform={perform}
        />
      )}
      {launchReady && !loginRequired && (!quick || launch.action === 'obj') && <ClothingWorkspace api={api} onHome={() => navigate('home')} active={screen === 'clothing'} busy={busy} launch={launch} onBusy={value => { busyRef.current = value; setBusy(value); }} />}
      {launchReady && !loginRequired && (!quick || launch.action === 'neon') && <NeonWorkspace api={api} onHome={() => navigate('home')} active={screen === 'neon'} busy={busy} launch={launch} onBusy={value => { busyRef.current=value;setBusy(value); }} />}
      {launchReady && !loginRequired && (!quick || launch.action === 'skin') && <SkinWorkspace api={api} onHome={() => navigate('home')} active={screen === 'skin'} busy={busy} launch={launch} onEditorState={setSkinEditing} onBusy={value=>{busyRef.current=value;setBusy(value);}} />}
    </div>
  );
}
