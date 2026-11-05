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

export function DesktopApp() {
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
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível concluir. Tente novamente.",
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
    void bridge.bootstrap().then(open);
    const unsubscribe = bridge.onProgress(setProgress),
      unlaunch = bridge.onLaunch(open),
      unprofile=bridge.onProfile(profile=>{
        if(!profile&&loginRequiredRef.current){setScreen('account');}
        else if(loginRequiredRef.current)void bridge.bootstrap().then(open);
      });
    return () => {
      unsubscribe();
      unlaunch();
      unprofile();
    };
  }, []);

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
      change(id, { error: String(error) });
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
      <WindowChrome api={api} editor={skinEditing} title={screen==='home'?'Ferramentas':screen==='skin'?'Separar pele':screen==='clothing'?'Exportar OBJ':screen==='neon'?'Converter para Neon':screen==='account'?'Conta':screen==='help'?'Ajuda':screen==='ytyp'?'Gerar YTYP':'Converter RPFs'}/>
      {launchReady && !loginRequired && !quick && !skinEditing && (
        <MainNavigation
          screen={screen}
          busy={busy}
          api={api}
          onNavigate={navigate}
        />
      )}
      {!launchReady && (
        <p className="preview-warning" role="status">
          Carregando a conexão com o aplicativo…
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
      {launchReady && !loginRequired && (!quick || launch.action === 'obj') && <ClothingWorkspace api={api} active={screen === 'clothing'} busy={busy} launch={launch} onBusy={value => { busyRef.current = value; setBusy(value); }} />}
      {launchReady && !loginRequired && (!quick || launch.action === 'neon') && <NeonWorkspace api={api} active={screen === 'neon'} busy={busy} launch={launch} onBusy={value => { busyRef.current=value;setBusy(value); }} />}
      {launchReady && !loginRequired && (!quick || launch.action === 'skin') && <SkinWorkspace api={api} active={screen === 'skin'} busy={busy} launch={launch} onEditorState={setSkinEditing} onBusy={value=>{busyRef.current=value;setBusy(value);}} />}
    </div>
  );
}
