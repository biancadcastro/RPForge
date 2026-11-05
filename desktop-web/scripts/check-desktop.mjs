import {installTestAuth} from './lib/test-auth-api.mjs';
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const sourceProject = path.resolve(fileURLToPath(new URL("../", import.meta.url))),
  project = process.env.RPF_DESKTOP_PROJECT ? path.resolve(process.env.RPF_DESKTOP_PROJECT) : sourceProject,
  root = path.resolve(sourceProject, "..");
const require = createRequire(import.meta.url),
  executablePath = process.env.RPF_ELECTRON_EXECUTABLE || require("electron");
const temporary = await mkdtemp(path.join(os.tmpdir(), "rpforge-electron-"));
const documentationPrefix = process.env.RPF_DOCUMENTATION_CAPTURE
  ? path.join(process.env.PUBLIC || os.tmpdir(), ...(process.env.PUBLIC ? ['Documents'] : []), 'RPForge-Exemplos-') : null;
const fixtures = documentationPrefix ? await mkdtemp(documentationPrefix) : path.join(temporary, "fixtures");
const screenshots = path.join(root, "output/electron");
await mkdir(screenshots, { recursive: true });
execFileSync(
  process.execPath,
  [path.join(root, "scripts/Create-DesktopFixtures.mjs"), fixtures],
  { windowsHide: true },
);
const original = await readFile(path.join(fixtures, "dlc.rpf"));
let application;
async function start(args = []) {
  const env = {
    ...process.env,
    RPF_TEST_USER_DATA: path.join(temporary, "profile"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    executablePath,
    args: [project, "--test-mode", ...args],
    env,
    timeout: 20000,
  });
  const page = await application.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => console.error("RENDERER:", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error("PAGE:", message.text());
  });
  await page
    .getByText("Carregando a conexão com o aplicativo…")
    .waitFor({ state: "hidden" });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function stop() {
  if (application) {
    await application.close();
    application = null;
  }
}
async function picker(folder) {
  await application.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, folder);
}
async function idle() {
  assert.equal(
    await application.evaluate(() => globalThis.__forgeDiagnostics().workers),
    0,
    "Operation worker must exit after every operation",
  );
}

try {
  let page = await start();
  await page
    .getByRole("heading", { name: "Ferramentas",exact:true })
    .waitFor();
  await page
    .getByRole("button", { name: "Conta de Pessoa de teste" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Abrir o site" }).count(),
    0,
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root: dom } = await cdp.send("DOM.getDocument");
  for (const [selector, family] of [
    ["h1", /Pixelify/],
    [".sidebar-link", /Atkinson/],
    [".account-name", /Atkinson/],
  ]) {
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: dom.nodeId,
      selector,
    });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    assert.ok(
      fonts.some((font) => family.test(font.familyName)),
      `Expected desktop font for ${selector}: ${JSON.stringify(fonts)}`,
    );
  }
  await cdp.detach();
  const alignment = await page
    .locator(".sidebar-link").first()
    .evaluate((button) => {
      const svg = button.querySelector("svg").getBoundingClientRect(),
        bounds = button.getBoundingClientRect();
      return Math.abs(svg.y + svg.height / 2 - bounds.y - bounds.height / 2);
    });
  assert.ok(alignment <= 1, `Navbar icon is not centered: ${alignment}`);
  assert.equal(
    await page.evaluate(() => typeof window.require),
    "undefined",
    "Renderer must not have raw Node access",
  );
  const denied = await page.evaluate(() =>
    window.rpforge.preview("Z:\\unapproved-folder", {}).then(
      () => "unexpected success",
      (error) => error.message,
    ),
  );
  assert.match(denied, /Selecione a pasta/);
  assert.doesNotMatch(denied, /forge:operation|invoking remote/);
  await idle();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(
    await page
      .locator(".home")
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    false,
    "Home must not scroll horizontally",
  );
  await page.screenshot({ path: path.join(screenshots, "01-inicio.png") });
  await page.getByRole('button',{name:'Conta de Pessoa de teste'}).click();
  await installTestAuth(application,{mfa:true});
  await page.locator(".account-page").waitFor();
  await page.getByLabel("E-mail", { exact: true }).waitFor();
  assert.equal(
    await application.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
    "Account entry must stay inside the app, without a website popup",
  );
  assert.equal(
    await page.locator(".app-sidebar").count(),
    1,
    "Free navigation remains available without an account",
  );
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 680),
  );
  const loginGeometry=await page.evaluate(()=>{
    const bounds=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {email:bounds('.account-panel input[name="email"]'),password:bounds('.account-password'),submit:bounds('.account-submit'),providers:Array.from(document.querySelectorAll('.account-provider-buttons button')).map(button=>{const r=button.getBoundingClientRect(),icon=button.querySelector('.provider-mark svg').getBoundingClientRect(),arrow=button.querySelector(':scope > svg').getBoundingClientRect();return {y:r.y,width:r.width,height:r.height,iconCenter:Math.abs(icon.y+icon.height/2-r.y-r.height/2),arrowCenter:Math.abs(arrow.y+arrow.height/2-r.y-r.height/2)};})};
  });
  assert.equal(loginGeometry.providers.length,3,'Every provider must have its logo');
  for(const button of loginGeometry.providers){assert.ok(Math.abs(button.height-loginGeometry.email.height)<=1);assert.ok(Math.abs(button.width-loginGeometry.email.width)<=1);assert.ok(button.iconCenter<=1&&button.arrowCenter<=1,'Provider logo and arrow must be centered');}
  assert.ok(Math.abs(loginGeometry.email.y-loginGeometry.providers[0].y)<=1,'First provider and email field must start on the same row');
  assert.equal(loginGeometry.email.height,loginGeometry.password.height);assert.equal(loginGeometry.email.height,loginGeometry.submit.height);
  await page.screenshot({
    path: path.join(screenshots, "07-conta-integrada.png"),
  });
  assert.ok(
    await page
      .locator(".account-panel")
      .evaluate(
        (element) => element.getBoundingClientRect().bottom <= innerHeight,
      ),
    "Account form is clipped at the supported compact window size",
  );
  await page.getByLabel("E-mail", { exact: true }).fill("test@example.invalid");
  for(const [provider,label] of [['discord','Discord'],['google','Google'],['github','GitHub']]){
    await page.getByRole('button',{name:`Continuar com ${label}`}).click();
    await page.getByText('Aguardando autorização no navegador',{exact:true}).waitFor();
    assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
    assert.equal(await application.evaluate(()=>globalThis.__openedAuth.at(-1)),`https://api.rpforge.dev/v1/auth/oauth/${provider}/start?desktop=12345678-1234-4234-8234-123456789abc`);
    await page.getByRole('button',{name:'Cancelar conexão'}).click();
    await page.getByRole('button',{name:'Cancelar conexão'}).waitFor({state:'hidden'});
  }
  await page.getByLabel("Senha", { exact: true }).fill("fixture-wrong");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Confira o e-mail e a senha" })
    .waitFor();
  await page.getByLabel("Senha", { exact: true }).fill("fixture-correct");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("Código de verificação").fill("123456");
  await page
    .getByRole("button", { name: "Confirmar acesso", exact: true })
    .click();
  await page.getByRole('button',{name:'Início',exact:true}).first().click();
  await page.getByRole("heading", {name:"Ferramentas",exact:true}).waitFor();
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1280, 860),
  );
  await page
    .getByRole("button", { name: "Início", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Ferramentas", exact: false })
    .first()
    .click();
  await page.getByRole("searchbox").fill("ytyp");
  await page
    .locator("#tool-links")
    .getByRole("button", { name: /Gerar YTYP/ })
    .click();
  await page
    .getByRole("heading", { name: "Gerar YTYP", exact: true })
    .waitFor();
  await picker(path.join(fixtures, "props"));
  await page
    .getByRole("button", { name: "Selecionar pasta", exact: true })
    .click();
  await page.locator('main').getByRole("button", { name: "Gerar YTYP", exact: false }).click();
  await page
    .getByRole("heading", { name: "YTYP gerado", exact: true })
    .waitFor();
  assert.ok(
    (await readdir(path.join(fixtures, "props"))).some((name) =>
      name.endsWith(".ytyp"),
    ),
  );
  await idle();
  await page.screenshot({ path: path.join(screenshots, "09-ytyp.png") });
  await page
    .getByRole("button", { name: "Início", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Converter RPFs", exact: false })
    .first()
    .click();
  await picker(fixtures);
  await page
    .getByRole("button", { name: "Selecionar pasta", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Spawn car", exact: true })
    .fill("WEBTEST");
  assert.deepEqual(await readFile(path.join(fixtures, "dlc.rpf")), original);
  await page.screenshot({ path: path.join(screenshots, "08-configurar.png") });
  await page.getByRole("button", { name: "Revisar conversão" }).click();
  await page
    .getByRole("heading", { name: "Tudo certo para converter?" })
    .waitFor();
  await page.screenshot({ path: path.join(screenshots, "02-revisao.png") });
  await page.getByRole("button", { name: "Converter agora" }).click();
  await page
    .getByRole("heading", { name: "Seus recursos estão prontos" })
    .waitFor();
  assert.match(
    await readFile(path.join(fixtures, "WEBTEST/data/vehicles.meta"), "utf8"),
    /<modelName>WEBTEST<\/modelName>/,
  );
  assert.deepEqual(await readFile(path.join(fixtures, "dlc.rpf")), original);
  await idle();
  await page.screenshot({ path: path.join(screenshots, "03-resultado.png") });
  await page.getByRole('button', { name: 'Como usar', exact: true }).click();
  await page.locator('.help-page').waitFor();
  await page.getByText(/RPForge .*ambiente de desenvolvimento/).waitFor();
  await page.getByRole('button',{name:'Instalação e atualização manual',exact:true}).click();
  assert.equal(await application.evaluate(()=>globalThis.__openedAuth.at(-1)),'https://rpforge.dev/docs/instalar/');
  await page.screenshot({ path: path.join(screenshots, '10-ajuda.png') });
  await page
    .getByRole("button", { name: "Início", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Converter RPFs", exact: false })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Seus recursos estão prontos" })
    .waitFor();
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 680),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: path.join(screenshots, "04-compacto.png") });
  await stop();

  const quickFolder = path.join(temporary, "quick");
  await mkdir(quickFolder);
  await writeFile(path.join(quickFolder, "quick.rpf"), original);
  page = await start([quickFolder]);
  await page.getByRole("heading", { name: "Confira a saída" }).waitFor();
  assert.equal(
    await page.getByRole("navigation").count(),
    0,
    "Quick actions must not load the app navbar",
  );
  assert.equal(
    (await page.evaluate(() => window.rpforge.profile())).displayName,
    "Pessoa de teste",
    "Quick actions require the current authenticated account",
  );
  assert.equal(
    await application.evaluate(
      () => globalThis.__forgeDiagnostics().profileRequests,
    ),
    0,
    "Quick actions must not make profile/version requests",
  );
  assert.equal(await page.getByRole("textbox").count(), 0);
  await page.screenshot({ path: path.join(screenshots, "05-acao-rapida.png") });
  assert.deepEqual(await readdir(quickFolder), ["quick.rpf"]);
  await page.getByRole("button", { name: "Converter agora" }).click();
  await page
    .getByRole("heading", { name: "Seus recursos estão prontos" })
    .waitFor();
  assert.ok(await readFile(path.join(quickFolder, "car/fxmanifest.lua")));
  await idle();
  await stop();

  page = await start(["--ytyp", path.join(fixtures, "props")]);
  await page
    .getByRole("heading", { name: "YTYP gerado", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("navigation").count(), 0);
  await idle();
  await page.screenshot({ path: path.join(screenshots, "06-ytyp-rapido.png") });
  assert.equal(
    (await readdir(path.join(fixtures, "props"))).filter((name) =>
      name.endsWith(".ytyp"),
    ).length,
    2,
    "Existing YTYP must be preserved",
  );
  await stop();
  console.log(
    "PASS: Electron + Next, tools/search, spawn edits, reviewed conversion, isolated state, compact actions, YTYP preservation and worker cleanup.",
  );
} catch (error) {
  if (application) {
    const pages = application.windows();
    if (pages[0]) {
      await pages[0]
        .screenshot({ path: path.join(screenshots, "failure.png") })
        .catch(() => {});
      console.error(
        (
          await pages[0]
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(0, 2500),
      );
    }
  }
  throw error;
} finally {
  await stop();
  // This directory is created above, contains only synthetic fixtures and test profiles.
  if (!temporary.startsWith(path.join(os.tmpdir(), "rpforge-electron-")))
    throw new Error("Unexpected test cleanup path");
  await rm(temporary, { recursive: true, force: true });
  if (documentationPrefix) {
    if (!fixtures.startsWith(documentationPrefix)) throw new Error('Unexpected documentation fixture cleanup path');
    await rm(fixtures, { recursive: true, force: true });
  }
}
